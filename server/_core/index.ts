import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import mysql2 from "mysql2/promise";

/**
 * Applies missing schema columns to the production database on startup.
 * Uses try/catch on each ALTER so existing columns (ER_DUP_FIELDNAME) are safely skipped.
 */
async function runSafeMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  let conn: mysql2.Connection | null = null;
  try {
    conn = await mysql2.createConnection(dbUrl);

    const alterStatements = [
      // 0017 – initial play style
      "ALTER TABLE `users` ADD COLUMN `preferredPlayType` enum('online','live')",
      "ALTER TABLE `users` ADD COLUMN `playStyleAnsweredAt` timestamp NULL",
      // 0018 – player profile onboarding
      "ALTER TABLE `users` ADD COLUMN `preferredPlatforms` text",
      "ALTER TABLE `users` ADD COLUMN `preferredFormats` text",
      "ALTER TABLE `users` ADD COLUMN `preferredBuyIns` text",
      "ALTER TABLE `users` ADD COLUMN `playsMultiPlatform` int DEFAULT 0",
      "ALTER TABLE `users` ADD COLUMN `onboardingCompletedAt` timestamp NULL",
      // 0019 – split ABI online/live
      "ALTER TABLE `users` ADD COLUMN `preferredBuyInsOnline` text",
      "ALTER TABLE `users` ADD COLUMN `preferredBuyInsLive` text",
      // 0020 – ranking consent
      "ALTER TABLE `users` ADD COLUMN `showInGlobalRanking` int NOT NULL DEFAULT 0",
      "ALTER TABLE `users` ADD COLUMN `showInFriendsRanking` int NOT NULL DEFAULT 0",
      "ALTER TABLE `users` ADD COLUMN `rankingConsentAnsweredAt` timestamp NULL",
      // passwordHash (legacy email auth – may already exist)
      "ALTER TABLE `users` ADD COLUMN `passwordHash` varchar(255)",
      "ALTER TABLE `session_tables` ADD COLUMN `clubName` varchar(120)",
      // currency enum expansion
      "ALTER TABLE `sessions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `session_tables` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `fund_transactions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `venues` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `venue_balance_history` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL'",
    ];

    const createStatements = [
      `CREATE TABLE IF NOT EXISTS \`friend_requests\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`requesterId\` int NOT NULL,
        \`receiverId\` int NOT NULL,
        \`status\` enum('pending','accepted','rejected','canceled') NOT NULL DEFAULT 'pending',
        \`respondedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`friend_requests_id\` PRIMARY KEY(\`id\`)
      )`,
      "CREATE INDEX `friend_requests_requester_idx` ON `friend_requests` (`requesterId`)",
      "CREATE INDEX `friend_requests_receiver_idx` ON `friend_requests` (`receiverId`)",
      "CREATE INDEX `friend_requests_status_idx` ON `friend_requests` (`status`)",
      `CREATE TABLE IF NOT EXISTS \`post_reactions\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`postId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`emoji\` varchar(8) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`post_reactions_id\` PRIMARY KEY(\`id\`)
      )`,
      "CREATE UNIQUE INDEX `post_reactions_post_user_unique` ON `post_reactions` (`postId`,`userId`)",
      "CREATE INDEX `post_reactions_post_idx` ON `post_reactions` (`postId`)",
      "CREATE INDEX `post_reactions_emoji_idx` ON `post_reactions` (`emoji`)",
    ];

    for (const sql of alterStatements) {
      try {
        await conn.execute(sql);
      } catch (err: any) {
        // 1060 = ER_DUP_FIELDNAME – column already exists, safe to ignore
        if (err?.errno !== 1060) {
          console.warn("[migrations] Unexpected error:", err?.message ?? err);
        }
      }
    }

    for (const sql of createStatements) {
      try {
        await conn.execute(sql);
      } catch (err: any) {
        // 1061 = ER_DUP_KEYNAME (index already exists), safe to ignore.
        if (err?.errno !== 1061) {
          console.warn("[migrations] Unexpected create error:", err?.message ?? err);
        }
      }
    }

    console.log("[migrations] Safe migrations complete.");
  } catch (err) {
    console.error("[migrations] Failed to run safe migrations:", err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

// Aliases known → canonical name (lowercased)
const VENUE_ALIAS_MAP: Record<string, string> = {
  "suprema": "Suprema Poker",
  "suprema poker": "Suprema Poker",
  "gg poker": "GG Poker",
  "ggpoker": "GG Poker",
  "pp poker": "PP Poker",
  "pppoker": "PP Poker",
  "pokerstars": "PokerStars",
  "poker stars": "PokerStars",
  "888 poker": "888poker",
  "poker bros": "PokerBros",
  "kk poker": "KKPoker",
  "wpt global": "WPT Global",
  "x poker": "X-Poker",
};

function canonicalVenueName(name: string): string {
  const key = name.toLowerCase().trim();
  return VENUE_ALIAS_MAP[key] ?? name;
}

async function mergeDuplicateVenues() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  let conn: mysql2.Connection | null = null;
  try {
    conn = await mysql2.createConnection(dbUrl);

    const [users] = await conn.execute("SELECT id FROM users") as any[];
    let merged = 0;

    for (const user of users) {
      const [venues] = await conn.execute(
        "SELECT id, name, isPreset, balance FROM venues WHERE userId = ? ORDER BY id ASC",
        [user.id]
      ) as any[];

      // Group by canonical name
      const grouped = new Map<string, any[]>();
      for (const v of venues) {
        const canon = canonicalVenueName(v.name);
        if (!grouped.has(canon)) grouped.set(canon, []);
        grouped.get(canon)!.push(v);
      }

      for (const [canonName, group] of grouped.entries()) {
        if (group.length < 2) continue;

        // Pick canonical: prefer isPreset=1, then exact name match, then lowest id
        group.sort((a: any, b: any) => {
          if (b.isPreset !== a.isPreset) return b.isPreset - a.isPreset;
          const aExact = a.name === canonName ? 0 : 1;
          const bExact = b.name === canonName ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          return a.id - b.id;
        });

        const [canonical, ...duplicates] = group;
        for (const dup of duplicates) {
          // Re-point all references
          await conn.execute("UPDATE sessions SET venueId=? WHERE userId=? AND venueId=?", [canonical.id, user.id, dup.id]);
          await conn.execute("UPDATE session_tables SET venueId=? WHERE userId=? AND venueId=?", [canonical.id, user.id, dup.id]);
          await conn.execute("UPDATE venue_balance_history SET venueId=? WHERE userId=? AND venueId=?", [canonical.id, user.id, dup.id]);
          // Merge balance
          if (dup.balance !== 0) {
            await conn.execute("UPDATE venues SET balance = balance + ? WHERE id=?", [dup.balance, canonical.id]);
          }
          // Delete duplicate
          await conn.execute("DELETE FROM venues WHERE id=?", [dup.id]);
          merged++;
          console.log(`[venues] Merged "${dup.name}" (id=${dup.id}) → "${canonical.name}" (id=${canonical.id}) for user ${user.id}`);
        }
      }
    }

    if (merged > 0) {
      console.log(`[venues] Duplicate merge complete: ${merged} venue(s) merged.`);
    } else {
      console.log("[venues] No duplicate venues found.");
    }
  } catch (err) {
    console.error("[venues] Error during duplicate merge:", err);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await runSafeMigrations();
  await mergeDuplicateVenues();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
