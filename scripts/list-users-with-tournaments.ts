import { drizzle } from "drizzle-orm/mysql2";
import { sql, eq } from "drizzle-orm";
import { users, centralTournaments } from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");
  const db = drizzle(databaseUrl);

  const rows = await db
    .select({
      userId: centralTournaments.userId,
      name: users.name,
      tournaments: sql<number>`COUNT(*)`,
    })
    .from(centralTournaments)
    .leftJoin(users, eq(users.id, centralTournaments.userId))
    .groupBy(centralTournaments.userId, users.name);

  console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
