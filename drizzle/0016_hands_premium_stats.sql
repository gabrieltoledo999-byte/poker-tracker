CREATE TABLE `hand_pattern_counters` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `kkHands` int NOT NULL DEFAULT 0,
  `kkWins` int NOT NULL DEFAULT 0,
  `kkLosses` int NOT NULL DEFAULT 0,
  `jjHands` int NOT NULL DEFAULT 0,
  `jjWins` int NOT NULL DEFAULT 0,
  `jjLosses` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `hand_pattern_counters_id` PRIMARY KEY(`id`),
  CONSTRAINT `hand_pattern_counters_userId_unique` UNIQUE(`userId`)
);
