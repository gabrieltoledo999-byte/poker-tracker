import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql } from "drizzle-orm";
import { gtoBaseadoHands, gtoBaseadoScenarios } from "../drizzle/schema";

type SpotHand = Record<string, number>;

type SpotInput = {
  id: string;
  title?: string;
  stackBb?: number;
  format?: string;
  heroPosition?: string;
  villainPosition?: string;
  actions?: string[];
  sizes?: Record<string, number>;
  targetFrequencies?: Record<string, number>;
  validatedFrequenciesAfterRounding?: Record<string, number>;
  hands: Record<string, SpotHand>;
};

type MultiSpotInput = {
  version?: string;
  stackBb?: number;
  spots: SpotInput[];
};

const toPctX10 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10);

const RAISE_ACTION_KEYS = ["raise_3bet", "3bet", "three_bet", "raise", "jam"];
const PASSIVE_ACTION_KEYS = ["limp_check", "call", "check", "limp"];
const FOLD_ACTION_KEYS = ["fold"];

const POSITION_TOKENS = new Set(["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);

function normalizeActionKey(action: string): string {
  return action.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function getHandTypeAndCombos(handCode: string): { handType: "pares" | "suited" | "offsuit"; combos: number } {
  const trimmed = handCode.trim();
  if (trimmed.length === 2 && trimmed[0] === trimmed[1]) {
    return { handType: "pares", combos: 6 };
  }

  if (trimmed.length === 3) {
    if (trimmed[2] === "s" || trimmed[2] === "S") {
      return { handType: "suited", combos: 4 };
    }
    if (trimmed[2] === "o" || trimmed[2] === "O") {
      return { handType: "offsuit", combos: 12 };
    }
  }

  throw new Error(`Formato de mao invalido: ${handCode}`);
}

function buildNormalizedValueMap(source: Record<string, unknown> | undefined): Record<string, number> {
  // Strong normalization: lowercase + strip every non-alphanumeric so that
  // "threeBet", "three_bet", "3-bet", "3Bet" all collapse to a single shape.
  const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/pct$/, "");
  const normalized: Record<string, number> = {};
  if (!source || typeof source !== "object") return normalized;

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    normalized[canon(rawKey)] = value;
  }
  return normalized;
}

function sumActionValues(source: SpotHand, keys: string[]): number {
  const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/pct$/, "");
  const normalizedSource = buildNormalizedValueMap(source);
  let sum = 0;

  for (const key of keys) {
    const k = canon(key);
    if (Object.prototype.hasOwnProperty.call(normalizedSource, k)) {
      sum += normalizedSource[k];
    }
  }
  return sum;
}

function derivePositions(spotId: string): { heroPosition: string; villainPosition: string } {
  const rawParts = spotId
    .split("_")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  if (rawParts.length >= 2 && rawParts[0] === "RFI") {
    const hero = rawParts[1];
    return {
      heroPosition: POSITION_TOKENS.has(hero) ? hero : "UNK",
      villainPosition: "POOL",
    };
  }

  if (rawParts.length >= 3) {
    const vsIndex = rawParts.indexOf("VS");
    if (vsIndex === 1) {
      const hero = rawParts[0];
      const villain = rawParts[2];
      return {
        heroPosition: POSITION_TOKENS.has(hero) ? hero : "UNK",
        villainPosition: POSITION_TOKENS.has(villain) ? villain : "UNK",
      };
    }
  }

  return { heroPosition: "UNK", villainPosition: "UNK" };
}

function classifyRaiseBucket(raisePct: number): string {
  if (raisePct >= 95) return "pure_raise";
  if (raisePct >= 70) return "high_raise";
  if (raisePct >= 40) return "mixed_raise";
  if (raisePct >= 10) return "low_raise";
  if (raisePct > 0) return "rare_raise";
  return "pure_fold_or_passive";
}

function getSpotTitle(spot: SpotInput): string {
  if (spot.title?.trim()) return spot.title.trim();
  return spot.id;
}

function computeWeightedFrequencies(spot: SpotInput): { raise: number; passive: number; fold: number; totalCombos: number } {
  let weightedRaise = 0;
  let weightedPassive = 0;
  let weightedFold = 0;
  let totalCombos = 0;

  for (const [handCode, actionMap] of Object.entries(spot.hands)) {
    const { combos } = getHandTypeAndCombos(handCode);
    const raise = sumActionValues(actionMap, RAISE_ACTION_KEYS);
    const passive = sumActionValues(actionMap, PASSIVE_ACTION_KEYS);
    let fold = sumActionValues(actionMap, FOLD_ACTION_KEYS);

    const knownSum = raise + passive + fold;
    if (knownSum < 100) {
      fold += 100 - knownSum;
    }

    totalCombos += combos;
    weightedRaise += raise * combos;
    weightedPassive += passive * combos;
    weightedFold += fold * combos;
  }

  if (totalCombos <= 0) {
    return { raise: 0, passive: 0, fold: 0, totalCombos: 1326 };
  }

  return {
    raise: weightedRaise / totalCombos,
    passive: weightedPassive / totalCombos,
    fold: weightedFold / totalCombos,
    totalCombos,
  };
}

async function ensureGtoTables(db: ReturnType<typeof drizzle>) {
  const bootstrapStatements = [
    `CREATE TABLE IF NOT EXISTS \`gto_baseado_scenarios\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`slug\` varchar(120) NOT NULL,
      \`title\` varchar(191) NOT NULL,
      \`source\` varchar(80) NOT NULL DEFAULT 'gto_wizard_ai',
      \`gameType\` varchar(40) NOT NULL DEFAULT 'heads_up',
      \`heroPosition\` varchar(8) NOT NULL DEFAULT 'SB',
      \`villainPosition\` varchar(8) NOT NULL DEFAULT 'BB',
      \`effectiveStackBb\` int NOT NULL DEFAULT 200,
      \`smallBlind\` int NOT NULL DEFAULT 50,
      \`bigBlind\` int NOT NULL DEFAULT 100,
      \`weightedRaisePctX10\` int NOT NULL DEFAULT 0,
      \`weightedLimpCheckPctX10\` int NOT NULL DEFAULT 0,
      \`weightedFoldPctX10\` int NOT NULL DEFAULT 0,
      \`cellAvgRaisePctX10\` int NOT NULL DEFAULT 0,
      \`cellAvgLimpCheckPctX10\` int NOT NULL DEFAULT 0,
      \`cellAvgFoldPctX10\` int NOT NULL DEFAULT 0,
      \`totalCombos\` int NOT NULL DEFAULT 1326,
      \`openSizeBbX10\` int NOT NULL DEFAULT 0,
      \`threeBetSizeBbX10\` int NOT NULL DEFAULT 0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`gto_baseado_scenarios_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`gto_baseado_hands\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`scenarioId\` int NOT NULL,
      \`handCode\` varchar(8) NOT NULL,
      \`handType\` enum('pares','suited','offsuit') NOT NULL,
      \`combos\` int NOT NULL,
      \`raisePctX10\` int NOT NULL DEFAULT 0,
      \`limpCheckPctX10\` int NOT NULL DEFAULT 0,
      \`foldPctX10\` int NOT NULL DEFAULT 0,
      \`raiseBucket\` varchar(40),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`gto_baseado_hands_id\` PRIMARY KEY(\`id\`)
    )`,
    "CREATE UNIQUE INDEX `gto_baseado_scenarios_slug_unique` ON `gto_baseado_scenarios` (`slug`)",
    "CREATE UNIQUE INDEX `gto_baseado_hands_scenario_hand_unique` ON `gto_baseado_hands` (`scenarioId`,`handCode`)",
    "CREATE INDEX `gto_baseado_hands_scenario_idx` ON `gto_baseado_hands` (`scenarioId`)",
    "CREATE INDEX `gto_baseado_hands_type_idx` ON `gto_baseado_hands` (`handType`)",
    "CREATE INDEX `gto_baseado_hands_bucket_idx` ON `gto_baseado_hands` (`raiseBucket`)",
    "ALTER TABLE `gto_baseado_scenarios` ADD COLUMN `openSizeBbX10` int NOT NULL DEFAULT 0",
    "ALTER TABLE `gto_baseado_scenarios` ADD COLUMN `threeBetSizeBbX10` int NOT NULL DEFAULT 0",
  ];

  for (const statement of bootstrapStatements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (err: any) {
      const errno = Number(err?.errno ?? err?.cause?.errno ?? -1);
      const code = String(err?.code ?? err?.cause?.code ?? "").toUpperCase();
      const message = String(err?.message ?? err?.cause?.message ?? "").toLowerCase();
      const ignorable =
        errno === 1060 ||
        errno === 1061 ||
        code === "ER_DUP_FIELDNAME" ||
        code === "ER_DUP_KEYNAME" ||
        message.includes("duplicate column name") ||
        message.includes("duplicate key name") ||
        message.includes("already exists");

      if (!ignorable) {
        throw err;
      }
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing");
  }

  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error(
      "Use: pnpm gto:import:spots <caminho-do-json>. Exemplo: pnpm gto:import:spots C:/Users/Toleto/Downloads/spots_100bb_combined.json",
    );
  }

  const normalizedPath = path.resolve(filePath);
  const raw = await readFile(normalizedPath, "utf8");
  const input = JSON.parse(raw) as MultiSpotInput;

  if (!Array.isArray(input.spots) || input.spots.length === 0) {
    throw new Error("JSON sem spots para importar");
  }

  const db = drizzle(databaseUrl);
  await ensureGtoTables(db);

  const importSummary: Array<{ slug: string; title: string; importedHands: number; hero: string; villain: string }> = [];

  for (const spot of input.spots) {
    if (!spot.id || !spot.hands || typeof spot.hands !== "object") {
      throw new Error(`Spot invalido no arquivo: ${JSON.stringify({ id: spot.id })}`);
    }

    const slug = normalizeSlug(`gto-${spot.id}`);
    const derived = derivePositions(spot.id);
    const explicitHero = spot.heroPosition?.trim().toUpperCase();
    const explicitVillain = spot.villainPosition?.trim().toUpperCase();
    const heroPosition = explicitHero && POSITION_TOKENS.has(explicitHero) ? explicitHero : derived.heroPosition;
    const villainPosition = explicitVillain && POSITION_TOKENS.has(explicitVillain)
      ? explicitVillain
      : (explicitVillain === "" || !explicitVillain ? (derived.villainPosition === "UNK" ? "POOL" : derived.villainPosition) : derived.villainPosition);
    const weighted = computeWeightedFrequencies(spot);

    const target = buildNormalizedValueMap(spot.targetFrequencies as Record<string, unknown> | undefined);
    const raiseTarget = Number((target.raise ?? 0) + (target.open ?? 0) + (target.allin ?? 0) + (target.shove ?? 0) + (target.jam ?? 0));
    const foldTarget = Number(target.fold);
    const passiveTargetRaw = Number((target.limpcheck ?? 0) + (target.call ?? 0) + (target.check ?? 0) + (target.limp ?? 0));
    const passiveTargetFromResidual = 100 - (Number.isFinite(raiseTarget) ? raiseTarget : weighted.raise) - (Number.isFinite(foldTarget) ? foldTarget : weighted.fold);
    const passiveTarget = Number.isFinite(passiveTargetRaw) && passiveTargetRaw > 0
      ? passiveTargetRaw
      : passiveTargetFromResidual;

    // Extract bet sizing metadata (canonical key match: open_size / threeBetSize / 3bet_size / etc.)
    const sizesCanon: Record<string, number> = {};
    if (spot.sizes && typeof spot.sizes === "object") {
      for (const [k, v] of Object.entries(spot.sizes)) {
        const canon = k.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const n = Number(v);
        if (Number.isFinite(n)) sizesCanon[canon] = n;
      }
    }
    const openSizeBb = sizesCanon.opensize ?? sizesCanon.rfisize ?? sizesCanon.raisesize ?? 0;
    const threeBetSizeBb = sizesCanon.threebetsize ?? sizesCanon["3betsize"] ?? sizesCanon.raise3betsize ?? 0;
    const openSizeBbX10 = Math.round(openSizeBb * 10);
    const threeBetSizeBbX10 = Math.round(threeBetSizeBb * 10);

    await db
      .insert(gtoBaseadoScenarios)
      .values({
        slug,
        title: getSpotTitle(spot),
        source: "gto_pdf_extracted",
        gameType: spot.format ?? "6max_cash",
        heroPosition,
        villainPosition,
        effectiveStackBb: spot.stackBb ?? input.stackBb ?? 100,
        smallBlind: 50,
        bigBlind: 100,
        weightedRaisePctX10: toPctX10(Number.isFinite(raiseTarget) ? raiseTarget : weighted.raise),
        weightedLimpCheckPctX10: toPctX10(Number.isFinite(passiveTarget) ? passiveTarget : weighted.passive),
        weightedFoldPctX10: toPctX10(Number.isFinite(foldTarget) ? foldTarget : weighted.fold),
        cellAvgRaisePctX10: toPctX10(Number.isFinite(raiseTarget) ? raiseTarget : weighted.raise),
        cellAvgLimpCheckPctX10: toPctX10(Number.isFinite(passiveTarget) ? passiveTarget : weighted.passive),
        cellAvgFoldPctX10: toPctX10(Number.isFinite(foldTarget) ? foldTarget : weighted.fold),
        totalCombos: weighted.totalCombos,
        openSizeBbX10,
        threeBetSizeBbX10,
      })
      .onDuplicateKeyUpdate({
        set: {
          title: getSpotTitle(spot),
          source: "gto_pdf_extracted",
          gameType: spot.format ?? "6max_cash",
          heroPosition,
          villainPosition,
          effectiveStackBb: spot.stackBb ?? input.stackBb ?? 100,
          weightedRaisePctX10: toPctX10(Number.isFinite(raiseTarget) ? raiseTarget : weighted.raise),
          weightedLimpCheckPctX10: toPctX10(Number.isFinite(passiveTarget) ? passiveTarget : weighted.passive),
          weightedFoldPctX10: toPctX10(Number.isFinite(foldTarget) ? foldTarget : weighted.fold),
          cellAvgRaisePctX10: toPctX10(Number.isFinite(raiseTarget) ? raiseTarget : weighted.raise),
          cellAvgLimpCheckPctX10: toPctX10(Number.isFinite(passiveTarget) ? passiveTarget : weighted.passive),
          cellAvgFoldPctX10: toPctX10(Number.isFinite(foldTarget) ? foldTarget : weighted.fold),
          totalCombos: weighted.totalCombos,
          openSizeBbX10,
          threeBetSizeBbX10,
        },
      });

    const scenario = (
      await db
        .select({ id: gtoBaseadoScenarios.id })
        .from(gtoBaseadoScenarios)
        .where(eq(gtoBaseadoScenarios.slug, slug))
        .limit(1)
    )[0];

    if (!scenario) {
      throw new Error(`Nao foi possivel localizar/gerar o scenario GTO para slug ${slug}`);
    }

    await db.delete(gtoBaseadoHands).where(eq(gtoBaseadoHands.scenarioId, scenario.id));

    const handEntries = Object.entries(spot.hands);
    const payload = handEntries.map(([handCode, actionMap]) => {
      const { handType, combos } = getHandTypeAndCombos(handCode);

      const raise = sumActionValues(actionMap, RAISE_ACTION_KEYS);
      const passive = sumActionValues(actionMap, PASSIVE_ACTION_KEYS);
      let fold = sumActionValues(actionMap, FOLD_ACTION_KEYS);

      const knownSum = raise + passive + fold;
      if (knownSum < 100) {
        fold += 100 - knownSum;
      }

      return {
        scenarioId: scenario.id,
        handCode,
        handType,
        combos,
        raisePctX10: toPctX10(raise),
        limpCheckPctX10: toPctX10(passive),
        foldPctX10: toPctX10(fold),
        raiseBucket: classifyRaiseBucket(raise),
      };
    });

    const batchSize = 200;
    for (let i = 0; i < payload.length; i += batchSize) {
      await db.insert(gtoBaseadoHands).values(payload.slice(i, i + batchSize));
    }

    importSummary.push({
      slug,
      title: getSpotTitle(spot),
      importedHands: payload.length,
      hero: heroPosition,
      villain: villainPosition,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        importedScenarios: importSummary.length,
        scenarios: importSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[gto:import:spots] failed:", error);
  process.exit(1);
});
