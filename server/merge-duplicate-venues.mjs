/**
 * merge-duplicate-venues.mjs
 *
 * Mescla venues duplicadas no banco sem perder dados dos usuários:
 *  - Duplicatas exatas (mesmo nome, mesmo usuário)
 *  - Aliases conhecidos: "Suprema" → "Suprema Poker", etc.
 *
 * Para cada grupo duplicado:
 *  1. Mantém a venue canônica (isPreset=1 ou nome canônico ou menor id)
 *  2. Re-aponta sessions.venueId, session_tables.venueId,
 *     venue_balance_history.venueId para o id canônico
 *  3. Soma o balance da duplicata na canônica
 *  4. Deleta a venue duplicada
 *
 * SEGURO: não apaga sessões nem dados financeiros.
 *
 * Uso: node server/merge-duplicate-venues.mjs
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

// Map from alias (lowercased, trimmed) → canonical name
const ALIAS_MAP = {
  "suprema": "Suprema Poker",
  "suprema poker": "Suprema Poker",
  "gg poker": "GG Poker",
  "ggpoker": "GG Poker",
  "pp poker": "PP Poker",
  "pppoker": "PP Poker",
  "pokerstars": "PokerStars",
  "poker stars": "PokerStars",
  "888 poker": "888poker",
  "poker bros": "PokerBros",
  "kk poker": "KKPoker",
  "wpt global": "WPT Global",
  "x poker": "X-Poker",
};

function canonicalName(name) {
  const key = name.toLowerCase().trim();
  return ALIAS_MAP[key] ?? name;
}

// Groups venues into merge groups: returns array of { canonical, duplicates[] }
function groupDuplicates(venues) {
  // Map: canonical name → list of venue rows
  const grouped = new Map();
  for (const v of venues) {
    const canon = canonicalName(v.name);
    if (!grouped.has(canon)) grouped.set(canon, []);
    grouped.get(canon).push(v);
  }

  const groups = [];
  for (const [canonName, group] of grouped.entries()) {
    if (group.length < 2) continue; // no duplicates

    // Pick canonical: prefer isPreset=1, then prefer name matching canonName exactly, then lowest id
    group.sort((a, b) => {
      if (b.isPreset !== a.isPreset) return b.isPreset - a.isPreset;
      const aExact = a.name === canonName ? 0 : 1;
      const bExact = b.name === canonName ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.id - b.id;
    });

    const [canonical, ...duplicates] = group;
    groups.push({ canonName, canonical, duplicates });
  }
  return groups;
}

async function mergeVenue(conn, userId, canonical, dup, dryRun) {
  const log = (msg) => console.log(`      ${msg}`);

  log(`MERGE venue id=${dup.id} ("${dup.name}") → id=${canonical.id} ("${canonical.name}")`);

  if (dryRun) {
    // Count affected rows
    const [[{ cnt: sCnt }]] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM sessions WHERE userId=? AND venueId=?",
      [userId, dup.id]
    );
    const [[{ cnt: stCnt }]] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM session_tables WHERE userId=? AND venueId=?",
      [userId, dup.id]
    );
    const [[{ cnt: vbCnt }]] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM venue_balance_history WHERE userId=? AND venueId=?",
      [userId, dup.id]
    );
    log(`  DRY-RUN: would update ${sCnt} sessions, ${stCnt} session_tables, ${vbCnt} balance history rows`);
    log(`  DRY-RUN: would add balance ${dup.balance} to canonical (current balance: ${canonical.balance})`);
    return;
  }

  // 1. Re-point sessions
  await conn.execute(
    "UPDATE sessions SET venueId=? WHERE userId=? AND venueId=?",
    [canonical.id, userId, dup.id]
  );

  // 2. Re-point session_tables
  await conn.execute(
    "UPDATE session_tables SET venueId=? WHERE userId=? AND venueId=?",
    [canonical.id, userId, dup.id]
  );

  // 3. Re-point venue_balance_history
  await conn.execute(
    "UPDATE venue_balance_history SET venueId=? WHERE userId=? AND venueId=?",
    [canonical.id, userId, dup.id]
  );

  // 4. Merge balance into canonical
  if (dup.balance !== 0) {
    await conn.execute(
      "UPDATE venues SET balance = balance + ? WHERE id=?",
      [dup.balance, canonical.id]
    );
    log(`  ✔ Added balance ${dup.balance} to canonical`);
  }

  // 5. Delete the duplicate venue
  await conn.execute("DELETE FROM venues WHERE id=?", [dup.id]);
  log(`  ✔ Deleted duplicate venue id=${dup.id}`);
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("\n⚠️  DRY-RUN mode — nenhuma alteração será feita\n");

  const conn = await createConnection({ ...parseMysqlUrl(DATABASE_URL), multipleStatements: false });
  console.log("✅  Connected to database");

  try {
    const [users] = await conn.execute("SELECT id, name FROM users");
    console.log(`\n👥  Found ${users.length} user(s)\n`);

    let totalMerged = 0;

    for (const user of users) {
      const [venues] = await conn.execute(
        "SELECT id, name, isPreset, balance, currency FROM venues WHERE userId=? ORDER BY id ASC",
        [user.id]
      );

      const groups = groupDuplicates(venues);
      if (groups.length === 0) {
        console.log(`── User ${user.id} (${user.name}): nenhuma duplicata encontrada`);
        continue;
      }

      console.log(`\n── User ${user.id} (${user.name}): ${groups.length} grupo(s) de duplicata(s)`);
      for (const { canonName, canonical, duplicates } of groups) {
        console.log(`   Canon: "${canonName}" → keepId=${canonical.id}`);
        for (const dup of duplicates) {
          await mergeVenue(conn, user.id, canonical, dup, dryRun);
          totalMerged++;
        }
      }
    }

    console.log(`\n✅  Concluído: ${totalMerged} venue(s) mesclada(s) ${dryRun ? "(dry-run)" : ""}`);
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("❌  Fatal:", err);
  process.exit(1);
});
