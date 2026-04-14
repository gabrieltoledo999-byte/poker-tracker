import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check all tables and their row counts
const [tables] = await conn.query('SHOW TABLES');
const tableNames = tables.map(row => Object.values(row)[0]);
console.log('TABLES:', tableNames);

for (const table of tableNames) {
  const [rows] = await conn.query(`SELECT COUNT(*) as count FROM \`${table}\``);
  console.log(`${table}: ${rows[0].count} rows`);
}

await conn.end();
