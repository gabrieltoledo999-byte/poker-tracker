CREATE TABLE `friend_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`receiverId` int NOT NULL,
	`status` enum('pending','accepted','rejected','canceled') NOT NULL DEFAULT 'pending',
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(8) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `post_reactions_id` PRIMARY KEY(`id`)
);
