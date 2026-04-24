import "dotenv/config";
import dns from "dns";
// Force IPv6-first resolution so Railway private DNS (mysql.railway.internal → IPv6 ULA)
// is used instead of a stale IPv4 A-record that isn't routable.
try { dns.setDefaultResultOrder("ipv6first"); } catch {}
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sql as drizzleSql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Applies missing schema columns to the production database on startup.
 * Uses try/catch on each ALTER so existing columns (ER_DUP_FIELDNAME) are safely skipped.
 */
async function runSafeMigrations() {
  if (!process.env.DATABASE_URL) return;

  try {
    const connectWithRetry = async (attempts = 20, delayMs = 3000) => {
      let lastError: unknown;
      for (let i = 0; i < attempts; i++) {
        try {
          const db = await getDb();
          if (!db) throw new Error("Drizzle db not available");
          // Validate connectivity before returning.
          await db.execute(drizzleSql`SELECT 1`);
          return db;
        } catch (error) {
          lastError = error;
          const code = String((error as any)?.code ?? "").toUpperCase();
          if (i === attempts - 1) throw error;
          console.warn(`[migrations] DB not ready (${code || "?"}). Retry ${i + 1}/${attempts} in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    };

    const db = await connectWithRetry();
    const runSql = async (statement: string) => {
      return db.execute(drizzleSql.raw(statement));
    };

    const alterStatements = [
      "ALTER TABLE `users` MODIFY COLUMN `role` enum('user','coach','reviewer','admin','developer','system_ai_service') NOT NULL DEFAULT 'user'",
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
      // invite system (0022_friend_requests era)
      "ALTER TABLE `users` ADD COLUMN `inviteCode` varchar(32)",
      "ALTER TABLE `users` ADD COLUMN `invitedBy` int",
      "ALTER TABLE `users` ADD COLUMN `inviteCount` int NOT NULL DEFAULT 0",
      "CREATE UNIQUE INDEX `users_inviteCode_unique` ON `users` (`inviteCode`)",
      "ALTER TABLE `session_tables` ADD COLUMN `clubName` varchar(120)",
      "ALTER TABLE `session_tables` ADD COLUMN `tournamentName` varchar(160)",
      "ALTER TABLE `session_tables` ADD COLUMN `fieldSize` int",
      "ALTER TABLE `sessions` ADD COLUMN `tournamentName` varchar(160)",
      "ALTER TABLE `sessions` ADD COLUMN `fieldSize` int",
      // premium hand counters
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `aaHands` int NOT NULL DEFAULT 0",
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `aaWins` int NOT NULL DEFAULT 0",
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `aaLosses` int NOT NULL DEFAULT 0",
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `akHands` int NOT NULL DEFAULT 0",
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `akWins` int NOT NULL DEFAULT 0",
      "ALTER TABLE `hand_pattern_counters` ADD COLUMN `akLosses` int NOT NULL DEFAULT 0",
        // rebuy tracking
        "ALTER TABLE `session_tables` ADD COLUMN `initialBuyIn` int",
        "ALTER TABLE `session_tables` ADD COLUMN `rebuyCount` int NOT NULL DEFAULT 0",
      // currency enum expansion
      "ALTER TABLE `sessions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `session_tables` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `fund_transactions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `venues` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `venue_balance_history` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE `player_tournament_stats` ADD COLUMN `abiBucket` varchar(32) NOT NULL DEFAULT 'micro'",
      "ALTER TABLE `player_tournament_stats` ADD COLUMN `totalCost` int NOT NULL DEFAULT 0",
      "ALTER TABLE `player_aggregate_stats` ADD COLUMN `averageAbi` int NOT NULL DEFAULT 0",
      "ALTER TABLE `player_aggregate_stats` ADD COLUMN `medianAbi` int NOT NULL DEFAULT 0",
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
      `CREATE TABLE IF NOT EXISTS \`player_leak_flags\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`leakCode\` varchar(80) NOT NULL,
        \`severity\` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
        \`confidence\` int NOT NULL DEFAULT 0,
        \`description\` text NOT NULL,
        \`evidenceJson\` mediumtext,
        \`firstDetectedAt\` timestamp NOT NULL DEFAULT (now()),
        \`lastDetectedAt\` timestamp NOT NULL DEFAULT (now()),
        \`active\` int NOT NULL DEFAULT 1,
        CONSTRAINT \`player_leak_flags_id\` PRIMARY KEY(\`id\`)
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
      `CREATE TABLE IF NOT EXISTS \`user_blocks\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`blockedUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`user_blocks_id\` PRIMARY KEY(\`id\`)
      )`,
      "CREATE UNIQUE INDEX `user_blocks_user_blocked_unique` ON `user_blocks` (`userId`,`blockedUserId`)",
      `CREATE TABLE IF NOT EXISTS \`user_consents\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`consentVersion\` varchar(32) NOT NULL,
        \`allowDataStorage\` int NOT NULL DEFAULT 0,
        \`allowSharedInternalAnalysis\` int NOT NULL DEFAULT 0,
        \`allowAiTrainingUsage\` int NOT NULL DEFAULT 0,
        \`allowDeveloperAccess\` int NOT NULL DEFAULT 0,
        \`allowFieldAggregation\` int NOT NULL DEFAULT 0,
        \`grantedAt\` timestamp NOT NULL DEFAULT (now()),
        \`revokedAt\` timestamp NULL,
        \`active\` int NOT NULL DEFAULT 1,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`user_consents_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`user_data_access_grants\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`ownerUserId\` int NOT NULL,
        \`viewerUserId\` int NOT NULL,
        \`allowHandReview\` int NOT NULL DEFAULT 1,
        \`allowTrainerAccess\` int NOT NULL DEFAULT 0,
        \`allowGtoAccess\` int NOT NULL DEFAULT 0,
        \`allowFieldComparison\` int NOT NULL DEFAULT 0,
        \`active\` int NOT NULL DEFAULT 1,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`user_data_access_grants_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`data_access_audit_logs\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`actorUserId\` int NULL,
        \`targetUserId\` int NOT NULL,
        \`actorRole\` varchar(40) NULL,
        \`accessScope\` varchar(64) NOT NULL,
        \`accessMethod\` varchar(32) NOT NULL DEFAULT 'trpc',
        \`reason\` text NULL,
        \`outcome\` enum('allowed','denied') NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`data_access_audit_logs_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`central_tournaments\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`externalTournamentId\` varchar(191) NULL,
        \`userId\` int NOT NULL,
        \`site\` varchar(64) NOT NULL,
        \`format\` varchar(32) NOT NULL DEFAULT 'tournament',
        \`buyIn\` int NOT NULL DEFAULT 0,
        \`fee\` int NOT NULL DEFAULT 0,
        \`totalCost\` int NOT NULL DEFAULT 0,
        \`currency\` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL',
        \`abiValue\` int NOT NULL DEFAULT 0,
        \`abiBucket\` varchar(32) NOT NULL DEFAULT 'micro',
        \`playerAbiSnapshot\` int NOT NULL DEFAULT 0,
        \`importedAt\` timestamp NOT NULL DEFAULT (now()),
        \`totalHands\` int NOT NULL DEFAULT 0,
        \`finalPosition\` int NULL,
        \`wasEliminated\` int NOT NULL DEFAULT 0,
        \`eliminationHandId\` int NULL,
        \`rawSourceId\` varchar(191) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`central_tournaments_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`central_hands\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`externalHandId\` varchar(191) NULL,
        \`tournamentId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`handNumber\` varchar(64) NULL,
        \`datetimeOriginal\` timestamp NULL,
        \`buttonSeat\` int NULL,
        \`heroSeat\` int NULL,
        \`heroPosition\` varchar(16) NULL,
        \`smallBlind\` int DEFAULT 0,
        \`bigBlind\` int DEFAULT 0,
        \`ante\` int DEFAULT 0,
        \`board\` text NULL,
        \`heroCards\` varchar(32) NULL,
        \`totalPot\` int NULL,
        \`rake\` int NULL,
        \`result\` int NULL,
        \`showdown\` int NOT NULL DEFAULT 0,
        \`rawText\` text NULL,
        \`parsedJson\` mediumtext NULL,
        \`handContextJson\` mediumtext NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`central_hands_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`central_hand_actions\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`handId\` int NOT NULL,
        \`tournamentId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`street\` enum('preflop','flop','turn','river','showdown','summary') NOT NULL,
        \`actionOrder\` int NOT NULL DEFAULT 0,
        \`playerName\` varchar(120) NOT NULL,
        \`seat\` int NULL,
        \`position\` varchar(16) NULL,
        \`actionType\` enum('fold','check','call','bet','raise','all_in','post_blind','post_ante','straddle','show','muck','collect','other') NOT NULL,
        \`amount\` int NULL,
        \`toAmount\` int NULL,
        \`stackBefore\` int NULL,
        \`stackAfter\` int NULL,
        \`potBefore\` int NULL,
        \`potAfter\` int NULL,
        \`isAllIn\` int NOT NULL DEFAULT 0,
        \`isForced\` int NOT NULL DEFAULT 0,
        \`facingActionType\` varchar(32) NULL,
        \`facingSizeBb\` int NULL,
        \`heroInHand\` int NOT NULL DEFAULT 0,
        \`showdownVisible\` int NOT NULL DEFAULT 0,
        \`contextJson\` mediumtext NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`central_hand_actions_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`showdown_records\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`handId\` int NOT NULL,
        \`tournamentId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`playerName\` varchar(120) NOT NULL,
        \`seat\` int NULL,
        \`position\` varchar(16) NULL,
        \`holeCards\` varchar(64) NULL,
        \`finalHandDescription\` text NULL,
        \`wonPot\` int NOT NULL DEFAULT 0,
        \`amountWon\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`showdown_records_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`player_tournament_stats\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`tournamentId\` int NOT NULL,
        \`handsPlayed\` int NOT NULL DEFAULT 0,
        \`vpip\` int NOT NULL DEFAULT 0,
        \`pfr\` int NOT NULL DEFAULT 0,
        \`threeBet\` int NOT NULL DEFAULT 0,
        \`cbetFlop\` int NOT NULL DEFAULT 0,
        \`cbetTurn\` int NOT NULL DEFAULT 0,
        \`foldToCbet\` int NOT NULL DEFAULT 0,
        \`bbDefense\` int NOT NULL DEFAULT 0,
        \`stealAttempt\` int NOT NULL DEFAULT 0,
        \`aggressionFactor\` int NOT NULL DEFAULT 0,
        \`limpRate\` int NOT NULL DEFAULT 0,
        \`wtsd\` int NOT NULL DEFAULT 0,
        \`wsd\` int NOT NULL DEFAULT 0,
        \`averageStackBb\` int NOT NULL DEFAULT 0,
        \`finalPosition\` int NULL,
        \`abiBucket\` varchar(32) NOT NULL DEFAULT 'micro',
        \`totalCost\` int NOT NULL DEFAULT 0,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`player_tournament_stats_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`player_aggregate_stats\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`sampleHands\` int NOT NULL DEFAULT 0,
        \`sampleTournaments\` int NOT NULL DEFAULT 0,
        \`vpipAvg\` int NOT NULL DEFAULT 0,
        \`pfrAvg\` int NOT NULL DEFAULT 0,
        \`threeBetAvg\` int NOT NULL DEFAULT 0,
        \`cbetFlopAvg\` int NOT NULL DEFAULT 0,
        \`cbetTurnAvg\` int NOT NULL DEFAULT 0,
        \`foldToCbetAvg\` int NOT NULL DEFAULT 0,
        \`bbDefenseAvg\` int NOT NULL DEFAULT 0,
        \`stealAttemptAvg\` int NOT NULL DEFAULT 0,
        \`aggressionFactorAvg\` int NOT NULL DEFAULT 0,
        \`itmRate\` int NOT NULL DEFAULT 0,
        \`avgFinishPosition\` int NOT NULL DEFAULT 0,
        \`averageAbi\` int NOT NULL DEFAULT 0,
        \`medianAbi\` int NOT NULL DEFAULT 0,
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`player_aggregate_stats_id\` PRIMARY KEY(\`id\`),
        UNIQUE KEY \`player_aggregate_stats_userId_unique\` (\`userId\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`player_stats_by_abi\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`abiBucket\` varchar(32) NOT NULL,
        \`tournaments\` int NOT NULL DEFAULT 0,
        \`handsPlayed\` int NOT NULL DEFAULT 0,
        \`vpip\` int NULL,
        \`pfr\` int NULL,
        \`threeBet\` int NULL,
        \`cbetFlop\` int NULL,
        \`bbDefense\` int NULL,
        \`avgFinishPosition\` int NULL,
        \`itmRate\` int NULL,
        \`roiEstimate\` int NULL,
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`player_stats_by_abi_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`field_aggregate_stats_by_abi\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`site\` varchar(64) NOT NULL,
        \`abiBucket\` varchar(32) NOT NULL,
        \`sampleTournaments\` int NOT NULL DEFAULT 0,
        \`sampleHands\` int NOT NULL DEFAULT 0,
        \`avgVpip\` int NULL,
        \`avgPfr\` int NULL,
        \`avgThreeBet\` int NULL,
        \`avgCbetFlop\` int NULL,
        \`avgBbDefense\` int NULL,
        \`avgSteal\` int NULL,
        \`avgOpenSizeBb\` int NULL,
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`field_aggregate_stats_by_abi_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`player_stats_by_position_and_abi\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`abiBucket\` varchar(32) NOT NULL,
        \`position\` varchar(16) NOT NULL,
        \`handsPlayed\` int NOT NULL DEFAULT 0,
        \`vpip\` int NULL,
        \`pfr\` int NULL,
        \`threeBet\` int NULL,
        \`netChips\` int NULL,
        \`bb100\` int NULL,
        \`stealAttempt\` int NULL,
        \`foldTo3Bet\` int NULL,
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`player_stats_by_position_and_abi_id\` PRIMARY KEY(\`id\`)
      )`,
      `CREATE TABLE IF NOT EXISTS \`player_position_stats\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`position\` enum('UTG','UTG1','UTG2','LJ','HJ','CO','BTN','SB','BB','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        \`handsPlayed\` int NOT NULL DEFAULT 0,
        \`vpip\` int NOT NULL DEFAULT 0,
        \`pfr\` int NOT NULL DEFAULT 0,
        \`winRateBb100\` int NOT NULL DEFAULT 0,
        \`chipEv\` int NOT NULL DEFAULT 0,
        \`netChips\` int NOT NULL DEFAULT 0,
        \`foldToOpen\` int NOT NULL DEFAULT 0,
        \`callOpen\` int NOT NULL DEFAULT 0,
        \`raiseFirstIn\` int NOT NULL DEFAULT 0,
        \`threeBet\` int NOT NULL DEFAULT 0,
        \`bbDefenseWhenApplicable\` int NOT NULL DEFAULT 0,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`player_position_stats_id\` PRIMARY KEY(\`id\`)
      )`,
    ];

    // Run CREATE statements first (so tables exist before we try to ALTER them)
    for (const statement of createStatements) {
      try {
        await runSql(statement);
      } catch (err: any) {
        // 1061 = ER_DUP_KEYNAME (index already exists), safe to ignore.
        if (err?.errno !== 1061) {
          console.warn("[migrations] Unexpected create error:", err?.message ?? err);
        }
      }
    }

    // Then run ALTER statements (tables now exist)
    for (const statement of alterStatements) {
      try {
        await runSql(statement);
      } catch (err: any) {
        // 1060 = ER_DUP_FIELDNAME – column already exists, safe to ignore
        if (err?.errno !== 1060) {
          console.warn("[migrations] Unexpected error:", err?.message ?? err);
        }
      }
    }

    console.log("[migrations] Safe migrations complete.");

    // Backfill initialBuyIn for existing rows that don't have it yet
    try {
      const result: any = await runSql(
        "UPDATE `session_tables` SET `initialBuyIn` = `buyIn` WHERE `initialBuyIn` IS NULL"
      );
      const affected = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;
      if (affected > 0) {
        console.log(`[migrations] Backfilled initialBuyIn for ${affected} session_table row(s).`);
      }
    } catch (err: any) {
      console.warn("[migrations] Could not backfill initialBuyIn:", err?.message);
    }
  } catch (err) {
    console.error("[migrations] Failed to run safe migrations:", err);
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
  "champion poker": "Champion Poker",
  "championpoker": "Champion Poker",
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

      for (const [canonName, group] of Array.from(grouped.entries())) {
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
  const app = express();
  const server = createServer(app);
  // Trust Railway's reverse proxy so req.protocol reflects HTTPS correctly
  app.set("trust proxy", 1);
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
    // Run migrations and venue merge in background so healthcheck can pass
    // even if the DB is still booting. Errors are logged but don't crash the server.
    runSafeMigrations()
      .then(() => mergeDuplicateVenues())
      .catch(err => console.error("[startup] Background DB setup failed:", err));
  });
}

startServer().catch(console.error);
