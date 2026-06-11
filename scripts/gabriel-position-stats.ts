import { drizzle } from "drizzle-orm/mysql2";
import { eq, like } from "drizzle-orm";
import { users, playerPositionStats, playerStatsByPositionAndAbi } from "../drizzle/schema";

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

  const pos = await db
    .select()
    .from(playerPositionStats)
    .where(eq(playerPositionStats.userId, user.id));

  const posAbi = await db
    .select()
    .from(playerStatsByPositionAndAbi)
    .where(eq(playerStatsByPositionAndAbi.userId, user.id));

  console.log(JSON.stringify({ user, playerPositionStats: pos, playerStatsByPositionAndAbi: posAbi }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
