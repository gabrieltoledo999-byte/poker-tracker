-- Adiciona metadados de tamanho de aposta (em bb × 10) aos cenários GTO.
-- openSizeBbX10: tamanho do open RFI (ex: 23 = 2.3bb)
-- threeBetSizeBbX10: tamanho do 3-bet enfrentando RFI (ex: 80 = 8bb)
ALTER TABLE `gto_baseado_scenarios`
  ADD COLUMN `openSizeBbX10` int NOT NULL DEFAULT 0,
  ADD COLUMN `threeBetSizeBbX10` int NOT NULL DEFAULT 0;
