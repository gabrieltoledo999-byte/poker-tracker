ALTER TABLE `player_position_stats`
ADD COLUMN `allInAdjBb100` int NOT NULL DEFAULT 0 AFTER `winRateBb100`,
ADD COLUMN `cbetFlop` int NOT NULL DEFAULT 0 AFTER `threeBet`,
ADD COLUMN `cbetTurn` int NOT NULL DEFAULT 0 AFTER `cbetFlop`,
ADD COLUMN `foldToCbet` int NOT NULL DEFAULT 0 AFTER `cbetTurn`,
ADD COLUMN `stealAttempt` int NOT NULL DEFAULT 0 AFTER `bbDefenseWhenApplicable`,
ADD COLUMN `coldCall` int NOT NULL DEFAULT 0 AFTER `stealAttempt`,
ADD COLUMN `squeeze` int NOT NULL DEFAULT 0 AFTER `coldCall`,
ADD COLUMN `resteal` int NOT NULL DEFAULT 0 AFTER `squeeze`;
