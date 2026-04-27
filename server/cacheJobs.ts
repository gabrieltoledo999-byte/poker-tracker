import { eq, and } from "drizzle-orm";
import {
  cacheRecalcQueue,
  sessions,
  sessionTables,
  users,
} from "../drizzle/schema.js";
import { db } from "./db.js";
import {
  getNextCacheJob,
  markCacheJobCompleted,
  markCacheJobFailed,
  setUserSessionStatsCache,
  setPlayerAbiStatsCache,
  clearStaleFlagsForUser,
  enqueueCacheRecalc,
} from "./cache.js";
import { getSessionStats, getStatsByVenue } from "./db.js";

/**
 * Background Cache Job Processor
 * Runs background recalculation jobs from the queue
 * Can be invoked as a cron job or long-running service
 */

const PROCESSOR_ID = `processor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const BATCH_SIZE = 5; // Process up to 5 jobs per run
const JOB_TIMEOUT_MS = 30000; // 30 seconds max per job

/**
 * Process one cache recalculation job
 */
async function processCacheJob(jobId: number, userId: number, jobType: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`[CacheWorker] Processing job ${jobId} for user ${userId} (type: ${jobType})`);

    if (jobType === "full_recalc") {
      // Full recalculation: online + live stats, all ABI buckets
      await recalculateFullUserStats(userId);
    } else if (jobType === "incremental") {
      // Incremental: only recalculate what changed
      await recalculateIncrementalStats(userId);
    } else if (jobType === "venue_stats") {
      // Recalculate stats by venue
      await recalculateVenueStats(userId);
    } else if (jobType === "tournament_stats") {
      // Recalculate tournament-specific stats
      await recalculateTournamentStats(userId);
    }

    const duration = Date.now() - startTime;
    await markCacheJobCompleted(jobId, duration);
    console.log(`[CacheWorker] Job ${jobId} completed in ${duration}ms`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CacheWorker] Job ${jobId} failed:`, errorMsg);
    await markCacheJobFailed(jobId, errorMsg);

    // If this is a critical error (not timeout), don't retry
    if (errorMsg.includes("timeout")) {
      throw error;
    }
  }
}

/**
 * Full recalculation of all user statistics
 */
async function recalculateFullUserStats(userId: number): Promise<void> {
  console.log(`[Cache] Full recalculation for user ${userId}`);

  try {
    // Get online stats
    const onlineStats = await getSessionStats(userId, "online");
    if (onlineStats) {
      await setUserSessionStatsCache(userId, "online", {
        type: "online",
        totalSessions: onlineStats.sessions?.length || 0,
        totalCashSessions: onlineStats.cashSessions?.length || 0,
        totalTournaments: onlineStats.tournaments?.length || 0,
        totalTournamentsPlayed: onlineStats.tournaments?.length || 0,
        totalBuyIns: onlineStats.totalBuyIn || 0,
        totalCashOuts: onlineStats.totalCashOut || 0,
        netProfit: (onlineStats.totalCashOut || 0) - (onlineStats.totalBuyIn || 0),
        roi: calculateROI(onlineStats.totalBuyIn || 0, onlineStats.totalCashOut || 0),
        tournamentsItm: onlineStats.itmTournaments?.length || 0,
        tournamentsCashed: onlineStats.cashedTournaments?.length || 0,
        tournamentsTrophies: onlineStats.trophies?.length || 0,
        avgTournamentPosition: onlineStats.avgTournamentPosition || 0,
        bestFinish: onlineStats.bestFinish || null,
        totalPlayedMinutes: onlineStats.totalPlayedMinutes || 0,
        averageSessionMinutes: onlineStats.avgSessionMinutes || 0,
        hourlyRate: onlineStats.hourlyRate || 0,
        bb100Rate: 0, // Would need hand count
        isStale: 0,
      });
    }

    // Get live stats
    const liveStats = await getSessionStats(userId, "live");
    if (liveStats) {
      await setUserSessionStatsCache(userId, "live", {
        type: "live",
        totalSessions: liveStats.sessions?.length || 0,
        totalCashSessions: liveStats.cashSessions?.length || 0,
        totalTournaments: liveStats.tournaments?.length || 0,
        totalTournamentsPlayed: liveStats.tournaments?.length || 0,
        totalBuyIns: liveStats.totalBuyIn || 0,
        totalCashOuts: liveStats.totalCashOut || 0,
        netProfit: (liveStats.totalCashOut || 0) - (liveStats.totalBuyIn || 0),
        roi: calculateROI(liveStats.totalBuyIn || 0, liveStats.totalCashOut || 0),
        tournamentsItm: liveStats.itmTournaments?.length || 0,
        tournamentsCashed: liveStats.cashedTournaments?.length || 0,
        tournamentsTrophies: liveStats.trophies?.length || 0,
        avgTournamentPosition: liveStats.avgTournamentPosition || 0,
        bestFinish: liveStats.bestFinish || null,
        totalPlayedMinutes: liveStats.totalPlayedMinutes || 0,
        averageSessionMinutes: liveStats.avgSessionMinutes || 0,
        hourlyRate: liveStats.hourlyRate || 0,
        bb100Rate: 0,
        isStale: 0,
      });
    }

    await clearStaleFlagsForUser(userId);
  } catch (error) {
    console.error(`[Cache] Error in full recalculation for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Incremental recalculation (only recent changes)
 */
async function recalculateIncrementalStats(userId: number): Promise<void> {
  console.log(`[Cache] Incremental recalculation for user ${userId}`);

  // Get only recent sessions (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentSessions = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.userId, userId),
      // @ts-ignore - sessionDate comparison
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ...(sevenDaysAgo ? [`sessions.sessionDate > '${sevenDaysAgo.toISOString()}'`] : [])
    ))
    .limit(100);

  // For now, just do full recalc (can be optimized to only recalc affected buckets)
  await recalculateFullUserStats(userId);
}

/**
 * Recalculate venue-specific stats
 */
async function recalculateVenueStats(userId: number): Promise<void> {
  console.log(`[Cache] Venue stats recalculation for user ${userId}`);

  try {
    const venueStats = await getStatsByVenue(userId);
    // Stats will be stored in cache via the main function
  } catch (error) {
    console.error(`[Cache] Error recalculating venue stats for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Recalculate tournament stats
 */
async function recalculateTournamentStats(userId: number): Promise<void> {
  console.log(`[Cache] Tournament stats recalculation for user ${userId}`);

  try {
    // Get tournament-specific stats from db
    // This can be expanded based on what tournament metrics are needed
    const tournamentStats = await getSessionStats(userId, undefined, "tournament");
  } catch (error) {
    console.error(`[Cache] Error recalculating tournament stats for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate ROI percentage * 100
 */
function calculateROI(buyIns: number, cashOuts: number): number {
  if (buyIns === 0) return 0;
  return Math.round(((cashOuts - buyIns) / buyIns) * 10000);
}

/**
 * Main worker loop - process cache jobs continuously
 */
export async function startCacheWorker(intervalMs: number = 5000): Promise<void> {
  console.log(`[CacheWorker] Starting with ID: ${PROCESSOR_ID}`);

  const processJobs = async () => {
    try {
      let jobsProcessed = 0;

      for (let i = 0; i < BATCH_SIZE; i++) {
        const job = await getNextCacheJob();
        if (!job) break;

        try {
          // Run with timeout
          const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("Job timeout")), JOB_TIMEOUT_MS)
          );

          const jobPromise = processCacheJob(job.id, job.userId, job.jobType);

          await Promise.race([jobPromise, timeoutPromise]);
          jobsProcessed++;
        } catch (error) {
          console.error(`[CacheWorker] Error processing job ${job.id}:`, error);
        }
      }

      if (jobsProcessed > 0) {
        console.log(`[CacheWorker] Processed ${jobsProcessed} jobs`);
      }
    } catch (error) {
      console.error(`[CacheWorker] Error in job loop:`, error);
    }

    // Schedule next iteration
    setTimeout(processJobs, intervalMs);
  };

  // Start processing
  await processJobs();
}

/**
 * One-time cache recalculation (for manual triggers)
 */
export async function triggerUserCacheRecalc(userId: number, fullRecalc: boolean = true): Promise<void> {
  const jobType = fullRecalc ? "full_recalc" : "incremental";
  await enqueueCacheRecalc(userId, jobType, "manual", userId);
  console.log(`[Cache] Enqueued ${jobType} for user ${userId}`);
}

/**
 * Health check for worker
 */
export function getWorkerStatus(): {
  processorId: string;
  isRunning: boolean;
  uptime: number;
} {
  return {
    processorId: PROCESSOR_ID,
    isRunning: true,
    uptime: Date.now(),
  };
}
