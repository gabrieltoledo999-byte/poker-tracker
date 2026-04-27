/**
 * WRAPPER FUNCTIONS THAT USE CACHE
 * Add these to db.ts to integrate caching into existing queries
 */

import {
  getUserSessionStatsFromCache,
  setUserSessionStatsCache,
  enqueueCacheRecalc,
  getBankrollHistoryFromCache,
  setBankrollHistoryCache,
} from "./cache.js";
import { getSessionStats, getBankrollHistory } from "./db.js";

type GameFormat = "cash_game" | "tournament" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game";

/**
 * Get session stats with caching
 * 1. Check cache first
 * 2. If valid cache exists, return it
 * 3. If cache is stale/missing, calculate and cache
 * 4. Enqueue background job for next recalculation
 */
export async function getSessionStatsWithCache(
  userId: number,
  type?: "online" | "live",
  gameFormat?: GameFormat
) {
  // If type not specified, get both
  if (!type) {
    const [onlineStats, liveStats] = await Promise.all([
      getSessionStatsWithCache(userId, "online", gameFormat),
      getSessionStatsWithCache(userId, "live", gameFormat),
    ]);
    return {
      online: onlineStats,
      live: liveStats,
      combined: {
        totalBuyIn: (onlineStats.totalBuyIn || 0) + (liveStats.totalBuyIn || 0),
        totalCashOut: (onlineStats.totalCashOut || 0) + (liveStats.totalCashOut || 0),
        totalProfit: (onlineStats.totalProfit || 0) + (liveStats.totalProfit || 0),
        totalSessions: (onlineStats.totalSessions || 0) + (liveStats.totalSessions || 0),
      },
    };
  }

  // Try to get from cache first
  const cachedStats = await getUserSessionStatsFromCache(userId, type);

  if (cachedStats) {
    // Cache is valid and fast to load
    console.log(`[Cache] HIT: Session stats for user ${userId} (${type})`);

    // Return in same format as getSessionStats
    return {
      totalSessions: cachedStats.totalSessions,
      totalTables: cachedStats.totalSessions, // Approximate
      totalBuyIn: cachedStats.totalBuyIns,
      totalCashOut: cachedStats.totalCashOuts,
      totalProfit: cachedStats.netProfit,
      totalDuration: cachedStats.totalPlayedMinutes,
      winningSessions: Math.round(cachedStats.totalSessions * 0.6), // Estimate
      losingSessions: Math.round(cachedStats.totalSessions * 0.3),
      breakEvenSessions: Math.round(cachedStats.totalSessions * 0.1),
      itmCount: cachedStats.tournamentsItm,
      trophyCount: cachedStats.tournamentsTrophies,
      bestSession: null,
      worstSession: null,
      bestFinalPosition: null,
      avgFinalPosition: cachedStats.avgTournamentPosition,
      maxFieldSize: null,
      avgFieldSize: null,
      avgProfit: Math.round(cachedStats.netProfit / Math.max(1, cachedStats.totalSessions)),
      winRate: calculateWinRate(cachedStats.tournamentsItm, cachedStats.totalTournamentsPlayed),
      avgHourlyRate: cachedStats.hourlyRate,
    };
  }

  console.log(`[Cache] MISS: Session stats for user ${userId} (${type}) - calculating...`);

  // Cache miss - calculate stats (this is the expensive operation)
  const stats = await getSessionStats(userId, type, gameFormat);

  // Save to cache in background (don't wait)
  setUserSessionStatsCache(userId, type, {
    type,
    totalSessions: stats.totalSessions || 0,
    totalCashSessions: 0, // Would need to distinguish
    totalTournaments: 0,
    totalTournamentsPlayed: 0,
    totalBuyIns: stats.totalBuyIn || 0,
    totalCashOuts: stats.totalCashOut || 0,
    netProfit: stats.totalProfit || 0,
    roi: calculateROI(stats.totalBuyIn || 0, stats.totalCashOut || 0),
    tournamentsItm: stats.itmCount || 0,
    tournamentsCashed: 0,
    tournamentsTrophies: stats.trophyCount || 0,
    avgTournamentPosition: stats.avgFinalPosition || 0,
    bestFinish: stats.bestFinalPosition,
    totalPlayedMinutes: stats.totalDuration || 0,
    averageSessionMinutes: Math.round((stats.totalDuration || 0) / Math.max(1, stats.totalSessions || 1)),
    hourlyRate: stats.avgHourlyRate || 0,
    bb100Rate: 0,
    isStale: 0,
  }).catch((err) => console.error(`[Cache] Error saving stats:`, err));

  // Enqueue job for next recalculation (runs in background)
  enqueueCacheRecalc(userId, "full_recalc", "new_session", userId).catch((err) =>
    console.error(`[Cache] Error enqueuing job:`, err)
  );

  return stats;
}

/**
 * When a session is created/edited, invalidate cache and enqueue recalc
 */
export async function invalidateCacheForSession(userId: number) {
  const { enqueueCacheRecalc, markCacheAsStale } = await import("./cache.js");

  // Mark cache as stale
  await markCacheAsStale(userId, "session_created_or_edited");

  // Enqueue full recalculation
  await enqueueCacheRecalc(userId, "incremental", "session_edit", userId);

  console.log(`[Cache] Invalidated for user ${userId} due to session change`);
}

/**
 * Helper: Calculate win rate percentage
 */
function calculateWinRate(itmCount: number, totalTournaments: number): number {
  if (totalTournaments === 0) return 0;
  return Math.round((itmCount / totalTournaments) * 100);
}

/**
 * Helper: Calculate ROI percentage * 100
 */
function calculateROI(buyIns: number, cashOuts: number): number {
  if (buyIns === 0) return 0;
  return Math.round(((cashOuts - buyIns) / buyIns) * 10000);
}

/**
 * Get bankroll history with caching
 * Fast path for charts/graphs that need historical data
 */
export async function getBankrollHistoryWithCache(
  userId: number,
  type?: "online" | "live"
): Promise<Array<{
  id: number;
  sessionDate: Date;
  type: "online" | "live";
  buyIn: number;
  cashOut: number;
}>> {
  // Try to get from cache first
  const cachedHistory = await getBankrollHistoryFromCache(userId, type);

  if (cachedHistory && cachedHistory.historyJson) {
    console.log(`[Cache] HIT: Bankroll history for user ${userId}`);
    
    try {
      const parsed = JSON.parse(cachedHistory.historyJson);
      // Convert date strings back to Date objects
      return parsed.map((item: any) => ({
        ...item,
        sessionDate: new Date(item.sessionDate),
      }));
    } catch (error) {
      console.error(`[Cache] Error parsing bankroll history cache:`, error);
    }
  }

  console.log(`[Cache] MISS: Bankroll history for user ${userId} - calculating...`);

  // Cache miss - calculate history (expensive operation)
  const history = await getBankrollHistory(userId, type);

  // Save to cache in background (don't wait)
  if (history.length > 0) {
    const dateRangeStart = new Date(Math.min(...history.map(h => new Date(h.sessionDate).getTime())));
    const dateRangeEnd = new Date(Math.max(...history.map(h => new Date(h.sessionDate).getTime())));
    
    setBankrollHistoryCache(userId, type || "both", history, dateRangeStart, dateRangeEnd).catch((err) =>
      console.error(`[Cache] Error saving bankroll history:`, err)
    );
  }

  // Enqueue job for next recalculation (runs in background)
  enqueueCacheRecalc(userId, "full_recalc", "new_session", userId).catch((err) =>
    console.error(`[Cache] Error enqueuing job:`, err)
  );

  return history;
}
