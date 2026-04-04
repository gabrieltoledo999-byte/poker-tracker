CREATE TABLE `active_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `active_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `active_sessions_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `session_tables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activeSessionId` int,
	`sessionId` int,
	`userId` int NOT NULL,
	`venueId` int,
	`type` enum('online','live') NOT NULL DEFAULT 'online',
	`gameFormat` enum('cash_game','tournament','turbo','hyper_turbo','sit_and_go','spin_and_go','bounty','satellite','freeroll','home_game') NOT NULL DEFAULT 'tournament',
	`currency` enum('BRL','USD','CAD','JPY') NOT NULL DEFAULT 'BRL',
	`buyIn` int NOT NULL DEFAULT 0,
	`cashOut` int,
	`gameType` varchar(64),
	`stakes` varchar(32),
	`notes` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_tables_id` PRIMARY KEY(`id`)
);
