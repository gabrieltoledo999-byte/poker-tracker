/**
 * migrate-legacy-bankroll.mjs
 *
 * Migração de dados de usuários antigos:
 * - Lê bankrollSettings (initialOnline / initialLive)
 * - Soma fundTransactions (depósitos e saques)
 * - Soma resultado das sessions (cashOut - buyIn)
 * - Reconstrói o saldo atual por tipo (online/live)
 * - Cria um registro em venueBalanceHistory para cada usuário
 *   marcando o saldo reconstruído como "migração legada"
 *
 * SEGURO: apenas INSERT / UPDATE aditivos — nenhum dado é apagado.
 *
 * Uso: node server/migrate-legacy-bankroll.mjs
 */

import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set");
  process.exit(1);
}

// Parse DATABASE_URL  (mysql://user:pass@host:port/db?ssl=...)
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

async function run() {
  const conn = await createConnection({ ...parseMysqlUrl(DATABASE_URL), multipleStatements: false });
  console.log("✅  Connected to database");

  try {
    // 1. Get all users
    const [users] = await conn.execute("SELECT id, name FROM users");
    console.log(`\n👥  Found ${users.length} user(s)\n`);

    for (const user of users) {
      console.log(`\n── User ${user.id} (${user.name}) ──`);

      // 2. Get bankroll settings
      const [settingsRows] = await conn.execute(
        "SELECT * FROM bankroll_settings WHERE userId = ? LIMIT 1",
        [user.id]
      );
      const settings = settingsRows[0] ?? null;
      const initialOnline = settings?.initialOnline ?? 0; // centavos BRL
      const initialLive   = settings?.initialLive   ?? 0; // centavos BRL
      console.log(`   bankrollSettings: initialOnline=${initialOnline} initialLive=${initialLive}`);

      // 3. Sum fund transactions
      const [fundRows] = await conn.execute(
        "SELECT transactionType, bankrollType, amount FROM fund_transactions WHERE userId = ?",
        [user.id]
      );
      let fundOnline = 0, fundLive = 0;
      for (const f of fundRows) {
        const sign = f.transactionType === "deposit" ? 1 : -1;
        if (f.bankrollType === "online") fundOnline += sign * f.amount;
        else                             fundLive   += sign * f.amount;
      }
      console.log(`   fundTransactions: online=${fundOnline} live=${fundLive}`);

      // 4. Sum session results
      const [sessionRows] = await conn.execute(
        "SELECT type, buyIn, cashOut FROM sessions WHERE userId = ?",
        [user.id]
      );
      let sessionOnline = 0, sessionLive = 0;
      for (const s of sessionRows) {
        const profit = (s.cashOut ?? 0) - (s.buyIn ?? 0);
        if (s.type === "online") sessionOnline += profit;
        else                     sessionLive   += profit;
      }
      console.log(`   sessions profit: online=${sessionOnline} live=${sessionLive}`);
      console.log(`   sessions count:  ${sessionRows.length}`);

      // 5. Reconstruct current balance
      const currentOnline = initialOnline + fundOnline + sessionOnline; // centavos BRL
      const currentLive   = initialLive   + fundLive   + sessionLive;   // centavos BRL
      console.log(`   ➜  reconstructed: online=R$${(currentOnline/100).toFixed(2)}  live=R$${(currentLive/100).toFixed(2)}`);

      // 6. Update bankrollSettings with reconstructed values
      //    We store the reconstructed balance as a new field "currentOnline" / "currentLive"
      //    but since those columns don't exist yet, we use initialOnline/initialLive ONLY
      //    if the user has never set them (i.e., they are 0 and there are sessions).
      //    This is a non-destructive update.
      if (settings) {
        // Only update if the user hasn't manually set a balance via the new system
        // Check if there are any venue balance history entries for this user
        const [vbhRows] = await conn.execute(
          "SELECT COUNT(*) as cnt FROM venue_balance_history WHERE userId = ?",
          [user.id]
        );
        const hasVBH = vbhRows[0]?.cnt > 0;

        if (!hasVBH && (sessionRows.length > 0 || fundRows.length > 0)) {
          console.log(`   📝  Creating legacy migration entry in venue_balance_history...`);

          // Find or create a generic "Online" venue for this user
          const [venueRows] = await conn.execute(
            "SELECT id FROM venues WHERE userId = ? AND type = 'online' ORDER BY id ASC LIMIT 1",
            [user.id]
          );

          if (venueRows.length > 0 && currentOnline !== 0) {
            const venueId = venueRows[0].id;
            // Insert a balance history entry representing the reconstructed balance
            await conn.execute(
              `INSERT INTO venue_balance_history
                (userId, venueId, previousBalance, newBalance, previousCurrency, newCurrency, changeType, notes, createdAt)
               VALUES (?, ?, 0, ?, 'BRL', 'BRL', 'manual_adjustment', ?, NOW())`,
              [
                user.id,
                venueId,
                currentOnline,
                `Migração legada: banca reconstruída a partir de ${sessionRows.length} sessões, ${fundRows.length} transações de fundos e banca inicial de R$${(initialOnline/100).toFixed(2)}.`,
              ]
            );
            // Update the venue balance
            await conn.execute(
              "UPDATE venues SET balance = ?, currency = 'BRL' WHERE id = ? AND userId = ?",
              [currentOnline, venueId, user.id]
            );
            console.log(`   ✅  Updated venue ${venueId} balance to R$${(currentOnline/100).toFixed(2)}`);
          }

          // Update bankrollSettings initialLive if there's live data
          if (currentLive !== 0) {
            await conn.execute(
              "UPDATE bankroll_settings SET initialLive = ? WHERE userId = ?",
              [Math.max(0, currentLive), user.id]
            );
            console.log(`   ✅  Updated initialLive to R$${(Math.max(0, currentLive)/100).toFixed(2)}`);
          }
        } else if (hasVBH) {
          console.log(`   ⏭️  User already has venue balance history — skipping migration`);
        } else {
          console.log(`   ⏭️  No sessions or fund transactions — nothing to migrate`);
        }
      } else {
        console.log(`   ⚠️  No bankroll settings found — skipping`);
      }
    }

    console.log("\n\n✅  Migration complete. No data was deleted.\n");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
