// Preset venues for poker - popular online sites and live clubs in Brazil

export interface PresetVenue {
  name: string;
  type: "online" | "live";
  logoUrl: string;
  logoFit?: "contain" | "cover";
  website?: string;
}

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL";

export const PRESET_VENUES: PresetVenue[] = [
  // Online Poker Sites
  {
    name: "Suprema Poker",
    type: "online",
    logoUrl: `${CDN}/suprema_clean_8aafbdb1.png`,
    logoFit: "cover",
    website: "https://www.supremapoker.com",
  },
  {
    name: "PPPoker",
    type: "online",
    logoUrl: `${CDN}/pppoker_10f8e436.jpg`,
    website: "https://www.pppoker.net",
  },
  {
    name: "ClubGG",
    type: "online",
    logoUrl: `${CDN}/clubgg_2a202d12.jpg`,
    website: "https://www.clubgg.net",
  },
  {
    name: "PokerBros",
    type: "online",
    logoUrl: `${CDN}/pokerbros_6f897e64.jpg`,
    website: "https://www.pokerbros.net",
  },
  {
    name: "PokerStars",
    type: "online",
    logoUrl: `${CDN}/pokerstars_fc2715c4.jpg`,
    website: "https://www.pokerstars.com",
  },
  {
    name: "GGPoker",
    type: "online",
    logoUrl: `${CDN}/ggpoker_be9ba8c6.png`,
    website: "https://www.ggpoker.com",
  },
  {
    name: "WPT Global",
    type: "online",
    logoUrl: `${CDN}/wpt_clean_3b04995e.png`,
    logoFit: "cover",
    website: "https://wptglobal.com",
  },
  {
    name: "888poker",
    type: "online",
    logoUrl: `${CDN}/888poker_17ad04a6.jpg`,
    website: "https://www.888poker.com",
  },
  {
    name: "KKPoker",
    type: "online",
    logoUrl: `${CDN}/kkpoker-logo_5b7e0949.png`,
    website: "https://www.kkpoker.net",
  },
  {
    name: "X-Poker",
    type: "online",
    logoUrl: `${CDN}/xpoker-logo_a9942cfe.png`,
    website: "https://www.xpokerapp.com",
  },
];

export function getVenueEmoji(type: "online" | "live"): string {
  return type === "online" ? "🖥️" : "🎰";
}
