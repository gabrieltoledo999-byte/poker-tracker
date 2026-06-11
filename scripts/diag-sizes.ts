import mysql from "mysql2/promise";
async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);
  const [r] = await c.execute(
    `SELECT slug, openSizeBbX10/10 as open_bb, threeBetSizeBbX10/10 as three_bet_bb
     FROM gto_baseado_scenarios
     WHERE slug IN ('gto-rfi-utg-100bb','gto-bb-vs-utg-rfi-100bb','gto-mp-vs-utg-rfi-100bb','gto-rfi-btn-100bb','gto-bb-vs-btn-rfi-100bb')
     ORDER BY slug`
  );
  console.table(r);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
