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
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `avatarUrl` mediumtext;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `preferredPlayType` enum('online','live');--> statement-breakpoint
ALTER TABLE `users` ADD `preferredPlatforms` text;--> statement-breakpoint
ALTER TABLE `users` ADD `preferredFormats` text;--> statement-breakpoint
ALTER TABLE `users` ADD `preferredBuyIns` text;--> statement-breakpoint
ALTER TABLE `users` ADD `preferredBuyInsOnline` text;--> statement-breakpoint
ALTER TABLE `users` ADD `preferredBuyInsLive` text;--> statement-breakpoint
ALTER TABLE `users` ADD `playsMultiPlatform` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `showInGlobalRanking` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `showInFriendsRanking` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `rankingConsentAnsweredAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `playStyleAnsweredAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `onboardingCompletedAt` timestamp;