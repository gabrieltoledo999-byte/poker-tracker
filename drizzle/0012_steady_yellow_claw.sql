CREATE TABLE `venue_balance_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`venueId` int NOT NULL,
	`changeType` enum('manual','session','initial') NOT NULL,
	`balanceBefore` int NOT NULL DEFAULT 0,
	`balanceAfter` int NOT NULL,
	`delta` int NOT NULL,
	`currency` enum('BRL','USD','JPY') NOT NULL DEFAULT 'BRL',
	`sessionId` int,
	`note` text,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venue_balance_history_id` PRIMARY KEY(`id`)
);
