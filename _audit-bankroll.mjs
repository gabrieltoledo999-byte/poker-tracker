// Auditoria de bankroll - Gabriel Toledo
// Uso: node _audit-bankroll.mjs
import mysql from 'mysql2/promise';

const URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
if (!URL) { console.error('defina DATABASE_URL'); process.exit(1); }
console.log('Conectando em:', URL.replace(/:[^:@]+@/, ':***@'));
const c = await mysql.createConnection({ uri: URL, connectTimeout: 20000 });

// 1. Achar usuário
const [users] = await c.execute(
  `SELECT id, username, email, name FROM users
   WHERE LOWER(username) LIKE '%gabriel%' OR LOWER(email) LIKE '%gabriel%'
      OR LOWER(name) LIKE '%gabriel%' OR LOWER(username) LIKE '%toledo%'
      OR LOWER(name) LIKE '%toledo%'
   LIMIT 20`
);
console.log('=== USUÁRIOS ENCONTRADOS ===');
console.table(users);

if (!users.length) { await c.end(); process.exit(0); }

// Escolhe o primeiro que tenha "toledo" ou "gabriel" no name
const user = users.find(u => /gabriel|toledo/i.test((u.name||'') + (u.username||''))) || users[0];
console.log(`\n>>> Usando userId = ${user.id} (${user.name || user.username})\n`);

// 2. Bankroll settings
const [bk] = await c.execute(
  `SELECT initial_online, initial_live FROM bankroll_settings WHERE user_id = ?`, [user.id]
);
console.log('=== BANKROLL SETTINGS (centavos) ===');
console.table(bk);

// 3. Todas sessões
const [sessions] = await c.execute(
  `SELECT id, type, game_format, tournament_name, buy_in, cash_out,
          (cash_out - buy_in) AS profit, session_date
   FROM sessions WHERE user_id = ?
   ORDER BY session_date ASC`, [user.id]
);
console.log(`\n=== SESSÕES (${sessions.length} total, valores em centavos) ===`);
sessions.forEach(s => {
  console.log(
    `#${s.id}  ${new Date(s.session_date).toISOString().slice(0,10)}  ` +
    `${s.type.padEnd(6)} ${s.game_format.padEnd(12)} ` +
    `buyIn=${(s.buy_in/100).toFixed(2).padStart(10)}  ` +
    `cashOut=${(s.cash_out/100).toFixed(2).padStart(10)}  ` +
    `P/L=${(s.profit/100).toFixed(2).padStart(10)}  ` +
    `${s.tournament_name || ''}`
  );
});

// 4. Totais por tipo
const totalOnline = sessions.filter(s=>s.type==='online').reduce((a,s)=>a+s.profit,0);
const totalLive   = sessions.filter(s=>s.type==='live').reduce((a,s)=>a+s.profit,0);
const totalBuyIn  = sessions.reduce((a,s)=>a+s.buy_in,0);
const totalCashOut= sessions.reduce((a,s)=>a+s.cash_out,0);

console.log('\n=== RESUMO (R$) ===');
console.log(`Total buy-in   : R$ ${(totalBuyIn/100).toFixed(2)}`);
console.log(`Total cash-out : R$ ${(totalCashOut/100).toFixed(2)}`);
console.log(`P/L online     : R$ ${(totalOnline/100).toFixed(2)}`);
console.log(`P/L live       : R$ ${(totalLive/100).toFixed(2)}`);
console.log(`P/L TOTAL      : R$ ${((totalOnline+totalLive)/100).toFixed(2)}`);

// 5. Fund transactions (depósitos/saques)
const [funds] = await c.execute(
  `SELECT transaction_type, bankroll_type, amount, transaction_date, description
   FROM fund_transactions WHERE user_id = ? ORDER BY transaction_date ASC`, [user.id]
);
console.log(`\n=== FUND TRANSACTIONS (${funds.length}) ===`);
console.table(funds.map(f=>({
  data: new Date(f.transaction_date).toISOString().slice(0,10),
  tipo: f.transaction_type,
  bankroll: f.bankroll_type,
  valor: (f.amount/100).toFixed(2),
  desc: f.description
})));

// 6. Bankroll atual conforme backend calcula
const initOnline = bk[0]?.initial_online ?? 0;
const initLive   = bk[0]?.initial_live ?? 0;
const fundOnlineNet = funds.filter(f=>f.bankroll_type==='online')
  .reduce((a,f)=>a + (f.transaction_type==='deposit'?f.amount:-f.amount),0);
const fundLiveNet = funds.filter(f=>f.bankroll_type==='live')
  .reduce((a,f)=>a + (f.transaction_type==='deposit'?f.amount:-f.amount),0);

const curOnline = initOnline + totalOnline + fundOnlineNet;
const curLive   = initLive + totalLive + fundLiveNet;

console.log('\n=== CÁLCULO ATUAL DO BACKEND (R$) ===');
console.log(`Online : inicial ${(initOnline/100).toFixed(2)} + lucro ${(totalOnline/100).toFixed(2)} + fund ${(fundOnlineNet/100).toFixed(2)} = ${(curOnline/100).toFixed(2)}`);
console.log(`Live   : inicial ${(initLive/100).toFixed(2)} + lucro ${(totalLive/100).toFixed(2)} + fund ${(fundLiveNet/100).toFixed(2)} = ${(curLive/100).toFixed(2)}`);
console.log(`TOTAL  : R$ ${((curOnline+curLive)/100).toFixed(2)}`);

await c.end();
