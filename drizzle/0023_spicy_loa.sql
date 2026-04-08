ALTER TABLE `fund_transactions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL';--> statement-breakpoint
ALTER TABLE `session_tables` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL';--> statement-breakpoint
ALTER TABLE `sessions` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL';--> statement-breakpoint
ALTER TABLE `venue_balance_history` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL';--> statement-breakpoint
ALTER TABLE `venues` MODIFY COLUMN `currency` enum('BRL','USD','CAD','JPY','CNY') NOT NULL DEFAULT 'BRL';