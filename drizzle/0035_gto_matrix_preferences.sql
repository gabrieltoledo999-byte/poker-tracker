CREATE TABLE `gto_matrix_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `barOrientation` enum('diagonal','horizontal','vertical') NOT NULL DEFAULT 'diagonal',
  `barPosition` enum('normal','reverse') NOT NULL DEFAULT 'normal',
  `raiseColor` varchar(16) NOT NULL DEFAULT '#22c55e',
  `callColor` varchar(16) NOT NULL DEFAULT '#a855f7',
  `foldColor` varchar(16) NOT NULL DEFAULT '#2563eb',
  `allinColor` varchar(16) NOT NULL DEFAULT '#ef4444',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gto_matrix_preferences_id` PRIMARY KEY(`id`),
  CONSTRAINT `gto_matrix_preferences_userId_unique` UNIQUE(`userId`)
);
