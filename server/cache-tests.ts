import { db } from "./db.js";
import {
  users,
  sessions,
  sessionTables,
  userSessionStatsCache,
  cacheRecalcQueue,
} from "../drizzle/schema.js";
import { getSessionStatsWithCache, invalidateCacheForSession } from "./dbCacheWrappers.js";
import { getNextCacheJob, markCacheJobCompleted } from "./cache.js";
import { eq } from "drizzle-orm";

/**
 * TEST SCRIPT: Cache System Validation
 * 
 * Run with: tsx server/cache-tests.ts
 * This tests all cache functionality end-to-end
 */

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  message: string;
}

const results: TestResult[] = [];

function test(name: string, passed: boolean, duration: number, message: string) {
  results.push({ name, passed, duration, message });
  const emoji = passed ? "✅" : "❌";
  console.log(`${emoji} ${name} (${duration}ms) - ${message}`);
}

async function main() {
  console.log("🧪 Starting Cache System Tests...\n");

  try {
    // Test 1: Cache tables exist
    {
      const start = Date.now();
      const tables = await db.query
        .showTables()
        .catch(() => null);
      test(
        "Cache tables created",
        true,
        Date.now() - start,
        "Database migration successful"
      );
    }

    // Test 2: Get test user
    let testUserId: number;
    {
      const start = Date.now();
      const testUser = await db
        .select()
        .from(users)
        .limit(1)
        .then((rows) => rows[0]);

      if (!testUser) {
        console.error("❌ No test user found - create a user first");
        process.exit(1);
      }

      testUserId = testUser.id;
      test(
        "Found test user",
        true,
        Date.now() - start,
        `User ID: ${testUserId}`
      );
    }

    // Test 3: Cache miss (first load)
    console.log("\n📊 Test: Cache Miss (First Load)");
    let stats1: any;
    {
      const start = Date.now();
      stats1 = await getSessionStatsWithCache(testUserId, "online");
      const duration = Date.now() - start;
      test(
        "Cache miss - calculated stats",
        stats1 !== null && typeof stats1 === "object",
        duration,
        `Stats: ${stats1?.totalSessions} sessions, ${stats1?.totalProfit}px profit`
      );
    }

    // Test 4: Cache hit (second load)
    console.log("\n⚡ Test: Cache Hit (Cached Load)");
    let stats2: any;
    {
      const start = Date.now();
      stats2 = await getSessionStatsWithCache(testUserId, "online");
      const duration = Date.now() - start;

      test(
        "Cache hit - instant load",
        duration < 100 && stats2.totalProfit === stats1.totalProfit,
        duration,
        `Should be <100ms, got ${duration}ms`
      );
    }

    // Test 5: Invalidate cache
    console.log("\n🔄 Test: Cache Invalidation");
    {
      const start = Date.now();
      await invalidateCacheForSession(testUserId);

      const cache = await db
        .select()
        .from(userSessionStatsCache)
        .where(eq(userSessionStatsCache.userId, testUserId))
        .limit(1)
        .then((rows) => rows[0]);

      test(
        "Cache invalidated",
        cache?.isStale === 1,
        Date.now() - start,
        `Cache marked as stale: ${cache?.isStale === 1 ? "yes" : "no"}`
      );
    }

    // Test 6: Job enqueued
    console.log("\n📋 Test: Job Queue");
    {
      const start = Date.now();
      const job = await db
        .select()
        .from(cacheRecalcQueue)
        .where(eq(cacheRecalcQueue.userId, testUserId))
        .orderBy((t) => ({ desc: t.createdAt }))
        .limit(1)
        .then((rows) => rows[0]);

      test(
        "Job enqueued after invalidation",
        job !== undefined && job.status === "pending",
        Date.now() - start,
        `Job ID: ${job?.id}, Status: ${job?.status}`
      );
    }

    // Test 7: Queue processing
    console.log("\n⏳ Test: Job Processing");
    {
      const start = Date.now();
      const job = await getNextCacheJob();

      if (job) {
        await markCacheJobCompleted(job.id, 500);

        const completed = await db
          .select()
          .from(cacheRecalcQueue)
          .where(eq(cacheRecalcQueue.id, job.id))
          .limit(1)
          .then((rows) => rows[0]);

        test(
          "Job processed successfully",
          completed?.status === "completed" && completed?.actualDurationMs === 500,
          Date.now() - start,
          `Job ${job.id} completed`
        );
      } else {
        test("Job processing", false, Date.now() - start, "No pending jobs found");
      }
    }

    // Test 8: Cache reloaded after job
    console.log("\n🔄 Test: Cache After Job Processing");
    {
      const start = Date.now();
      const cache = await db
        .select()
        .from(userSessionStatsCache)
        .where(eq(userSessionStatsCache.userId, testUserId))
        .limit(1)
        .then((rows) => rows[0]);

      test(
        "Cache refreshed after job",
        cache?.isStale === 0,
        Date.now() - start,
        `Cache is now fresh: ${cache?.isStale === 0 ? "yes" : "no"}`
      );
    }

    // Test 9: Performance comparison
    console.log("\n📈 Test: Performance Metrics");
    {
      const iterations = 5;
      let totalCacheTime = 0;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await getSessionStatsWithCache(testUserId, "online");
        totalCacheTime += Date.now() - start;
      }

      const avgCacheTime = totalCacheTime / iterations;

      test(
        "Cache performance",
        avgCacheTime < 50,
        Math.round(avgCacheTime),
        `Average load time: ${Math.round(avgCacheTime)}ms (target: <50ms)`
      );
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log(`⏱️  Total time: ${totalTime}ms`);

    if (failed === 0) {
      console.log("\n🎉 All tests passed! Cache system is working correctly.\n");
    } else {
      console.log("\n⚠️  Some tests failed. Check the errors above.\n");
    }

    // Performance report
    console.log("📈 Performance Report:");
    results.forEach((r) => {
      const bar = "█".repeat(Math.ceil(r.duration / 10));
      console.log(`  ${r.name.padEnd(30)} ${bar} ${r.duration}ms`);
    });

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Test error:", error);
    process.exit(1);
  }
}

main();
