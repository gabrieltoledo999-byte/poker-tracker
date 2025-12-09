ALTER TABLE `sessions` ADD `currency` enum('BRL','USD') DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `originalBuyIn` int;--> statement-breakpoint
ALTER TABLE `sessions` ADD `originalCashOut` int;--> statement-breakpoint
ALTER TABLE `sessions` ADD `exchangeRate` int;