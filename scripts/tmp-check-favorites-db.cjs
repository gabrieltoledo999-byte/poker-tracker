require("dotenv").config({ path: ".env" });
const mysql = require("mysql2/promise");
(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL ausente");
    return;
  }
  const conn = await mysql.createConnection(url);

  const [favTables] = await conn.query("SHOW TABLES LIKE '%favorite%'");
  console.log("favorite_tables:", favTables);

  const [users] = await conn.query("SELECT id, name, email, openId FROM users WHERE name LIKE '%Gabriel%' OR email LIKE '%gabriel%' OR openId LIKE '%gabriel%' LIMIT 20");
  console.log("user_candidates:", users);

  const [hrfCount] = await conn.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'hand_review_favorites'");
  const exists = Number(hrfCount?.[0]?.total || 0) > 0;
  console.log("hand_review_favorites_exists:", exists);

  if (exists) {
    const [hrfSample] = await conn.query("SELECT id, userId, label, handCount, createdAt FROM hand_review_favorites ORDER BY createdAt DESC LIMIT 50");
    console.log("hand_review_favorites_recent:", hrfSample);
  }

  const [replayTables] = await conn.query("SHOW TABLES LIKE '%replay%'");
  console.log("replay_tables:", replayTables);

  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
