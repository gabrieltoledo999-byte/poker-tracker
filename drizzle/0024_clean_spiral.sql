CREATE TABLE `user_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`blockedUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `aaHands` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `aaWins` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `aaLosses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `akHands` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `akWins` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hand_pattern_counters` ADD `akLosses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session_tables` ADD `initialBuyIn` int;--> statement-breakpoint
ALTER TABLE `session_tables` ADD `rebuyCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session_tables` ADD `clubName` varchar(120);