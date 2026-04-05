/**
 * seed-users-migration.mjs
 *
 * Migração completa de usuários e sessões para o banco MySQL Railway.
 * Dados extraídos do Relatório de Usuários e Histórico Completo de Jogadas (05/04/2026).
 *
 * SEGURO: INSERT IGNORE para usuários, verificação de duplicatas para sessões.
 * Uso: node server/seed-users-migration.mjs
 */

import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set. Crie um .env com DATABASE_URL=mysql://...");
  process.exit(1);
}

function parseMysqlUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, ""),
    ssl: u.searchParams.get("ssl") === "true" ? { rejectUnauthorized: false } : undefined,
  };
}

// Converte "DD/MM/YYYY" para "YYYY-MM-DD 12:00:00"
function parseDate(str) {
  const [d, m, y] = str.split("/");
  return `${y}-${m}-${d} 12:00:00`;
}

// Converte valor decimal (ex: 20.00) para centavos inteiros (2000)
function toCents(value) {
  return Math.round(value * 100);
}

// Taxa de câmbio aproximada USD/BRL em março/abril 2026 ≈ 5.85
const EXCHANGE_RATE = 5.85;
const EXCHANGE_RATE_STORED = Math.round(EXCHANGE_RATE * 10000); // 58500

// Converte centavos USD para centavos BRL
function usdToBrl(usdCents) {
  return Math.round(usdCents * EXCHANGE_RATE);
}

// ─────────────────────────────────────────────────────────────────────────────
// DADOS DOS USUÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

const USERS = [
  {
    openId: "Tvc7DtzCsKuzpb4QtxRnMB",
    name: "GabrielToledo",
    email: "gabriel.toledo999@gmail.com",
    loginMethod: "google",
    role: "admin",
    inviteCode: "7nKnb3-t",
    createdAt: "2025-12-09 00:00:00",
    lastSignedIn: "2026-04-05 00:00:00",
    // bankroll: online R$216,30 / live R$1.000,00
    bankroll: { initialOnline: 21630, initialLive: 100000 },
  },
  {
    openId: "95ETYo5doabBWQHipRSGgv",
    name: "Hugo Vigil",
    email: "hugoa_vigil@hotmail.com",
    loginMethod: "google",
    role: "user",
    inviteCode: "ThXpQY5I",
    createdAt: "2025-12-27 00:00:00",
    lastSignedIn: "2026-04-05 00:00:00",
    bankroll: null,
  },
  {
    openId: "NDgyxiLe4jjL5nXmCj4Fmu",
    name: "fehressude",
    email: "fehressude@gmail.com",
    loginMethod: "email",
    role: "user",
    inviteCode: null,
    createdAt: "2026-03-06 00:00:00",
    lastSignedIn: "2026-04-04 00:00:00",
    bankroll: null,
  },
  {
    openId: "W4qZf5ohtAnWNtar8c7U7R",
    name: "Filipe Silva",
    email: "filipe.souza10@hotmail.com",
    loginMethod: "oauth",
    role: "user",
    inviteCode: "-uosWF_H",
    createdAt: "2026-03-12 00:00:00",
    lastSignedIn: "2026-04-05 00:00:00",
    bankroll: null,
  },
  {
    openId: "L3RWcHrM2aSCoSrAnhzZ6F",
    name: "Fernanda Ruas",
    email: "ruasfernanda07@icloud.com",
    loginMethod: "apple",
    role: "user",
    inviteCode: null,
    createdAt: "2026-03-12 00:00:00",
    lastSignedIn: "2026-03-12 00:00:00",
    bankroll: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SESSÕES — Hugo Vigil (81 sessões, padrão: online / torneio)
// ─────────────────────────────────────────────────────────────────────────────
// currency: "BRL" | "USD"
// Para USD: buyIn/cashOut armazenados em centavos BRL (convertidos), original em cents USD

function brl(buyIn, cashOut, date, location, durationMinutes) {
  return {
    type: "online", gameFormat: "tournament", currency: "BRL",
    buyIn: toCents(buyIn), cashOut: toCents(cashOut),
    originalBuyIn: null, originalCashOut: null, exchangeRate: null,
    sessionDate: parseDate(date), durationMinutes, location,
  };
}

function usd(buyIn, cashOut, date, location, durationMinutes) {
  const biCents = toCents(buyIn);
  const coCents = toCents(cashOut);
  return {
    type: "online", gameFormat: "tournament", currency: "USD",
    buyIn: usdToBrl(biCents), cashOut: usdToBrl(coCents),
    originalBuyIn: biCents, originalCashOut: coCents, exchangeRate: EXCHANGE_RATE_STORED,
    sessionDate: parseDate(date), durationMinutes, location,
  };
}

const HUGO_SESSIONS = [
  brl(20.00, 53.21,   "11/03/2026", "888poker",      120),
  usd( 5.40, 24.10,   "12/03/2026", null,             60),
  brl(30.00,  0.00,   "12/03/2026", "888poker",      120),
  brl(20.00,  0.00,   "12/03/2026", "888poker",       60),
  brl(30.00,  0.00,   "12/03/2026", "888poker",      180),
  usd( 2.50,  0.00,   "12/03/2026", "GGPoker",       240),
  usd( 5.40,  0.00,   "12/03/2026", "GGPoker",       120),
  brl(50.00,  0.00,   "12/03/2026", "888poker",      121),
  brl(30.00,  0.00,   "12/03/2026", "888poker",      120),
  usd( 3.20, 13.18,   "12/03/2026", "GGPoker",       180),
  usd( 1.00,  2.70,   "12/03/2026", "GGPoker",       120),
  usd( 3.20,  1.50,   "13/03/2026", "GGPoker",        60),
  brl(35.00,  0.00,   "13/03/2026", "888poker",      180),
  usd( 3.20,  0.01,   "13/03/2026", "GGPoker",        60),
  usd( 5.40,  0.00,   "14/03/2026", "GGPoker",        60),
  brl(15.00, 51.60,   "14/03/2026", "CoinPoker",     120),
  brl(30.00, 52.45,   "14/03/2026", "CoinPoker",     180),
  brl(35.00,290.05,   "14/03/2026", "CoinPoker",     180),
  brl(30.00,  0.00,   "14/03/2026", "CoinPoker",     300),
  usd( 2.50,  4.29,   "15/03/2026", "GGPoker",        60),
  usd( 2.50,  4.46,   "15/03/2026", "GGPoker",        60),
  brl(20.00,  0.00,   "16/03/2026", "888poker",       60),
  brl(30.00,  0.00,   "16/03/2026", "888poker",       60),
  usd( 2.50,  6.98,   "18/03/2026", "GGPoker",        60),
  usd( 5.40,  0.00,   "18/03/2026", "GGPoker",        60),
  usd( 4.40,  0.00,   "18/03/2026", "GGPoker",        60),
  usd( 3.20,  0.00,   "18/03/2026", "GGPoker",        60),
  brl(50.00,125.55,   "18/03/2026", "888poker",      180),
  brl(20.00, 30.25,   "18/03/2026", "888poker",      120),
  usd( 5.40,  0.00,   "18/03/2026", "GGPoker",       240),
  usd( 4.40,  0.03,   "18/03/2026", "GGPoker",       120),
  usd( 2.50,  0.00,   "19/03/2026", "GGPoker",       120),
  brl(20.00, 31.75,   "19/03/2026", "CoinPoker",     120),
  usd( 4.40,  0.00,   "19/03/2026", "GGPoker",       120),
  usd( 3.20,  0.00,   "19/03/2026", "GGPoker",        60),
  usd( 5.40, 13.78,   "19/03/2026", "GGPoker",       180),
  usd( 5.00,  0.00,   "19/03/2026", "GGPoker",       120),
  brl(20.00,  0.00,   "19/03/2026", "CoinPoker",     120),
  usd( 8.80,  0.00,   "19/03/2026", "GGPoker",       120),
  brl(30.00,1676.10,  "19/03/2026", "CoinPoker",     240),
  usd( 4.40,  0.00,   "19/03/2026", "GGPoker",        60),
  usd( 3.20,  0.00,   "19/03/2026", "GGPoker",       120),
  usd( 2.50,  0.00,   "20/03/2026", "GGPoker",        60),
  usd( 5.40,  0.00,   "20/03/2026", "GGPoker",        60),
  brl(50.00,  0.00,   "20/03/2026", "CoinPoker",      60),
  brl(30.00,  0.00,   "20/03/2026", "888poker",       60),
  usd( 5.40,  0.00,   "20/03/2026", "GGPoker",        60),
  usd( 8.88, 20.68,   "20/03/2026", "GGPoker",        60),
  usd( 2.50,  0.00,   "20/03/2026", "GGPoker",        60),
  brl(20.00,  0.00,   "20/03/2026", "888poker",       60),
  brl(35.00,  0.00,   "20/03/2026", "888poker",       60),
  brl(20.00,  0.00,   "20/03/2026", "888poker",       60),
  brl(30.00,2365.00,  "21/03/2026", "888poker",      240),
  brl(50.00,  0.00,   "22/03/2026", "888poker",       60),
  usd( 4.40,  0.00,   "23/03/2026", "PokerStars",     60),
  usd( 8.88,  0.00,   "23/03/2026", "GGPoker",        60),
  usd( 5.40,  0.00,   "23/03/2026", null,            120),
  usd( 5.40,  0.00,   "28/03/2026", "GGPoker",        60),
  usd( 2.50,  0.00,   "28/03/2026", "GGPoker",        60),
  usd( 2.50,  0.00,   "28/03/2026", "GGPoker",        60),
  brl(20.00,  0.00,   "28/03/2026", "888poker",       60),
  brl(30.00,  0.00,   "28/03/2026", "888poker",       60),
  usd( 6.00,  0.00,   "31/03/2026", "GGPoker",        60),
  brl(30.00,581.00,   "31/03/2026", "888poker",      240),
  brl(20.00,  0.00,   "31/03/2026", "888poker",       60),
  brl(20.00,  0.00,   "31/03/2026", "888poker",       60),
  usd( 5.40,  0.00,   "31/03/2026", "GGPoker",        60),
  brl(100.00,118.00,  "02/04/2026", "888poker",       60),
  brl(70.00, 103.00,  "02/04/2026", "CoinPoker",      60),
  brl(50.00,  0.00,   "02/04/2026", "888poker",       60),
  brl(35.00,  0.00,   "02/04/2026", "CoinPoker",      60),
  brl(30.00,  0.00,   "02/04/2026", "888poker",       60),
  brl(20.00,  0.00,   "03/04/2026", "888poker",       60),
  brl(30.00,  0.00,   "03/04/2026", "888poker",       60),
  usd( 2.50,  0.00,   "03/04/2026", null,             60),
  usd( 2.50,  0.00,   "03/04/2026", "GGPoker",        60),
  brl(50.00,  0.00,   "03/04/2026", "888poker",       60),
  brl(35.00,  0.00,   "04/04/2026", "CoinPoker",      60),
  brl(30.00, 445.65,  "04/04/2026", "888poker",      240),
  brl(118.20,147.40,  "05/04/2026", "GGPoker",         2),
  brl(30.00,  0.00,   "05/04/2026", "Suprema Poker",   7),
];

// ─────────────────────────────────────────────────────────────────────────────
// SESSÕES — fehressude (3 sessões, Sit & Go, USD)
// ─────────────────────────────────────────────────────────────────────────────

function usdSng(buyIn, cashOut, date, location, durationMinutes) {
  const biCents = toCents(buyIn);
  const coCents = toCents(cashOut);
  return {
    type: "online", gameFormat: "sit_and_go", currency: "USD",
    buyIn: usdToBrl(biCents), cashOut: usdToBrl(coCents),
    originalBuyIn: biCents, originalCashOut: coCents, exchangeRate: EXCHANGE_RATE_STORED,
    sessionDate: parseDate(date), durationMinutes, location,
  };
}

const FEHRESSUDE_SESSIONS = [
  usdSng(0.50, 1.03, "10/03/2026", "PokerStars", 30),
  usdSng(0.50, 3.70, "11/03/2026", "PokerStars", 44),
  usdSng(0.50, 0.00, "11/03/2026", "PokerStars",  5),
];

// ─────────────────────────────────────────────────────────────────────────────
// SESSÕES — Filipe Silva (3 sessões, USD)
// ─────────────────────────────────────────────────────────────────────────────

const FILIPE_SESSIONS = [
  {
    type: "online", gameFormat: "cash_game", currency: "USD",
    buyIn: usdToBrl(200), cashOut: usdToBrl(0),
    originalBuyIn: 200, originalCashOut: 0, exchangeRate: EXCHANGE_RATE_STORED,
    sessionDate: parseDate("13/03/2026"), durationMinutes: 30, location: "PokerStars",
  },
  {
    type: "online", gameFormat: "freeroll", currency: "USD",
    buyIn: usdToBrl(1), cashOut: usdToBrl(137),
    originalBuyIn: 1, originalCashOut: 137, exchangeRate: EXCHANGE_RATE_STORED,
    sessionDate: parseDate("13/03/2026"), durationMinutes: 15, location: "PokerStars",
  },
  {
    type: "online", gameFormat: "cash_game", currency: "USD",
    buyIn: usdToBrl(181), cashOut: usdToBrl(0),
    originalBuyIn: 181, originalCashOut: 0, exchangeRate: EXCHANGE_RATE_STORED,
    sessionDate: parseDate("13/03/2026"), durationMinutes: 5, location: "PokerStars",
  },
];

const USER_SESSIONS = {
  "95ETYo5doabBWQHipRSGgv": HUGO_SESSIONS,      // Hugo Vigil
  "NDgyxiLe4jjL5nXmCj4Fmu": FEHRESSUDE_SESSIONS, // fehressude
  "W4qZf5ohtAnWNtar8c7U7R": FILIPE_SESSIONS,     // Filipe Silva
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const conn = await createConnection({ ...parseMysqlUrl(DATABASE_URL), multipleStatements: false });
  console.log("✅  Conectado ao banco de dados\n");

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // 1. INSERIR USUÁRIOS (INSERT IGNORE — não sobrescreve existentes)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("👥  Inserindo usuários...");
    const userIdMap = {}; // openId → DB id

    for (const u of USERS) {
      // Verificar se já existe pelo openId
      const [existing] = await conn.execute(
        "SELECT id, name FROM users WHERE openId = ? LIMIT 1",
        [u.openId]
      );

      if (existing.length > 0) {
        console.log(`   ⚠️  ${u.name} já existe (ID ${existing[0].id}) — mantendo dados existentes`);
        userIdMap[u.openId] = existing[0].id;
        continue;
      }

      // Inserir novo usuário
      const [result] = await conn.execute(
        `INSERT INTO users (openId, name, email, loginMethod, role, inviteCode, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.openId, u.name, u.email, u.loginMethod, u.role,
          u.inviteCode ?? null,
          u.createdAt, u.createdAt, u.lastSignedIn,
        ]
      );
      userIdMap[u.openId] = result.insertId;
      console.log(`   ✅  ${u.name} inserido (ID ${result.insertId})`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. BANKROLL SETTINGS (GabrielToledo)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n💰  Configurando bankroll...");

    for (const u of USERS) {
      if (!u.bankroll) continue;
      const userId = userIdMap[u.openId];
      if (!userId) continue;

      const [existing] = await conn.execute(
        "SELECT id FROM bankroll_settings WHERE userId = ? LIMIT 1",
        [userId]
      );

      if (existing.length > 0) {
        console.log(`   ⚠️  ${u.name} já tem bankrollSettings — atualizando valores`);
        await conn.execute(
          "UPDATE bankroll_settings SET initialOnline = ?, initialLive = ? WHERE userId = ?",
          [u.bankroll.initialOnline, u.bankroll.initialLive, userId]
        );
      } else {
        await conn.execute(
          "INSERT INTO bankroll_settings (userId, initialOnline, initialLive, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())",
          [userId, u.bankroll.initialOnline, u.bankroll.initialLive]
        );
        console.log(`   ✅  ${u.name}: online R$${u.bankroll.initialOnline / 100} / live R$${u.bankroll.initialLive / 100}`);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. SESSÕES
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n🃏  Inserindo sessões...");

    for (const [openId, sessionList] of Object.entries(USER_SESSIONS)) {
      const userId = userIdMap[openId];
      if (!userId) {
        console.log(`   ⚠️  Usuário com openId ${openId} não encontrado, pulando sessões`);
        continue;
      }

      const userName = USERS.find(u => u.openId === openId)?.name ?? openId;

      // Contar sessões existentes
      const [countRows] = await conn.execute(
        "SELECT COUNT(*) as cnt FROM sessions WHERE userId = ?",
        [userId]
      );
      const existingCount = countRows[0].cnt;

      if (existingCount >= sessionList.length) {
        console.log(`   ⚠️  ${userName} já tem ${existingCount} sessões (esperado: ${sessionList.length}) — pulando`);
        continue;
      }

      console.log(`   📋  ${userName}: ${existingCount} existentes → inserindo ${sessionList.length - existingCount} novas...`);

      let inserted = 0;
      let skipped = 0;

      for (const s of sessionList) {
        // Verificar se já existe sessão com mesmos valores exatos
        const [dup] = await conn.execute(
          `SELECT id FROM sessions 
           WHERE userId = ? AND sessionDate = ? AND buyIn = ? AND cashOut = ? AND durationMinutes = ?
           LIMIT 1`,
          [userId, s.sessionDate, s.buyIn, s.cashOut, s.durationMinutes]
        );

        if (dup.length > 0) {
          skipped++;
          continue;
        }

        await conn.execute(
          `INSERT INTO sessions 
           (userId, type, gameFormat, currency, buyIn, cashOut, originalBuyIn, originalCashOut, exchangeRate,
            sessionDate, durationMinutes, location, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            userId, s.type, s.gameFormat, s.currency,
            s.buyIn, s.cashOut,
            s.originalBuyIn ?? null, s.originalCashOut ?? null, s.exchangeRate ?? null,
            s.sessionDate, s.durationMinutes, s.location ?? null,
          ]
        );
        inserted++;
      }

      console.log(`   ✅  ${userName}: ${inserted} sessões inseridas, ${skipped} duplicatas ignoradas`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. RESUMO FINAL
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n📊  Verificação final:");
    const [userCount] = await conn.execute("SELECT COUNT(*) as cnt FROM users");
    const [sessionCount] = await conn.execute("SELECT COUNT(*) as cnt FROM sessions");
    console.log(`   Usuários no banco: ${userCount[0].cnt}`);
    console.log(`   Sessões no banco: ${sessionCount[0].cnt}`);

    for (const u of USERS) {
      const uid = userIdMap[u.openId];
      if (!uid) continue;
      const [sc] = await conn.execute("SELECT COUNT(*) as cnt FROM sessions WHERE userId = ?", [uid]);
      console.log(`   ${u.name} (ID ${uid}): ${sc[0].cnt} sessões`);
    }

    console.log("\n🎉  Migração concluída com sucesso!");

  } catch (err) {
    console.error("❌  Erro durante migração:", err);
    throw err;
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
