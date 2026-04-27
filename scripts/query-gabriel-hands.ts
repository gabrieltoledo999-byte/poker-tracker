import { drizzle } from "drizzle-orm/mysql2";
import { count, desc, eq, like } from "drizzle-orm";
import { users, centralHands, centralTournaments } from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing in environment");
  }

  const db = drizzle(databaseUrl);
  const target = "Gabriel Toledo";

  const exact = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.name, target))
    .limit(1);

  const user = exact[0] ?? (await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(like(users.name, "%Gabriel%"))
    .limit(1))[0];

  if (!user) {
    const candidates = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(like(users.name, "%Gabriel%"))
      .limit(10);

    console.log(JSON.stringify({ found: false, candidates }, null, 2));
    return;
  }

  const handCount = await db
    .select({ value: count() })
    .from(centralHands)
    .where(eq(centralHands.userId, user.id));

  const tournamentCount = await db
    .select({ value: count() })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, user.id));

  const latestTournaments = await db
    .select({
      id: centralTournaments.id,
      externalTournamentId: centralTournaments.externalTournamentId,
      rawSourceId: centralTournaments.rawSourceId,
      totalHands: centralTournaments.totalHands,
      importedAt: centralTournaments.importedAt,
    })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, user.id))
    .orderBy(desc(centralTournaments.importedAt))
    .limit(12);

  const handsByTournament = await db
    .select({ tournamentId: centralHands.tournamentId, hands: count() })
    .from(centralHands)
    .where(eq(centralHands.userId, user.id))
    .groupBy(centralHands.tournamentId);

  console.log(
    JSON.stringify(
      {
        found: true,
        user,
        totalHandsInCentralHands: Number(handCount[0]?.value ?? 0),
        totalTournamentsInCentral: Number(tournamentCount[0]?.value ?? 0),
        latestTournaments,
        handsByTournament,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
