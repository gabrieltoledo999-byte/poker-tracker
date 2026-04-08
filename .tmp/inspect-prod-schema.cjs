const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [cols] = await conn.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    ['users'],
  );
  console.log(cols.map((column) => column.COLUMN_NAME).join('\n'));

  const [migrations] = await conn.query('SELECT * FROM __drizzle_migrations ORDER BY id');
  console.log('---MIGRATIONS---');
  console.log(JSON.stringify(migrations, null, 2));

  await conn.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
