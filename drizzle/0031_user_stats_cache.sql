-- Cached session statistics per user (online/live consolidated)
-- Recalculated via background jobs, read directly on dashboard
CREATE TABLE IF NOT EXISTS `user_session_stats_cache` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `type` enum('online', 'live') NOT NULL,
  
  -- Aggregated counts
  `totalSessions` int NOT NULL DEFAULT 0,
  `totalCashSessions` int NOT NULL DEFAULT 0,
  `totalTournaments` int NOT NULL DEFAULT 0,
  `totalTournamentsPlayed` int NOT NULL DEFAULT 0,
  
  -- Financial aggregates (in BRL centavos)
  `totalBuyIns` bigint NOT NULL DEFAULT 0,
  `totalCashOuts` bigint NOT NULL DEFAULT 0,
  `netProfit` bigint NOT NULL DEFAULT 0,
  `roi` int NOT NULL DEFAULT 0, -- percentage * 100 (e.g., 15.5% = 1550)
  
  -- Tournament specific
  `tournamentsItm` int NOT NULL DEFAULT 0,
  `tournamentsCashed` int NOT NULL DEFAULT 0,
  `tournamentsTrophies` int NOT NULL DEFAULT 0,
  `avgTournamentPosition` int NOT NULL DEFAULT 0,
  `bestFinish` int,
  
  -- Time aggregates
  `totalPlayedMinutes` bigint NOT NULL DEFAULT 0,
  `averageSessionMinutes` int NOT NULL DEFAULT 0,
  `hourlyRate` bigint NOT NULL DEFAULT 0, -- in centavos per hour
  `bb100Rate` bigint NOT NULL DEFAULT 0, -- big blinds per 100 hands
  
  -- Venue breakdown (JSON for flexibility)
  `venueStatsJson` mediumtext,
  
  -- Cache validity
  `lastRecalculated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isStale` tinyint NOT NULL DEFAULT 0,
  `staleSince` timestamp,
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_userId` (`userId`),
  INDEX `idx_type` (`type`),
  INDEX `idx_stale` (`isStale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cached player metrics breakdown by ABI bucket
CREATE TABLE IF NOT EXISTS `player_abi_stats_cache` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `abiBucket` varchar(32) NOT NULL,
  
  -- Hand/tournament counts
  `handsPlayed` int NOT NULL DEFAULT 0,
  `tournamentsPlayed` int NOT NULL DEFAULT 0,
  `tournamentsItm` int NOT NULL DEFAULT 0,
  
  -- Poker stats
  `vpip` int NOT NULL DEFAULT 0,
  `pfr` int NOT NULL DEFAULT 0,
  `threeBet` int NOT NULL DEFAULT 0,
  `cbetFlop` int NOT NULL DEFAULT 0,
  `foldToCbet` int NOT NULL DEFAULT 0,
  `bbDefense` int NOT NULL DEFAULT 0,
  `stealAttempt` int NOT NULL DEFAULT 0,
  `aggressionFactor` int NOT NULL DEFAULT 0,
  `wtsd` int NOT NULL DEFAULT 0,
  `wsd` int NOT NULL DEFAULT 0,
  
  -- Financial
  `netChips` bigint NOT NULL DEFAULT 0,
  `roi` int NOT NULL DEFAULT 0,
  
  -- Cache validity
  `lastRecalculated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isStale` tinyint NOT NULL DEFAULT 0,
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY `uk_user_bucket` (`userId`, `abiBucket`),
  INDEX `idx_userId` (`userId`),
  INDEX `idx_stale` (`isStale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Queue for cache recalculation jobs
-- Async processing: web server adds jobs, background worker processes them
CREATE TABLE IF NOT EXISTS `cache_recalc_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `jobType` enum('full_recalc', 'incremental', 'venue_stats', 'tournament_stats') NOT NULL,
  `priority` int NOT NULL DEFAULT 5,
  
  -- Trigger info
  `triggeredBy` enum('manual', 'new_session', 'session_edit', 'scheduled') NOT NULL DEFAULT 'manual',
  `triggeredByUserId` int,
  
  -- Processing state
  `status` enum('pending', 'processing', 'completed', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  `processedAt` timestamp,
  `completedAt` timestamp,
  `errorMessage` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `maxRetries` int NOT NULL DEFAULT 3,
  
  -- Metadata
  `startTimestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estimatedDurationMs` int,
  `actualDurationMs` int,
  `processorInstanceId` varchar(64),
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_status` (`status`),
  INDEX `idx_userId_status` (`userId`, `status`),
  INDEX `idx_priority_status` (`priority` DESC, `status`),
  INDEX `idx_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cache invalidation tracking
-- When a session is created/edited, mark related caches as stale
CREATE TABLE IF NOT EXISTS `cache_invalidation_log` (
  `id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `invalidationType` varchar(64) NOT NULL,
  `relatedSessionId` int,
  `relatedTournamentId` int,
  `reason` text,
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_userId_createdAt` (`userId`, `createdAt`),
  INDEX `idx_sessionId` (`relatedSessionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leaderboard cache (for global rankings that update periodically)
CREATE TABLE IF NOT EXISTS `leaderboard_cache` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `rank` int NOT NULL,
  `metric` enum('profit', 'roi', 'bb100', 'tournaments_itm', 'tournaments_trophies') NOT NULL DEFAULT 'profit',
  
  -- Cached snapshot
  `metricValue` bigint NOT NULL,
  `displayValue` varchar(64),
  
  -- User snapshot
  `userName` varchar(255),
  `userAvatarUrl` varchar(512),
  `userRole` varchar(32),
  
  `lastRecalculated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isStale` tinyint NOT NULL DEFAULT 0,
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY `uk_metric_rank` (`metric`, `rank`),
  INDEX `idx_metric` (`metric`),
  INDEX `idx_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
