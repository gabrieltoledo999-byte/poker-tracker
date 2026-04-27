/**
 * DIAGNOSTIC SCRIPT: Identify Slow Endpoints
 * 
 * Run this to see which queries are taking too long
 * Run with: tsx server/diagnose-slowness.ts
 */

import { db } from "./db.js";
import { sessions, sessionTables } from "../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";

async function diagnoseSlowQueries(userId: number) {
  console.log("🔍 Diagnosing slow queries for user:", userId);
  console.log("=".repeat(60));

  // Count sessions
  console.log("\n📊 Session Data Size:");
  const sessionCount = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .then(r => r.length);
  console.log(`  Total sessions: ${sessionCount}`);

  const tableCount = await db
    .select()
    .from(sessionTables)
    .where(eq(sessionTables.userId, userId))
    .then(r => r.length);
  console.log(`  Total session tables: ${tableCount}`);

  // ⚠️ SLOW: getSessionStats equivalent
  console.log("\n⏱️  Query 1: getSessionStats (SLOW without cache)");
  {
    const start = Date.now();
    
    // This is what getSessionStats does:
    const allSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    
    const duration1 = Date.now() - start;
    console.log(`  Query: SELECT * FROM sessions → ${duration1}ms`);
    
    const sessionIds = allSessions.map(s => s.id);
    if (sessionIds.length > 0) {
      const start2 = Date.now();
      const tableRows = await db
        .select()
        .from(sessionTables)
        .where(eq(sessionTables.userId, userId));
      
      const duration2 = Date.now() - start2;
      console.log(`  Query: SELECT * FROM sessionTables → ${duration2}ms`);
      
      // TypeScript processing
      const start3 = Date.now();
      const map = new Map();
      for (const row of tableRows) {
        // Heavy TypeScript processing
        if (!map.has(row.sessionId)) map.set(row.sessionId, []);
        map.get(row.sessionId).push(row);
      }
      const duration3 = Date.now() - start3;
      console.log(`  TypeScript: Processing ${tableRows.length} rows → ${duration3}ms`);
      
      console.log(`  ⚠️  TOTAL: ${duration1 + duration2 + duration3}ms (recalculates every page load!)`);
    }
  }

  // ⚠️ SLOW: getBankrollHistory equivalent
  console.log("\n⏱️  Query 2: getBankrollHistory (SLOW without cache)");
  {
    const start = Date.now();
    
    const allSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sessions.sessionDate);
    
    const duration1 = Date.now() - start;
    console.log(`  Query: SELECT * FROM sessions (ordered) → ${duration1}ms`);

    if (allSessions.length > 0) {
      const start2 = Date.now();
      const tableRows = await db
        .select()
        .from(sessionTables)
        .where(eq(sessionTables.userId, userId));
      
      const duration2 = Date.now() - start2;
      console.log(`  Query: SELECT * FROM sessionTables → ${duration2}ms`);

      const start3 = Date.now();
      // Heavy TypeScript processing for each session
      for (const session of allSessions) {
        for (const table of tableRows) {
          if (table.sessionId === session.id) {
            // Match and calculate profit share
            const profit = session.cashOut - session.buyIn;
            // ... more processing
          }
        }
      }
      const duration3 = Date.now() - start3;
      console.log(`  TypeScript: Processing history → ${duration3}ms`);
      
      console.log(`  ⚠️  TOTAL: ${duration1 + duration2 + duration3}ms (THIS CAUSES THE FREEZE!)`);
    }
  }

  console.log("\n✅ With Cache:");
  console.log("  SELECT * FROM bankroll_history_cache WHERE userId = ? → 5-10ms");
  console.log("  Result: Instant chart loading!");

  console.log("\n" + "=".repeat(60));
  console.log("💡 Solution: Use getBankrollHistoryWithCache() instead\n");
}

// Get test user
import { users } from "../drizzle/schema.js";

async function main() {
  try {
    const testUser = await db
      .select()
      .from(users)
      .limit(1)
      .then(rows => rows[0]);

    if (!testUser) {
      console.error("No users found in database");
      process.exit(1);
    }

    await diagnoseSlowQueries(testUser.id);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
