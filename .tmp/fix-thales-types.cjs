const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [users] = await conn.execute(
      'SELECT id FROM users WHERE LOWER(email)=? LIMIT 1',
      ['thalesyamadapc@gmail.com']
    );

    if (!users.length) {
      console.log('user not found');
      return;
    }

    const userId = users[0].id;

    const [r1] = await conn.execute(
      `UPDATE sessions s
       JOIN venues v ON v.id=s.venueId AND v.userId=s.userId
       SET s.type=v.type
       WHERE s.userId=? AND s.type<>v.type`,
      [userId]
    );

    const [r2] = await conn.execute(
      `UPDATE session_tables t
       JOIN venues v ON v.id=t.venueId AND v.userId=t.userId
       SET t.type=v.type
       WHERE t.userId=? AND t.type<>v.type`,
      [userId]
    );

    const [check] = await conn.execute(
      `SELECT s.id, s.type, v.type AS venueType, v.name
       FROM sessions s
       JOIN venues v ON v.id=s.venueId AND v.userId=s.userId
       WHERE s.userId=?
       ORDER BY s.id DESC
       LIMIT 20`,
      [userId]
    );

    console.log('updated sessions:', r1.affectedRows, 'updated tables:', r2.affectedRows);
    console.log(JSON.stringify(check, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
