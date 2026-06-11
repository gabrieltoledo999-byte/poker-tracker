CREATE TABLE IF NOT EXISTS `app_presence_sessions` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `sessionKey` varchar(64) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_app_presence_session_key` (`sessionKey`),
  KEY `idx_app_presence_sessions_userId` (`userId`),
  KEY `idx_app_presence_sessions_lastSeenAt` (`lastSeenAt`),
  KEY `idx_app_presence_sessions_startedAt` (`startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_presence_daily` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `accessDate` date NOT NULL,
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_app_presence_daily_user_date` (`userId`, `accessDate`),
  KEY `idx_app_presence_daily_userId` (`userId`),
  KEY `idx_app_presence_daily_accessDate` (`accessDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;