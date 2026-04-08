ALTER TABLE `users`
  ADD `showInGlobalRanking` int NOT NULL DEFAULT 0,
  ADD `showInFriendsRanking` int NOT NULL DEFAULT 0,
  ADD `rankingConsentAnsweredAt` timestamp NULL;
