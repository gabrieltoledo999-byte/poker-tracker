const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const checks = [
    {
      label: 'admin@therailapp.company',
      sql: `SELECT id, name, email, openId FROM users WHERE LOWER(COALESCE(email, '')) = ?`,
      params: ['admin@therailapp.company'],
    },
    {
      label: 'Xnockzer (name)',
      sql: `SELECT id, name, email, openId FROM users WHERE LOWER(COALESCE(name, '')) = ?`,
      params: ['xnockzer'],
    },
    {
      label: 'openId antigo do Xnockzer',
      sql: `SELECT id, name, email, openId FROM users WHERE LOWER(COALESCE(openId, '')) = ?`,
      params: ['local_1777060363274_03x0xhvt4nm9'],
    },
  ];

  for (const check of checks) {
    const [rows] = await conn.query(check.sql, check.params);
    console.log(`CHECK: ${check.label}`);
    console.log(`FOUND: ${rows.length}`);
    if (rows.length) console.log(rows);
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
