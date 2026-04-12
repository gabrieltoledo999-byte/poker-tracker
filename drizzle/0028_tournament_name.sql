ALTER TABLE `sessions`
ADD COLUMN `tournamentName` varchar(160);

ALTER TABLE `session_tables`
ADD COLUMN `tournamentName` varchar(160);
