import mysql from "mysql2/promise";

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function connectWithRetry(maxAttempts = 6) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const conn = await mysql.createConnection({
        host: process.env.RAILWAY_TCP_PROXY_DOMAIN,
        port: Number(process.env.RAILWAY_TCP_PROXY_PORT),
        user: process.env.MYSQLUSER || "root",
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || "railway",
        connectTimeout: 12000,
      });
      return conn;
    } catch (e) {
      lastErr = e;
      console.log(`connect attempt ${i} failed: ${e.code || e.message}`);
      await sleep(1500);
    }
  }
  throw lastErr;
}

const conn = await connectWithRetry();

try {
  await conn.beginTransaction();

  const [u5Rows] = await conn.query("SELECT id FROM users WHERE id = 5 FOR UPDATE");
  if (u5Rows.length === 0) {
    await conn.query(
      `INSERT INTO users (id, openId, name, email, passwordHash, avatarUrl, loginMethod, role, inviteCode, invitedBy, inviteCount, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [5, "orphaned_5_1775431940286", "GabrielToledo", null, null, null, "google", "user", null, null, 0, "2026-04-05 07:42:40", "2026-04-05 07:42:40", "2026-04-05 09:09:37"]
    );
    console.log("user id=5 restored");
  } else {
    console.log("user id=5 already exists");
  }

  const [v5Rows] = await conn.query("SELECT COUNT(*) c FROM venues WHERE userId = 5");
  if (Number(v5Rows[0].c) === 0) {
    const [copyRes] = await conn.query(
      `INSERT INTO venues (userId, name, type, logoUrl, isPreset, currency, balance, website, address, notes, createdAt, updatedAt)
       SELECT 5, name, type, logoUrl, isPreset, currency, balance, website, address, notes, createdAt, updatedAt
       FROM venues WHERE userId = 207`
    );
    console.log(`venues restored: ${copyRes.affectedRows}`);
  } else {
    console.log(`venues already present for id=5: ${v5Rows[0].c}`);
  }

  await conn.commit();
} catch (e) {
  await conn.rollback();
  console.error("restore failed:", e.code || e.message);
  process.exit(1);
}

const [verifyUsers] = await conn.query("SELECT id,name,email,openId,loginMethod FROM users WHERE id IN (5,207) ORDER BY id");
const [verifyVenues] = await conn.query("SELECT userId, COUNT(*) total FROM venues WHERE userId IN (5,207) GROUP BY userId ORDER BY userId");
console.log("verify users:", JSON.stringify(verifyUsers, null, 2));
console.log("verify venues:", JSON.stringify(verifyVenues, null, 2));

await conn.end();
