ALTER TABLE `venues` ADD `currency` enum('BRL','USD','JPY') DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `venues` ADD `balance` int DEFAULT 0 NOT NULL;