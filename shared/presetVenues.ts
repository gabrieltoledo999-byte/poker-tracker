// Preset venues for poker - popular online sites and live clubs in Brazil

export interface PresetVenue {
  name: string;
  type: "online" | "live";
  logoUrl: string;
  website?: string;
}

export const PRESET_VENUES: PresetVenue[] = [
  // Online Poker Sites
  {
    name: "PokerStars",
    type: "online",
    logoUrl: "/logos/pokerstars.png",
    website: "https://www.pokerstars.com",
  },
  {
    name: "GGPoker",
    type: "online",
    logoUrl: "/logos/ggpoker.jpg",
    website: "https://www.ggpoker.com",
  },
  {
    name: "888poker",
    type: "online",
    logoUrl: "/logos/888poker.jpg",
    website: "https://www.888poker.com",
  },
  {
    name: "partypoker",
    type: "online",
    logoUrl: "/logos/partypoker.jpg",
    website: "https://www.partypoker.com",
  },
  {
    name: "WPT Global",
    type: "online",
    logoUrl: "/logos/wptglobal.jpg",
    website: "https://wptglobal.com",
  },
  {
    name: "KKPoker",
    type: "online",
    logoUrl: "/logos/kkpoker.jpg",
    website: "https://www.kkpoker.net",
  },
  {
    name: "CoinPoker",
    type: "online",
    logoUrl: "/logos/coinpoker.jpg",
    website: "https://coinpoker.com",
  },
  // Live Poker Clubs - Brazil
  {
    name: "H2 Club São Paulo",
    type: "live",
    logoUrl: "/logos/h2club.jpg",
    website: "https://sp.h2club.com.br",
  },
  {
    name: "H2 Club Curitiba",
    type: "live",
    logoUrl: "/logos/h2club.jpg",
    website: "https://curitiba.h2club.com.br",
  },
  {
    name: "H2 Club Campinas",
    type: "live",
    logoUrl: "/logos/h2club.jpg",
    website: "https://campinas.h2club.com.br",
  },
  {
    name: "BSOP (Evento)",
    type: "live",
    logoUrl: "/logos/bsop.webp",
    website: "https://bsop.com.br",
  },
];

export function getVenueEmoji(type: "online" | "live"): string {
  return type === "online" ? "🖥️" : "🎰";
}
