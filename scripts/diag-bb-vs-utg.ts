import mysql from "mysql2/promise";

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);
  const [r1] = await c.execute(
    "SELECT slug, totalCombos, weightedRaisePctX10/10 as raise_pct, weightedLimpCheckPctX10/10 as call_pct, weightedFoldPctX10/10 as fold_pct FROM gto_baseado_scenarios WHERE slug = 'gto-bb-vs-utg-rfi-100bb'"
  );
  console.log("SCENARIO:");
  console.table(r1);
  const [r2] = await c.execute(
    `SELECT handCode, raisePctX10/10 as r, limpCheckPctX10/10 as ca, foldPctX10/10 as f
     FROM gto_baseado_hands
     WHERE scenarioId = (SELECT id FROM gto_baseado_scenarios WHERE slug='gto-bb-vs-utg-rfi-100bb')
     AND handCode IN ('AA','KK','QQ','AKs','AKo','AQs','ATs','72o')
     ORDER BY handCode`
  );
  console.log("HANDS:");
  console.table(r2);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
