// Game format definitions for poker sessions

export type GameFormat = 
  | "cash_game"
  | "tournament"
  | "turbo"
  | "hyper_turbo"
  | "sit_and_go"
  | "spin_and_go"
  | "bounty"
  | "satellite"
  | "freeroll"
  | "home_game";

export const GAME_FORMATS: { value: GameFormat; label: string; emoji: string; description: string }[] = [
  { value: "cash_game", label: "Cash Game", emoji: "💵", description: "Jogo a dinheiro / Ring Game" },
  { value: "tournament", label: "Torneio", emoji: "🏆", description: "Torneio regular" },
  { value: "turbo", label: "Torneio Turbo", emoji: "⚡", description: "Torneio com blinds rápidos" },
  { value: "hyper_turbo", label: "Hyper Turbo", emoji: "🚀", description: "Torneio com blinds muito rápidos" },
  { value: "sit_and_go", label: "Sit & Go", emoji: "🎯", description: "Torneio que inicia quando enche" },
  { value: "spin_and_go", label: "Spin & Go", emoji: "🎰", description: "Jackpot / Spin & Go" },
  { value: "bounty", label: "Bounty/PKO", emoji: "💀", description: "Torneio com recompensa por eliminação" },
  { value: "satellite", label: "Satélite", emoji: "🛸", description: "Classificatório para torneio maior" },
  { value: "freeroll", label: "Freeroll", emoji: "🆓", description: "Torneio gratuito" },
  { value: "home_game", label: "Home Game", emoji: "🏠", description: "Jogo caseiro entre amigos" },
];

export function getGameFormatLabel(format: GameFormat): string {
  return GAME_FORMATS.find(f => f.value === format)?.label || format;
}

export function getGameFormatEmoji(format: GameFormat): string {
  return GAME_FORMATS.find(f => f.value === format)?.emoji || "🎴";
}
