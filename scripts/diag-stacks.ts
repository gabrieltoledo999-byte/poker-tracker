import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [r1] = await conn.query(
    "SELECT effectiveStackBb, COUNT(*) c FROM gto_baseado_scenarios GROUP BY effectiveStackBb ORDER BY effectiveStackBb",
  );
  console.log("stacks:", r1);
  const [r2] = await conn.query(
    "SELECT slug FROM gto_baseado_scenarios ORDER BY slug",
  );
  console.log("slugs:", r2);
  await conn.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
