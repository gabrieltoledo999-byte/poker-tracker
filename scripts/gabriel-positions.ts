import { drizzle } from "drizzle-orm/mysql2";
import { count, eq, like, sql } from "drizzle-orm";
import { users, centralHands } from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");
  const db = drizzle(databaseUrl);

  const user = (await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(like(users.name, "%Gabriel%"))
    .limit(1))[0];

  if (!user) {
    console.log("No Gabriel found");
    return;
  }

  const breakdown = await db
    .select({
      position: centralHands.heroPosition,
      hands: count(),
    })
    .from(centralHands)
    .where(eq(centralHands.userId, user.id))
    .groupBy(centralHands.heroPosition);

  const total = breakdown.reduce((acc, row) => acc + Number(row.hands ?? 0), 0);

  console.log(JSON.stringify({ user, total, breakdown }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
