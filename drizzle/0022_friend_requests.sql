CREATE TABLE `friend_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requesterId` int NOT NULL,
  `receiverId` int NOT NULL,
  `status` enum('pending','accepted','rejected','canceled') NOT NULL DEFAULT 'pending',
  `respondedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `friend_requests_id` PRIMARY KEY(`id`)
);

CREATE INDEX `friend_requests_requester_idx` ON `friend_requests` (`requesterId`);
CREATE INDEX `friend_requests_receiver_idx` ON `friend_requests` (`receiverId`);
CREATE INDEX `friend_requests_status_idx` ON `friend_requests` (`status`);
