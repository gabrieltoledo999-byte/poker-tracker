CREATE TABLE `fund_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`transactionType` enum('deposit','withdrawal') NOT NULL,
	`bankrollType` enum('online','live') NOT NULL,
	`amount` int NOT NULL,
	`currency` enum('BRL','USD') NOT NULL DEFAULT 'BRL',
	`originalAmount` int,
	`exchangeRate` int,
	`description` text,
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fund_transactions_id` PRIMARY KEY(`id`)
);
