/**
 * Big Blinds calculation utilities
 * Converts monetary amounts to Big Blind multiples for easier hand analysis
 */

export interface BlindStructure {
  smallBlind: number;
  bigBlind: number;
}

/**
 * Calculate how many big blinds an amount represents
 * @param amount - The monetary amount
 * @param structure - The blind structure (SB/BB)
 * @returns Number of big blinds
 */
export function calculateBB(amount: number, structure: BlindStructure): number {
  if (structure.bigBlind === 0) return 0;
  return amount / structure.bigBlind;
}

/**
 * Format an amount as Big Blinds string
 * @param amount - The monetary amount
 * @param structure - The blind structure (SB/BB)
 * @returns Formatted string like "2 BB", "1.5 BB", etc
 */
export function formatBB(amount: number, structure: BlindStructure): string {
  const bb = calculateBB(amount, structure);

  if (bb === 0) return "0 BB";
  if (Number.isInteger(bb)) return `${bb} BB`;
  return `${bb.toFixed(1)} BB`;
}

/**
 * Format action amount with optional BB display
 * @param amount - The monetary amount
 * @param structure - The blind structure (SB/BB)
 * @param showBB - Whether to include BB notation
 * @returns Formatted string like "40 (2 BB)" or just "40"
 */
export function formatActionAmount(
  amount: number,
  structure: BlindStructure,
  showBB: boolean = false
): string {
  if (amount === 0) return "0";

  const base = Math.round(amount).toString();

  if (!showBB) return base;

  const bb = formatBB(amount, structure);
  return `${base} (${bb})`;
}

/**
 * Detect blind structure from hand state
 * Tries to infer SB/BB from action amounts
 */
export function detectBlindStructure(actions: any[]): BlindStructure | null {
  // Look for blinds in preflop actions
  const preflop = actions.filter((a) => a.street === "preflop");

  if (preflop.length < 2) return null;

  let sb = 0;
  let bb = 0;

  for (const action of preflop) {
    if (action.action === "blind" || action.action === "post") {
      const amount = Math.abs(action.amount || 0);
      if (amount > 0 && bb === 0) {
        sb = amount;
        bb = amount * 2;
      }
    }
  }

  return sb > 0 && bb > 0 ? { smallBlind: sb, bigBlind: bb } : null;
}
