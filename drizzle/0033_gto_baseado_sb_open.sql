CREATE TABLE `gto_baseado_scenarios` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(120) NOT NULL,
  `title` varchar(191) NOT NULL,
  `source` varchar(80) NOT NULL DEFAULT 'gto_wizard_ai',
  `gameType` varchar(40) NOT NULL DEFAULT 'heads_up',
  `heroPosition` varchar(8) NOT NULL DEFAULT 'SB',
  `villainPosition` varchar(8) NOT NULL DEFAULT 'BB',
  `effectiveStackBb` int NOT NULL DEFAULT 200,
  `smallBlind` int NOT NULL DEFAULT 50,
  `bigBlind` int NOT NULL DEFAULT 100,
  `weightedRaisePctX10` int NOT NULL DEFAULT 0,
  `weightedLimpCheckPctX10` int NOT NULL DEFAULT 0,
  `weightedFoldPctX10` int NOT NULL DEFAULT 0,
  `cellAvgRaisePctX10` int NOT NULL DEFAULT 0,
  `cellAvgLimpCheckPctX10` int NOT NULL DEFAULT 0,
  `cellAvgFoldPctX10` int NOT NULL DEFAULT 0,
  `totalCombos` int NOT NULL DEFAULT 1326,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gto_baseado_scenarios_id` PRIMARY KEY(`id`),
  CONSTRAINT `gto_baseado_scenarios_slug_unique` UNIQUE(`slug`)
);

CREATE TABLE `gto_baseado_hands` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scenarioId` int NOT NULL,
  `handCode` varchar(8) NOT NULL,
  `handType` enum('pares','suited','offsuit') NOT NULL,
  `combos` int NOT NULL,
  `raisePctX10` int NOT NULL DEFAULT 0,
  `limpCheckPctX10` int NOT NULL DEFAULT 0,
  `foldPctX10` int NOT NULL DEFAULT 0,
  `raiseBucket` varchar(40),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gto_baseado_hands_id` PRIMARY KEY(`id`),
  CONSTRAINT `gto_baseado_hands_scenario_hand_unique` UNIQUE(`scenarioId`,`handCode`)
);

CREATE INDEX `gto_baseado_hands_scenario_idx` ON `gto_baseado_hands` (`scenarioId`);
CREATE INDEX `gto_baseado_hands_type_idx` ON `gto_baseado_hands` (`handType`);
CREATE INDEX `gto_baseado_hands_bucket_idx` ON `gto_baseado_hands` (`raiseBucket`);
