require("dotenv").config({ path: ".env" });
const mysql = require("mysql2/promise");

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  const conn = await mysql.createConnection(url);

  const [tables] = await conn.query(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND (
          LOWER(table_name) LIKE '%favorite%'
          OR LOWER(table_name) LIKE '%replay%'
          OR LOWER(table_name) LIKE '%memory%'
          OR LOWER(table_name) LIKE '%review%'
        )
      ORDER BY table_name ASC`
  );

  const inspect = [];

  for (const t of tables) {
    const tableName = t.tableName;
    const [cols] = await conn.query(
      `SELECT column_name AS columnName, data_type AS dataType
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ordinal_position ASC`,
      [tableName]
    );

    let count = null;
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``);
      count = Number(rows?.[0]?.c ?? 0);
    } catch (_) {
      count = null;
    }

    inspect.push({ tableName, rowCount: count, columns: cols });
  }

  console.log(JSON.stringify({
    matchedTables: inspect.length,
    inspect,
  }, null, 2));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
