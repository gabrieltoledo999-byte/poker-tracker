// Preset venues for poker - popular online sites and live clubs in Brazil

export interface PresetVenue {
  name: string;
  type: "online" | "live";
  logoUrl: string;
  logoFit?: "contain" | "cover";
  defaultCurrency?: "BRL" | "USD" | "CAD" | "JPY" | "CNY";
  website?: string;
}

const CDN = "/logos";

export const PRESET_VENUES: PresetVenue[] = [
  // Online Poker Sites
  {
    name: "Suprema Poker",
    type: "online",
    logoUrl: `${CDN}/suprema.svg`,
    logoFit: "contain",
    website: "https://supremapoker.net",
  },
  {
    name: "PPPoker",
    type: "online",
    logoUrl: `${CDN}/pppoker-icon.png`,
    logoFit: "contain",
    defaultCurrency: "USD",
    website: "https://www.pppoker.net",
  },
  {
    name: "PokerBros",
    type: "online",
    logoUrl: `${CDN}/pokerbros-icon.png`,
    logoFit: "contain",
    defaultCurrency: "USD",
    website: "https://www.pokerbros.net",
  },
  {
    name: "PokerStars",
    type: "online",
    logoUrl: `${CDN}/pokerstars-icon-google.png`,
    logoFit: "contain",
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
    logoUrl: `${CDN}/wptglobal-icon.png`,
    logoFit: "contain",
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
    logoUrl: `${CDN}/kkpoker-icon.png`,
    logoFit: "contain",
    defaultCurrency: "USD",
    website: "https://www.kkpoker.net",
  },
  {
    name: "X-Poker",
    type: "online",
    logoUrl: `${CDN}/xpoker-icon.svg`,
    logoFit: "contain",
    defaultCurrency: "USD",
    website: "https://www.xpokerapp.com",
  },
  // Live Poker Clubs - Brazil
  {
    name: "Monte Carlo Poker Club",
    type: "live",
    logoUrl: `${CDN}/montecarlo-icon-user.png`,
    logoFit: "contain",
    website: "https://www.montecarlopoker.com.br",
  },
  {
    name: "H2 Club São Paulo",
    type: "live",
    logoUrl: `${CDN}/h2-official-purple-user.png`,
    logoFit: "contain",
    website: "https://sp.h2club.com.br",
  },
  {
    name: "H2 Club Curitiba",
    type: "live",
    logoUrl: `${CDN}/h2-official-purple-user.png`,
    logoFit: "contain",
    website: "https://curitiba.h2club.com.br",
  },
  {
    name: "H2 Club Campinas",
    type: "live",
    logoUrl: `${CDN}/h2-official-purple-user.png`,
    logoFit: "contain",
    website: "https://campinas.h2club.com.br",
  },
];

export function getVenueEmoji(type: "online" | "live"): string {
  return type === "online" ? "🖥️" : "🎰";
}
