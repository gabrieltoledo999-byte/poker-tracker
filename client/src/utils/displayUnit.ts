export type DisplayUnit = "chips" | "bb";

export function toBB(value: number, bigBlind: number): number {
  if (!bigBlind || bigBlind <= 0) return 0;
  return value / bigBlind;
}

function formatRounded(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  const one = Number(value.toFixed(1));
  if (Number.isInteger(one)) return `${one}`;
  return `${Number(value.toFixed(2))}`;
}

export function formatValue(value: number, unit: DisplayUnit, bigBlind: number): string {
  if (unit === "bb") {
    return `${formatRounded(toBB(value, bigBlind))} BB`;
  }
  return `${value}`;
}

export function formatBlindLevel(smallBlind: number, bigBlind: number, unit: DisplayUnit): string {
  if (unit === "bb") {
    return `${formatRounded(toBB(smallBlind, bigBlind))}/${formatRounded(toBB(bigBlind, bigBlind))} BB`;
  }
  return `${smallBlind}/${bigBlind}`;
}

function romanToDecimal(roman: string): number | null {
  const normalized = roman.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(normalized)) return null;
  if (!/^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(normalized)) return null;

  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  for (let i = 0; i < normalized.length; i++) {
    const current = values[normalized[i]];
    const next = values[normalized[i + 1]];
    total += next && current < next ? -current : current;
  }
  return total;
}

export function formatTournamentLevel(level: string | null | undefined): string | null {
  if (!level) return null;

  const normalized = level.trim();
  if (!normalized) return null;

  const decimalMatch = normalized.match(/\d+/);
  if (decimalMatch) return decimalMatch[0];

  const romanCandidate = normalized.replace(/^level\s+/i, "").trim();
  const decimalFromRoman = romanToDecimal(romanCandidate);
  if (decimalFromRoman != null) return String(decimalFromRoman);

  return normalized;
}
