import { parseHandHistoryTranscript } from "@/parser/handHistoryDispatcher";
import type { ParsedPokerStarsHand } from "@/lib/pokerstars-transcript";

export function anonymizeHand(input: ParsedPokerStarsHand): ParsedPokerStarsHand {
  const cloned: ParsedPokerStarsHand = JSON.parse(JSON.stringify(input));

  const heroOriginalName = cloned.heroName;
  const villainMap = new Map<string, string>();
  let villainCount = 0;

  const mapName = (name: string): string => {
    if (name === heroOriginalName) return "Hero";
    const existing = villainMap.get(name);
    if (existing) return existing;
    villainCount += 1;
    const alias = `Vilao ${villainCount}`;
    villainMap.set(name, alias);
    return alias;
  };

  cloned.heroName = "Hero";

  cloned.seats = cloned.seats.map((seat) => ({
    ...seat,
    playerName: mapName(seat.playerName),
    isHero: seat.isHero || seat.playerName === heroOriginalName,
  }));

  cloned.actions = cloned.actions.map((action) => ({
    ...action,
    player: mapName(action.player),
    raw: action.raw.replaceAll(heroOriginalName, "Hero"),
  }));

  cloned.summary = {
    ...cloned.summary,
    villainCards: cloned.summary.villainCards.map((villain) => ({
      ...villain,
      player: mapName(villain.player),
    })),
  };

  return cloned;
}

export function parseAndPrepareHand(transcript: string): ParsedPokerStarsHand | null {
  const parsed = parseHandHistoryTranscript(transcript, { preferredPlatform: "POKERSTARS" });
  if (!parsed.hands.length) return null;
  return anonymizeHand(parsed.hands[0]);
}
