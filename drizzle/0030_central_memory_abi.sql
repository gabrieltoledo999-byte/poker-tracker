ALTER TABLE `users`
MODIFY COLUMN `role` enum('user','coach','reviewer','admin','developer','system_ai_service') NOT NULL DEFAULT 'user';

CREATE TABLE `user_consents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `consentVersion` varchar(32) NOT NULL,
  `allowDataStorage` int NOT NULL DEFAULT 0,
  `allowSharedInternalAnalysis` int NOT NULL DEFAULT 0,
  `allowAiTrainingUsage` int NOT NULL DEFAULT 0,
  `allowDeveloperAccess` int NOT NULL DEFAULT 0,
  `allowFieldAggregation` int NOT NULL DEFAULT 0,
  `grantedAt` timestamp NOT NULL DEFAULT (now()),
  `revokedAt` timestamp,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_consents_id` PRIMARY KEY(`id`)
);

CREATE TABLE `user_data_access_grants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerUserId` int NOT NULL,
  `viewerUserId` int NOT NULL,
  `allowHandReview` int NOT NULL DEFAULT 1,
  `allowTrainerAccess` int NOT NULL DEFAULT 0,
  `allowGtoAccess` int NOT NULL DEFAULT 0,
  `allowFieldComparison` int NOT NULL DEFAULT 0,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_data_access_grants_id` PRIMARY KEY(`id`)
);

CREATE TABLE `data_access_audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actorUserId` int,
  `targetUserId` int NOT NULL,
  `actorRole` varchar(40),
  `accessScope` varchar(64) NOT NULL,
  `accessMethod` varchar(32) NOT NULL DEFAULT 'trpc',
  `reason` text,
  `outcome` enum('allowed','denied') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `data_access_audit_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `central_tournaments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `externalTournamentId` varchar(191),
  `userId` int NOT NULL,
  `site` varchar(64) NOT NULL,
  `format` varchar(32) NOT NULL DEFAULT 'tournament',
  `buyIn` int NOT NULL DEFAULT 0,
  `fee` int NOT NULL DEFAULT 0,
  `totalCost` int NOT NULL DEFAULT 0,
  `currency` enum('BRL','USD','CAD','JPY','CNY','EUR') NOT NULL DEFAULT 'BRL',
  `abiValue` int NOT NULL DEFAULT 0,
  `abiBucket` varchar(32) NOT NULL DEFAULT 'micro',
  `playerAbiSnapshot` int NOT NULL DEFAULT 0,
  `importedAt` timestamp NOT NULL DEFAULT (now()),
  `totalHands` int NOT NULL DEFAULT 0,
  `finalPosition` int,
  `wasEliminated` int NOT NULL DEFAULT 0,
  `eliminationHandId` int,
  `rawSourceId` varchar(191),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `central_tournaments_id` PRIMARY KEY(`id`)
);

CREATE TABLE `central_hands` (
  `id` int AUTO_INCREMENT NOT NULL,
  `externalHandId` varchar(191),
  `tournamentId` int NOT NULL,
  `userId` int NOT NULL,
  `handNumber` varchar(64),
  `datetimeOriginal` timestamp,
  `buttonSeat` int,
  `heroSeat` int,
  `heroPosition` varchar(16),
  `smallBlind` int DEFAULT 0,
  `bigBlind` int DEFAULT 0,
  `ante` int DEFAULT 0,
  `board` text,
  `heroCards` varchar(32),
  `totalPot` int,
  `rake` int,
  `result` int,
  `showdown` int NOT NULL DEFAULT 0,
  `rawText` text,
  `parsedJson` mediumtext,
  `handContextJson` mediumtext,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `central_hands_id` PRIMARY KEY(`id`)
);

CREATE TABLE `central_hand_actions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `handId` int NOT NULL,
  `tournamentId` int NOT NULL,
  `userId` int NOT NULL,
  `street` enum('preflop','flop','turn','river','showdown','summary') NOT NULL,
  `actionOrder` int NOT NULL DEFAULT 0,
  `playerName` varchar(120) NOT NULL,
  `seat` int,
  `position` varchar(16),
  `actionType` enum('fold','check','call','bet','raise','all_in','post_blind','post_ante','straddle','show','muck','collect','other') NOT NULL,
  `amount` int,
  `toAmount` int,
  `stackBefore` int,
  `stackAfter` int,
  `potBefore` int,
  `potAfter` int,
  `isAllIn` int NOT NULL DEFAULT 0,
  `isForced` int NOT NULL DEFAULT 0,
  `facingActionType` varchar(32),
  `facingSizeBb` int,
  `heroInHand` int NOT NULL DEFAULT 0,
  `showdownVisible` int NOT NULL DEFAULT 0,
  `contextJson` mediumtext,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `central_hand_actions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `showdown_records` (
  `id` int AUTO_INCREMENT NOT NULL,
  `handId` int NOT NULL,
  `tournamentId` int NOT NULL,
  `userId` int NOT NULL,
  `playerName` varchar(120) NOT NULL,
  `seat` int,
  `position` varchar(16),
  `holeCards` varchar(64),
  `finalHandDescription` text,
  `wonPot` int NOT NULL DEFAULT 0,
  `amountWon` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `showdown_records_id` PRIMARY KEY(`id`)
);

ALTER TABLE `player_tournament_stats`
ADD COLUMN `abiBucket` varchar(32) NOT NULL DEFAULT 'micro',
ADD COLUMN `totalCost` int NOT NULL DEFAULT 0;

ALTER TABLE `player_aggregate_stats`
ADD COLUMN `averageAbi` int NOT NULL DEFAULT 0,
ADD COLUMN `medianAbi` int NOT NULL DEFAULT 0;

CREATE TABLE `player_stats_by_abi` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `abiBucket` varchar(32) NOT NULL,
  `tournaments` int NOT NULL DEFAULT 0,
  `handsPlayed` int NOT NULL DEFAULT 0,
  `vpip` int,
  `pfr` int,
  `threeBet` int,
  `cbetFlop` int,
  `bbDefense` int,
  `avgFinishPosition` int,
  `itmRate` int,
  `roiEstimate` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `player_stats_by_abi_id` PRIMARY KEY(`id`)
);

CREATE TABLE `field_aggregate_stats_by_abi` (
  `id` int AUTO_INCREMENT NOT NULL,
  `site` varchar(64) NOT NULL,
  `abiBucket` varchar(32) NOT NULL,
  `sampleTournaments` int NOT NULL DEFAULT 0,
  `sampleHands` int NOT NULL DEFAULT 0,
  `avgVpip` int,
  `avgPfr` int,
  `avgThreeBet` int,
  `avgCbetFlop` int,
  `avgBbDefense` int,
  `avgSteal` int,
  `avgOpenSizeBb` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `field_aggregate_stats_by_abi_id` PRIMARY KEY(`id`)
);

CREATE TABLE `player_stats_by_position_and_abi` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `abiBucket` varchar(32) NOT NULL,
  `position` varchar(16) NOT NULL,
  `handsPlayed` int NOT NULL DEFAULT 0,
  `vpip` int,
  `pfr` int,
  `threeBet` int,
  `netChips` int,
  `bb100` int,
  `stealAttempt` int,
  `foldTo3Bet` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `player_stats_by_position_and_abi_id` PRIMARY KEY(`id`)
);
