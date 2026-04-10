CREATE TABLE `user_blocks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `blockedUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `user_blocks_id` PRIMARY KEY(`id`)
);

CREATE UNIQUE INDEX `user_blocks_user_blocked_unique` ON `user_blocks` (`userId`,`blockedUserId`);
