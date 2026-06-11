// Converte o formato "novo" (hands: array de {hand, actions, ...}) para o
// formato esperado pelo import-gto-spots-json.ts (hands: { AA: { raise, fold, ... } }).
// Uso: node scripts/normalize-spots-json.mjs <input.json> <output.json>

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Mapeia chaves de action do JSON novo para chaves canônicas que o importer reconhece.
const ACTION_ALIAS = {
  open: "raise",        // RFI open -> raise
  raise: "raise",
  threebet: "three_bet",
  fourbet: "raise_3bet", // já existe bucket pra 3-bet/4-bet como raise agressivo
  allin: "jam",
  jam: "jam",
  call: "call",
  limp: "limp",
  check: "check",
  fold: "fold",
  // sizes específicas do BB vs SB limp viram raise
  raise35: "raise",
  raise6: "raise",
};

function canonKey(k) {
  return String(k).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeActionMap(actions) {
  const out = {};
  if (!actions || typeof actions !== "object") return out;
  for (const [rawKey, rawVal] of Object.entries(actions)) {
    const canon = canonKey(rawKey);
    const target = ACTION_ALIAS[canon];
    if (!target) continue;
    const value = Number(rawVal);
    if (!Number.isFinite(value)) continue;
    out[target] = (out[target] ?? 0) + value;
  }
  return out;
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg || !outputArg) {
    console.error("Uso: node normalize-spots-json.mjs <input.json> <output.json>");
    process.exit(1);
  }

  const inPath = path.resolve(inputArg);
  const outPath = path.resolve(outputArg);
  const raw = await readFile(inPath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.spots)) {
    throw new Error("JSON sem 'spots' array");
  }

  const normalizedSpots = data.spots.map((spot) => {
    const handsArray = Array.isArray(spot.hands) ? spot.hands : [];
    const handsObj = {};
    for (const entry of handsArray) {
      if (!entry || typeof entry !== "object") continue;
      const handCode = entry.hand;
      if (!handCode) continue;
      handsObj[handCode] = normalizeActionMap(entry.actions);
    }

    return {
      id: spot.id,
      title: spot.name ?? spot.title ?? spot.id,
      stackBb: spot.stackBb ?? spot.effectiveStackBb,
      format: spot.format,
      heroPosition: spot.heroPosition,
      villainPosition: spot.villainPosition,
      sizes: spot.sizes,
      targetFrequencies: spot.targetFrequencies,
      hands: handsObj,
    };
  });

  const output = {
    version: data.version ?? "normalized-v1",
    stackBb: data.stackBb,
    spots: normalizedSpots,
  };

  await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`OK: ${normalizedSpots.length} spots normalizados -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
