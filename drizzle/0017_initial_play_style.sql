ALTER TABLE `users`
  ADD `preferredPlayType` enum('online','live'),
  ADD `playStyleAnsweredAt` timestamp;
