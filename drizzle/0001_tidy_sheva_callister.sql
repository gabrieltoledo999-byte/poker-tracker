CREATE TABLE `bankroll_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`initialOnline` int NOT NULL DEFAULT 100000,
	`initialLive` int NOT NULL DEFAULT 400000,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bankroll_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bankroll_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('online','live') NOT NULL,
	`buyIn` int NOT NULL,
	`cashOut` int NOT NULL,
	`sessionDate` timestamp NOT NULL,
	`durationMinutes` int NOT NULL,
	`notes` text,
	`gameType` varchar(64),
	`stakes` varchar(32),
	`location` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
