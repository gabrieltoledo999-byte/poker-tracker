import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { refreshUserAbiAggregates } from "../server/centralMemory";
import { centralTournaments } from "../drizzle/schema";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      userId: centralTournaments.userId,
      tournaments: sql<number>`COUNT(*)`,
    })
    .from(centralTournaments)
    .groupBy(centralTournaments.userId);

  console.log(`users_with_tournaments=${rows.length}`);

  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const userId = Number(row.userId);
    const tournaments = Number(row.tournaments ?? 0);

    try {
      await refreshUserAbiAggregates(userId);
      ok += 1;
      console.log(`recalc_ok userId=${userId} tournaments=${tournaments}`);
    } catch (error) {
      fail += 1;
      console.error(`recalc_fail userId=${userId} tournaments=${tournaments}`, error);
    }
  }

  console.log(`done ok=${ok} fail=${fail}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
