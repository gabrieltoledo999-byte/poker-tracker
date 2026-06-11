import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  gtoBaseadoHands,
  gtoBaseadoScenarios,
} from "../drizzle/schema";

type InputRow = {
  mao: string;
  tipo: "pares" | "suited" | "offsuit";
  combos: number;
  raise_pct?: number;
  limp_check_pct?: number;
  raise_3bet_pct?: number;
  call_pct?: number;
  fold_pct: number;
};

type InputJson = {
  summary: {
    total_combos: number;
    weighted_total_pct: Record<string, number>;
    cell_average_pct: Record<string, number>;
    bucketed_hands?: Record<string, string[]>;
  };
  rows: InputRow[];
};

type ScenarioConfig = {
  slug: string;
  title: string;
  heroPosition: "SB" | "BB";
  villainPosition: "SB" | "BB";
  raiseSummaryKey: "raise" | "raise_3bet";
  passiveSummaryKey: "limp_check" | "call";
  raiseRowKey: "raise_pct" | "raise_3bet_pct";
  passiveRowKey: "limp_check_pct" | "call_pct";
};

const toPctX10 = (value: number) => Math.round(value * 10);

function getScenarioConfig(inputPath: string): ScenarioConfig {
  const file = path.basename(inputPath).toLowerCase();
  if (file.includes("bb_vs_sb_open")) {
    return {
      slug: "bb-vs-sb-open-hu-200bb-50-100-gto-wizard-ai",
      title: "BB vs SB Open - GTO Wizard AI (HU 200bb, blinds 50/100)",
      heroPosition: "BB",
      villainPosition: "SB",
      raiseSummaryKey: "raise_3bet",
      passiveSummaryKey: "call",
      raiseRowKey: "raise_3bet_pct",
      passiveRowKey: "call_pct",
    };
  }

  return {
    slug: "sb-open-hu-200bb-50-100-gto-wizard-ai",
    title: "SB Open - GTO Wizard AI (HU 200bb, blinds 50/100)",
    heroPosition: "SB",
    villainPosition: "BB",
    raiseSummaryKey: "raise",
    passiveSummaryKey: "limp_check",
    raiseRowKey: "raise_pct",
    passiveRowKey: "limp_check_pct",
  };
}

function buildBucketLookup(bucketedHands?: Record<string, string[]>): Map<string, string> {
  const lookup = new Map<string, string>();
  if (!bucketedHands) return lookup;

  for (const [bucket, hands] of Object.entries(bucketedHands)) {
    for (const hand of hands) {
      lookup.set(hand, bucket);
    }
  }

  return lookup;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing");
  }

  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error(
      "Use: pnpm gto:import:sb-open <caminho-do-json>. Exemplo: pnpm gto:import:sb-open C:/Users/Toleto/Downloads/percentuais_sb_open_gtowizard.json",
    );
  }

  const normalizedPath = path.resolve(filePath);
  const raw = await readFile(normalizedPath, "utf8");
  const input = JSON.parse(raw) as InputJson;
  const scenarioConfig = getScenarioConfig(normalizedPath);

  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("JSON sem rows para importar");
  }

  const db = drizzle(databaseUrl);
  const bucketLookup = buildBucketLookup(input.summary.bucketed_hands);

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
  ];

  for (const statement of bootstrapStatements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (err: any) {
      const errno = Number(err?.errno ?? err?.cause?.errno ?? -1);
      const code = String(err?.code ?? err?.cause?.code ?? "").toUpperCase();
      const message = String(err?.message ?? err?.cause?.message ?? "").toLowerCase();
      const ignorable =
        errno === 1061 ||
        code === "ER_DUP_KEYNAME" ||
        message.includes("duplicate key name") ||
        message.includes("already exists");
      if (!ignorable) {
        throw err;
      }
    }
  }

  await db
    .insert(gtoBaseadoScenarios)
    .values({
      slug: scenarioConfig.slug,
      title: scenarioConfig.title,
      source: "gto_wizard_ai",
      gameType: "heads_up",
      heroPosition: scenarioConfig.heroPosition,
      villainPosition: scenarioConfig.villainPosition,
      effectiveStackBb: 200,
      smallBlind: 50,
      bigBlind: 100,
      weightedRaisePctX10: toPctX10(input.summary.weighted_total_pct[scenarioConfig.raiseSummaryKey] ?? 0),
      weightedLimpCheckPctX10: toPctX10(input.summary.weighted_total_pct[scenarioConfig.passiveSummaryKey] ?? 0),
      weightedFoldPctX10: toPctX10(input.summary.weighted_total_pct.fold ?? 0),
      cellAvgRaisePctX10: toPctX10(input.summary.cell_average_pct[scenarioConfig.raiseSummaryKey] ?? 0),
      cellAvgLimpCheckPctX10: toPctX10(input.summary.cell_average_pct[scenarioConfig.passiveSummaryKey] ?? 0),
      cellAvgFoldPctX10: toPctX10(input.summary.cell_average_pct.fold),
      totalCombos: input.summary.total_combos,
    })
    .onDuplicateKeyUpdate({
      set: {
        title: scenarioConfig.title,
        weightedRaisePctX10: toPctX10(input.summary.weighted_total_pct[scenarioConfig.raiseSummaryKey] ?? 0),
        weightedLimpCheckPctX10: toPctX10(input.summary.weighted_total_pct[scenarioConfig.passiveSummaryKey] ?? 0),
        weightedFoldPctX10: toPctX10(input.summary.weighted_total_pct.fold ?? 0),
        cellAvgRaisePctX10: toPctX10(input.summary.cell_average_pct[scenarioConfig.raiseSummaryKey] ?? 0),
        cellAvgLimpCheckPctX10: toPctX10(input.summary.cell_average_pct[scenarioConfig.passiveSummaryKey] ?? 0),
        cellAvgFoldPctX10: toPctX10(input.summary.cell_average_pct.fold ?? 0),
        totalCombos: input.summary.total_combos,
      },
    });

  const scenario = (
    await db
      .select({ id: gtoBaseadoScenarios.id })
      .from(gtoBaseadoScenarios)
        .where(eq(gtoBaseadoScenarios.slug, scenarioConfig.slug))
      .limit(1)
  )[0];

  if (!scenario) {
    throw new Error("Nao foi possivel localizar/gerar o scenario GTO");
  }

  await db.delete(gtoBaseadoHands).where(eq(gtoBaseadoHands.scenarioId, scenario.id));

  const payload = input.rows.map((row) => ({
    scenarioId: scenario.id,
    handCode: row.mao,
    handType: row.tipo,
    combos: row.combos,
    raisePctX10: toPctX10((row[scenarioConfig.raiseRowKey] as number | undefined) ?? 0),
    limpCheckPctX10: toPctX10((row[scenarioConfig.passiveRowKey] as number | undefined) ?? 0),
    foldPctX10: toPctX10(row.fold_pct ?? 0),
    raiseBucket: bucketLookup.get(row.mao) ?? null,
  }));

  // MySQL handles this volume fine in one insert, but batching keeps memory predictable.
  const batchSize = 200;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    await db.insert(gtoBaseadoHands).values(batch);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scenarioId: scenario.id,
        slug: scenarioConfig.slug,
        title: scenarioConfig.title,
        importedHands: payload.length,
        totalCombos: input.summary.total_combos,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[gto:import:sb-open] failed:", error);
  process.exit(1);
});
