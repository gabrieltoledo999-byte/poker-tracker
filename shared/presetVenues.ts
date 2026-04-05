// Preset venues for poker - popular online sites and live clubs in Brazil

export interface PresetVenue {
  name: string;
  type: "online" | "live";
  logoUrl: string;
  logoFit?: "contain" | "cover";
  defaultCurrency?: "BRL" | "USD" | "CAD" | "JPY";
  website?: string;
}

const CDN = "/logos";

export const PRESET_VENUES: PresetVenue[] = [
  // Online Poker Sites
  {
    name: "Suprema Poker",
    type: "online",
    logoUrl: `${CDN}/partypoker.jpg`,
    logoFit: "cover",
    website: "https://www.supremapoker.com",
  },
  {
    name: "PPPoker",
    type: "online",
    logoUrl: `${CDN}/partypoker.jpg`,
    defaultCurrency: "USD",
    website: "https://www.pppoker.net",
  },
  {
    name: "ClubGG",
    type: "online",
    logoUrl: `${CDN}/ggpoker.jpg`,
    defaultCurrency: "USD",
    website: "https://www.clubgg.net",
  },
  {
    name: "PokerBros",
    type: "online",
    logoUrl: `${CDN}/coinpoker.jpg`,
    defaultCurrency: "USD",
    website: "https://www.pokerbros.net",
  },
  {
    name: "PokerStars",
    type: "online",
    logoUrl: `${CDN}/pokerstars.png`,
    defaultCurrency: "USD",
    website: "https://www.pokerstars.com",
  },
  {
    name: "GGPoker",
    type: "online",
    logoUrl: `${CDN}/ggpoker.png`,
    defaultCurrency: "USD",
    website: "https://www.ggpoker.com",
  },
  {
    name: "WPT Global",
    type: "online",
    logoUrl: `${CDN}/wptglobal.jpg`,
    logoFit: "cover",
    defaultCurrency: "USD",
    website: "https://wptglobal.com",
  },
  {
    name: "888poker",
    type: "online",
    logoUrl: `${CDN}/888poker.jpg`,
    defaultCurrency: "USD",
    website: "https://www.888poker.com",
  },
  {
    name: "KKPoker",
    type: "online",
    logoUrl: `${CDN}/kkpoker.png`,
    defaultCurrency: "USD",
    website: "https://www.kkpoker.net",
  },
  {
    name: "X-Poker",
    type: "online",
    logoUrl: `${CDN}/coinpoker.jpg`,
    defaultCurrency: "USD",
    website: "https://www.xpokerapp.com",
  },
  // Live Poker Clubs - Brazil
  {
    name: "Monte Carlo Poker Club",
    type: "live",
    logoUrl: `${CDN}/bsop.webp`,
    website: "https://www.montecarlopoker.com.br",
  },
  {
    name: "H2 Club São Paulo",
    type: "live",
    logoUrl: `${CDN}/h2club.jpg`,
    website: "https://sp.h2club.com.br",
  },
  {
    name: "H2 Club Curitiba",
    type: "live",
    logoUrl: `${CDN}/h2club.jpg`,
    website: "https://curitiba.h2club.com.br",
  },
  {
    name: "H2 Club Campinas",
    type: "live",
    logoUrl: `${CDN}/h2club.jpg`,
    website: "https://campinas.h2club.com.br",
  },
];

export function getVenueEmoji(type: "online" | "live"): string {
  return type === "online" ? "🖥️" : "🎰";
}
