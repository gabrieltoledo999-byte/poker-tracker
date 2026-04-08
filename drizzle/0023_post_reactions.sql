CREATE TABLE `post_reactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int NOT NULL,
  `userId` int NOT NULL,
  `emoji` varchar(8) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `post_reactions_id` PRIMARY KEY(`id`)
);

CREATE UNIQUE INDEX `post_reactions_post_user_unique` ON `post_reactions` (`postId`,`userId`);
CREATE INDEX `post_reactions_post_idx` ON `post_reactions` (`postId`);
CREATE INDEX `post_reactions_emoji_idx` ON `post_reactions` (`emoji`);
