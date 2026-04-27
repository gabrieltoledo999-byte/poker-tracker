/**
 * CACHE TABLE para Bankroll History
 * Adicionar ao schema.ts
 */

CREATE TABLE IF NOT EXISTS `bankroll_history_cache` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `type` enum('online', 'live', 'both') NOT NULL DEFAULT 'both',
  
  -- Dados comprimidos do histórico
  `historyJson` mediumtext NOT NULL,
  
  -- Estatísticas de cache
  `totalPoints` int NOT NULL DEFAULT 0,
  `dateRangeStart` timestamp,
  `dateRangeEnd` timestamp,
  
  -- Cache validity
  `lastRecalculated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isStale` tinyint NOT NULL DEFAULT 0,
  `staleSince` timestamp,
  
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_userId_type` (`userId`, `type`),
  INDEX `idx_isStale` (`isStale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
