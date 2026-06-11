import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const c = await mysql.createConnection(url);
  const [rows] = await c.execute(
    `SELECT s.slug, h.handCode, h.raisePctX10, h.limpCheckPctX10, h.foldPctX10
     FROM gto_baseado_hands h
     JOIN gto_baseado_scenarios s ON s.id = h.scenarioId
     WHERE h.handCode IN ('AA','KK','AKs','AKo','72o')
     ORDER BY s.slug, h.handCode`
  );
  console.table(rows);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
