ALTER TABLE `users`
  ADD `preferredPlatforms` text,
  ADD `preferredFormats` text,
  ADD `preferredBuyIns` text,
  ADD `playsMultiPlatform` int DEFAULT 0,
  ADD `onboardingCompletedAt` timestamp;