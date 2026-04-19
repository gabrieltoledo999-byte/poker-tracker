import type { PokerAction } from "@/parser/pokerstarsParser";

export function calculatePotFromActions(actions: PokerAction[]): number {
  let pot = 0;
  const streetContrib = new Map<string, number>();
  let currentStreet = "preflop";

  for (const action of actions) {
    if (action.street !== currentStreet) {
      currentStreet = action.street;
      streetContrib.clear();
    }

    if (action.action === "post_ante") {
      pot += action.amount ?? 0;
      continue;
    }

    if (action.action === "post_small_blind") {
      pot += action.amount ?? 0;
      streetContrib.set(action.player, (action.amount ?? 0));
      continue;
    }

    if (action.action === "post_big_blind") {
      pot += action.amount ?? 0;
      streetContrib.set(action.player, (action.amount ?? 0));
      continue;
    }

    if (action.action === "call") {
      const already = streetContrib.get(action.player) ?? 0;
      // PokerStars call amount is usually delta. If toAmount is absent, derive target from already + delta.
      const target = action.toAmount ?? (already + (action.amount ?? 0));
      const delta = Math.max(target - already, 0);
      pot += delta;
      streetContrib.set(action.player, target);
      continue;
    }

    if (action.action === "bet") {
      // Bet: add amount to pot (first bet in the street for this player)
      pot += action.amount ?? 0;
      streetContrib.set(action.player, (streetContrib.get(action.player) ?? 0) + (action.amount ?? 0));
      continue;
    }

    if (action.action === "raise") {
      // Raise: toAmount is total, amount is the raise size; we add the delta
      const target = action.toAmount ?? 0;
      const already = streetContrib.get(action.player) ?? 0;
      const delta = Math.max(target - already, 0);
      pot += delta;
      streetContrib.set(action.player, target);
      continue;
    }

    if (action.action === "returned_uncalled_bet") {
      pot -= action.amount ?? 0;
    }
  }

  return Math.max(pot, 0);
}
