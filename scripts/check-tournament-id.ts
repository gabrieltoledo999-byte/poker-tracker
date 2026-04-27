import { drizzle } from "drizzle-orm/mysql2";
import { and, desc, eq, or } from "drizzle-orm";
import { users, centralHands, centralTournaments } from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing");
  }

  const targetName = "GabrielToledo";
  const targetId = "260593231997";

  const db = drizzle(databaseUrl);

  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.name, targetName))
    .limit(1);

  if (!userRows.length) {
    console.log(JSON.stringify({ foundUser: false, targetName }, null, 2));
    return;
  }

  const user = userRows[0];

  const exactTournament = await db
    .select({
      id: centralTournaments.id,
      externalTournamentId: centralTournaments.externalTournamentId,
      rawSourceId: centralTournaments.rawSourceId,
      totalHands: centralTournaments.totalHands,
      importedAt: centralTournaments.importedAt,
    })
    .from(centralTournaments)
    .where(
      and(
        eq(centralTournaments.userId, user.id),
        or(
          eq(centralTournaments.externalTournamentId, targetId),
          eq(centralTournaments.rawSourceId, targetId),
        ),
      ),
    )
    .orderBy(desc(centralTournaments.importedAt));

  const latest = await db
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
    .limit(10);

  const handCountsForLatest = [] as Array<{ tournamentId: number; totalHands: number; storedHands: number }>;
  for (const t of latest) {
    const handRows = await db
      .select({ value: centralHands.id })
      .from(centralHands)
      .where(and(eq(centralHands.userId, user.id), eq(centralHands.tournamentId, t.id)));
    handCountsForLatest.push({
      tournamentId: t.id,
      totalHands: Number(t.totalHands ?? 0),
      storedHands: handRows.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        foundUser: true,
        user,
        searchedTournamentId: targetId,
        matchedTournaments: exactTournament,
        latestTournaments: latest,
        handCountsForLatest,
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
