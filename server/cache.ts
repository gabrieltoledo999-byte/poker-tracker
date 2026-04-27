import { eq, and } from "drizzle-orm";
import {
  userSessionStatsCache,
  playerAbiStatsCache,
  cacheRecalcQueue,
  cacheInvalidationLog,
  leaderboardCache,
  bankrollHistoryCache,
  type UserSessionStatsCache,
  type PlayerAbiStatsCache,
  type BankrollHistoryCache,
  type InsertCacheRecalcQueue,
  type CacheRecalcQueue,
} from "../drizzle/schema.js";
import { db } from "./db.js";

/**
 * Cache Manager
 * Handles read/write operations for cached statistics
 * Avoids expensive recalculations on every dashboard load
 */

export interface CacheValidationResult {
  isValid: boolean;
  isStale: boolean;
  lastRecalculated: Date;
  minutesSinceLastRecalc: number;
}

/**
 * Check if cache is valid (not stale and recent enough)
 * Stale threshold: 30 minutes
 */
export function isCacheValid(lastRecalculated: Date, staleSince?: Date | null): CacheValidationResult {
  const now = new Date();
  const minutesSinceLastRecalc = (now.getTime() - lastRecalculated.getTime()) / (1000 * 60);
  const isStale = staleSince ? now.getTime() > staleSince.getTime() : false;
  const isValid = minutesSinceLastRecalc < 30 && !isStale;

  return {
    isValid,
    isStale,
    lastRecalculated,
    minutesSinceLastRecalc,
  };
}

/**
 * Read user session stats from cache
 * If cache is stale, enqueue a recalculation job and return cached data anyway (for fast loading)
 */
export async function getUserSessionStatsFromCache(
  userId: number,
  type: "online" | "live"
): Promise<UserSessionStatsCache | null> {
  const cached = await db
    .select()
    .from(userSessionStatsCache)
    .where(and(eq(userSessionStatsCache.userId, userId), eq(userSessionStatsCache.type, type)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cached) return null;

  // Check if cache is stale
  const validation = isCacheValid(cached.lastRecalculated, cached.staleSince);
  if (!validation.isValid && !cached.isStale) {
    // Mark as stale and enqueue recalculation (non-blocking)
    await markCacheAsStale(userId, "session_stats");
    await enqueueCacheRecalc(userId, "incremental", "session_edit", userId);
  }

  return cached;
}

/**
 * Read player ABI stats from cache
 */
export async function getPlayerAbiStatsFromCache(
  userId: number,
  abiBucket: string
): Promise<PlayerAbiStatsCache | null> {
  const cached = await db
    .select()
    .from(playerAbiStatsCache)
    .where(and(eq(playerAbiStatsCache.userId, userId), eq(playerAbiStatsCache.abiBucket, abiBucket)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cached) return null;

  // Check if cache is stale
  const validation = isCacheValid(cached.lastRecalculated, null);
  if (!validation.isValid) {
    // Enqueue recalculation
    await enqueueCacheRecalc(userId, "incremental", "scheduled", null);
  }

  return cached;
}

/**
 * Write user session stats to cache
 */
export async function setUserSessionStatsCache(
  userId: number,
  type: "online" | "live",
  data: Omit<UserSessionStatsCache, "id" | "createdAt" | "updatedAt" | "userId" | "type">
): Promise<void> {
  const now = new Date();

  // Try to update existing record, insert if not found
  const existing = await db
    .select()
    .from(userSessionStatsCache)
    .where(and(eq(userSessionStatsCache.userId, userId), eq(userSessionStatsCache.type, type)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(userSessionStatsCache)
      .set({
        ...data,
        lastRecalculated: now,
        isStale: 0,
        staleSince: null,
        updatedAt: now,
      })
      .where(eq(userSessionStatsCache.id, existing.id));
  } else {
    await db.insert(userSessionStatsCache).values({
      userId,
      type,
      ...data,
      lastRecalculated: now,
      isStale: 0,
      staleSince: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Clear invalidation logs for this user
  await db.delete(cacheInvalidationLog).where(eq(cacheInvalidationLog.userId, userId));
}

/**
 * Write player ABI stats to cache
 */
export async function setPlayerAbiStatsCache(
  userId: number,
  abiBucket: string,
  data: Omit<PlayerAbiStatsCache, "id" | "createdAt" | "updatedAt" | "userId" | "abiBucket">
): Promise<void> {
  const now = new Date();

  const existing = await db
    .select()
    .from(playerAbiStatsCache)
    .where(and(eq(playerAbiStatsCache.userId, userId), eq(playerAbiStatsCache.abiBucket, abiBucket)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(playerAbiStatsCache)
      .set({
        ...data,
        lastRecalculated: now,
        isStale: 0,
        updatedAt: now,
      })
      .where(eq(playerAbiStatsCache.id, existing.id));
  } else {
    await db.insert(playerAbiStatsCache).values({
      userId,
      abiBucket,
      ...data,
      lastRecalculated: now,
      isStale: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Enqueue a cache recalculation job
 * Triggered when data changes (new session, edited session, etc)
 */
export async function enqueueCacheRecalc(
  userId: number,
  jobType: InsertCacheRecalcQueue["jobType"],
  triggeredBy: InsertCacheRecalcQueue["triggeredBy"],
  triggeredByUserId: number | null,
  priority: number = 5
): Promise<CacheRecalcQueue> {
  const job: InsertCacheRecalcQueue = {
    userId,
    jobType,
    priority,
    triggeredBy,
    triggeredByUserId,
    status: "pending",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // If a similar job is already pending, don't create duplicate
  const existing = await db
    .select()
    .from(cacheRecalcQueue)
    .where(
      and(
        eq(cacheRecalcQueue.userId, userId),
        eq(cacheRecalcQueue.status, "pending"),
        eq(cacheRecalcQueue.jobType, jobType)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    return existing;
  }

  const [result] = await db.insert(cacheRecalcQueue).values(job);
  return {
    id: result.insertId as unknown as number,
    ...job,
  };
}

/**
 * Mark cache as stale (triggers recalculation on next read)
 */
export async function markCacheAsStale(userId: number, reason: string): Promise<void> {
  const now = new Date();

  // Update user session stats cache
  await db
    .update(userSessionStatsCache)
    .set({
      isStale: 1,
      staleSince: now,
    })
    .where(eq(userSessionStatsCache.userId, userId));

  // Update player ABI stats cache
  await db
    .update(playerAbiStatsCache)
    .set({
      isStale: 1,
    })
    .where(eq(playerAbiStatsCache.userId, userId));

  // Log invalidation
  await db.insert(cacheInvalidationLog).values({
    userId,
    invalidationType: reason,
    reason: `Cache marked as stale: ${reason}`,
    createdAt: now,
  });
}

/**
 * Get next cache recalc job from queue (for background worker)
 */
export async function getNextCacheJob(
  maxAge: number = 3600000 // 1 hour in ms
): Promise<CacheRecalcQueue | null> {
  const cutoff = new Date(Date.now() - maxAge);

  // Find oldest pending job
  const job = await db
    .select()
    .from(cacheRecalcQueue)
    .where(
      and(
        eq(cacheRecalcQueue.status, "pending"),
        // Don't process jobs older than maxAge to prevent old backlog
      )
    )
    .orderBy(cacheRecalcQueue.priority, cacheRecalcQueue.createdAt)
    .limit(1)
    .then((rows) => rows[0]);

  if (!job) return null;

  // Mark as processing
  await db
    .update(cacheRecalcQueue)
    .set({
      status: "processing",
      processedAt: new Date(),
    })
    .where(eq(cacheRecalcQueue.id, job.id));

  return job;
}

/**
 * Mark cache job as completed
 */
export async function markCacheJobCompleted(
  jobId: number,
  actualDurationMs: number
): Promise<void> {
  await db
    .update(cacheRecalcQueue)
    .set({
      status: "completed",
      completedAt: new Date(),
      actualDurationMs,
    })
    .where(eq(cacheRecalcQueue.id, jobId));
}

/**
 * Mark cache job as failed and retry if possible
 */
export async function markCacheJobFailed(
  jobId: number,
  errorMessage: string
): Promise<void> {
  const job = await db
    .select()
    .from(cacheRecalcQueue)
    .where(eq(cacheRecalcQueue.id, jobId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!job) return;

  const retryCount = (job.retryCount || 0) + 1;
  const shouldRetry = retryCount < (job.maxRetries || 3);

  await db
    .update(cacheRecalcQueue)
    .set({
      status: shouldRetry ? "pending" : "failed",
      retryCount,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(cacheRecalcQueue.id, jobId));
}

/**
 * Update leaderboard cache
 */
export async function updateLeaderboardCache(
  userId: number,
  rank: number,
  metric: "profit" | "roi" | "bb100" | "tournaments_itm" | "tournaments_trophies",
  metricValue: number,
  displayValue: string,
  userName: string,
  userAvatarUrl: string
): Promise<void> {
  const now = new Date();

  const existing = await db
    .select()
    .from(leaderboardCache)
    .where(eq(leaderboardCache.userId, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(leaderboardCache)
      .set({
        rank,
        metric,
        metricValue,
        displayValue,
        userName,
        userAvatarUrl,
        lastRecalculated: now,
        isStale: 0,
        updatedAt: now,
      })
      .where(eq(leaderboardCache.id, existing.id));
  } else {
    await db.insert(leaderboardCache).values({
      userId,
      rank,
      metric,
      metricValue,
      displayValue,
      userName,
      userAvatarUrl,
      lastRecalculated: now,
      isStale: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Clear stale flags after recalculation
 */
export async function clearStaleFlagsForUser(userId: number): Promise<void> {
  await db
    .update(userSessionStatsCache)
    .set({
      isStale: 0,
      staleSince: null,
    })
    .where(eq(userSessionStatsCache.userId, userId));

  await db
    .update(playerAbiStatsCache)
    .set({
      isStale: 0,
    })
    .where(eq(playerAbiStatsCache.userId, userId));

  // Clear bankroll history cache stale flag
  await db
    .update(bankrollHistoryCache)
    .set({
      isStale: 0,
      staleSince: null,
    })
    .where(eq(bankrollHistoryCache.userId, userId));
}

/**
 * Get bankroll history from cache
 */
export async function getBankrollHistoryFromCache(
  userId: number,
  type?: "online" | "live"
): Promise<BankrollHistoryCache | null> {
  const cacheType = type || "both";
  const cached = await db
    .select()
    .from(bankrollHistoryCache)
    .where(and(eq(bankrollHistoryCache.userId, userId), eq(bankrollHistoryCache.type, cacheType)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cached) return null;

  // Check if cache is stale
  const validation = isCacheValid(cached.lastRecalculated, cached.staleSince);
  if (!validation.isValid && !cached.isStale) {
    // Mark as stale and enqueue recalculation (non-blocking)
    await markCacheAsStale(userId, "bankroll_history_outdated");
    await enqueueCacheRecalc(userId, "incremental", "scheduled", null);
  }

  return cached;
}

/**
 * Save bankroll history to cache
 */
export async function setBankrollHistoryCache(
  userId: number,
  type: "online" | "live" | "both",
  historyData: any[],
  dateRangeStart?: Date,
  dateRangeEnd?: Date
): Promise<void> {
  const now = new Date();

  const existing = await db
    .select()
    .from(bankrollHistoryCache)
    .where(and(eq(bankrollHistoryCache.userId, userId), eq(bankrollHistoryCache.type, type)))
    .limit(1)
    .then((rows) => rows[0]);

  const historyJson = JSON.stringify(historyData);

  if (existing) {
    await db
      .update(bankrollHistoryCache)
      .set({
        historyJson,
        totalPoints: historyData.length,
        dateRangeStart,
        dateRangeEnd,
        lastRecalculated: now,
        isStale: 0,
        staleSince: null,
        updatedAt: now,
      })
      .where(eq(bankrollHistoryCache.id, existing.id));
  } else {
    await db.insert(bankrollHistoryCache).values({
      userId,
      type,
      historyJson,
      totalPoints: historyData.length,
      dateRangeStart,
      dateRangeEnd,
      lastRecalculated: now,
      isStale: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}
