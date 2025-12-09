CREATE TABLE `invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inviterId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`inviteeId` int,
	`inviteeEmail` varchar(320),
	`status` enum('pending','accepted','expired') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	`expiresAt` timestamp,
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `inviteCode` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `invitedBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD `inviteCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_inviteCode_unique` UNIQUE(`inviteCode`);