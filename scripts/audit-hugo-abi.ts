import { drizzle } from "drizzle-orm/mysql2";
import { eq, desc, sql } from "drizzle-orm";
import { users, centralTournaments, playerAggregateStats } from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");

  const db = drizzle(databaseUrl);
  const targetUserId = 208;

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  const tournaments = await db
    .select({
      id: centralTournaments.id,
      buyIn: centralTournaments.buyIn,
      fee: centralTournaments.fee,
      totalCost: centralTournaments.totalCost,
      currency: centralTournaments.currency,
      importedAt: centralTournaments.importedAt,
      externalTournamentId: centralTournaments.externalTournamentId,
      rawSourceId: centralTournaments.rawSourceId,
    })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, targetUserId))
    .orderBy(desc(centralTournaments.importedAt));

  const [aggregate] = await db
    .select({
      sampleTournaments: playerAggregateStats.sampleTournaments,
      sampleHands: playerAggregateStats.sampleHands,
      averageAbi: playerAggregateStats.averageAbi,
      medianAbi: playerAggregateStats.medianAbi,
      updatedAt: playerAggregateStats.updatedAt,
    })
    .from(playerAggregateStats)
    .where(eq(playerAggregateStats.userId, targetUserId))
    .orderBy(desc(playerAggregateStats.updatedAt))
    .limit(1);

  const total = tournaments.length;
  const nonZero = tournaments.filter((t) => Number(t.totalCost ?? 0) > 0);
  const zeroCost = tournaments.filter((t) => Number(t.totalCost ?? 0) <= 0);

  const avgAll = total > 0
    ? Math.round(tournaments.reduce((acc, t) => acc + Number(t.totalCost ?? 0), 0) / total)
    : 0;

  const avgNonZero = nonZero.length > 0
    ? Math.round(nonZero.reduce((acc, t) => acc + Number(t.totalCost ?? 0), 0) / nonZero.length)
    : 0;

  const [dbAvgAll] = await db
    .select({ avg: sql<number>`COALESCE(ROUND(AVG(${centralTournaments.totalCost})), 0)` })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, targetUserId));

  const [dbAvgNonZero] = await db
    .select({ avg: sql<number>`COALESCE(ROUND(AVG(${centralTournaments.totalCost})), 0)` })
    .from(centralTournaments)
    .where(sql`${centralTournaments.userId} = ${targetUserId} AND ${centralTournaments.totalCost} > 0`);

  console.log(JSON.stringify({
    user,
    aggregate,
    totals: {
      total,
      nonZero: nonZero.length,
      zeroCost: zeroCost.length,
    },
    averagesInCents: {
      aggregateAverageAbi: Number(aggregate?.averageAbi ?? 0),
      computedAvgAll: avgAll,
      computedAvgNonZero: avgNonZero,
      dbAvgAll: Number(dbAvgAll?.avg ?? 0),
      dbAvgNonZero: Number(dbAvgNonZero?.avg ?? 0),
    },
    averagesInMajor: {
      aggregateAverageAbi: Number(aggregate?.averageAbi ?? 0) / 100,
      computedAvgAll: avgAll / 100,
      computedAvgNonZero: avgNonZero / 100,
      dbAvgAll: Number(dbAvgAll?.avg ?? 0) / 100,
      dbAvgNonZero: Number(dbAvgNonZero?.avg ?? 0) / 100,
    },
    zeroCostTournaments: zeroCost.map((t) => ({
      id: t.id,
      buyIn: t.buyIn,
      fee: t.fee,
      totalCost: t.totalCost,
      currency: t.currency,
      importedAt: t.importedAt,
      externalTournamentId: t.externalTournamentId,
      rawSourceId: t.rawSourceId,
    })),
    latest10: tournaments.slice(0, 10).map((t) => ({
      id: t.id,
      buyIn: t.buyIn,
      fee: t.fee,
      totalCost: t.totalCost,
      currency: t.currency,
      importedAt: t.importedAt,
    })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
