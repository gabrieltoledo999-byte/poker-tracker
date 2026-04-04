// Preset venues for poker - popular online sites and live clubs in Brazil

export interface PresetVenue {
  name: string;
  type: "online" | "live";
  logoUrl: string;
  website?: string;
}

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL";

export const PRESET_VENUES: PresetVenue[] = [
  // Online Poker Sites
  {
    name: "Suprema Poker",
    type: "online",
    logoUrl: `${CDN}/suprema_94f6102b.jpg`,
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
    logoUrl: `${CDN}/wpt_e37beb09.png`,
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
    logoUrl: "https://play-lh.googleusercontent.com/RRnFJGRGiJPmWZQFq0kBSWXHHqBEGLPJCJBGNMEVHVSRqEYFJrFT3zFuOJE0VqQ8w=s512",
    website: "https://www.kkpoker.net",
  },
  {
    name: "X-Poker",
    type: "online",
    logoUrl: "https://play-lh.googleusercontent.com/2P9q7_FMxJhHlBRjDlWJJHUHqFVDNGZnVzF2jlGxPjNHHxvpGfKbpTqnO8_TkJJxjA=s512",
    website: "https://www.xpokerapp.com",
  },
  // Live Poker Clubs - Brazil
  {
    name: "Monte Carlo Poker Club",
    type: "live",
    logoUrl: `${CDN}/montecarlo_icon_82131015.png`,
    website: "https://www.montecarlopoker.com.br",
  },
  {
    name: "H2 Club São Paulo",
    type: "live",
    logoUrl: `${CDN}/h2club_58b7eae7.png`,
    website: "https://sp.h2club.com.br",
  },
  {
    name: "H2 Club Curitiba",
    type: "live",
    logoUrl: `${CDN}/h2club_58b7eae7.png`,
    website: "https://curitiba.h2club.com.br",
  },
  {
    name: "H2 Club Campinas",
    type: "live",
    logoUrl: `${CDN}/h2club_58b7eae7.png`,
    website: "https://campinas.h2club.com.br",
  },
  {
    name: "BHZ Poker Clube",
    type: "live",
    logoUrl: `${CDN}/bhz_icon_492624b3.png`,
  },
  {
    name: "Fold Poker Club",
    type: "live",
    logoUrl: `${CDN}/fold_icon_d4c7a6ee.png`,
  },
  {
    name: "Acaraí Poker Club",
    type: "live",
    logoUrl: `${CDN}/acarai_icon_73cd1a4e.png`,
  },
  {
    name: "QG Masters Club",
    type: "live",
    logoUrl: `${CDN}/qgmasters_icon_c3b055f0.png`,
  },
  {
    name: "HiJack Poker Club",
    type: "live",
    logoUrl: `${CDN}/hijack_icon_6b26e5c0.png`,
  },
  {
    name: "Stars Club Poker Room",
    type: "live",
    logoUrl: `${CDN}/starsclub_icon_d24b5f93.png`,
  },
  {
    name: "Players Poker Club",
    type: "live",
    logoUrl: `${CDN}/players_icon_63bc2826.png`,
  },
];

export function getVenueEmoji(type: "online" | "live"): string {
  return type === "online" ? "🖥️" : "🎰";
}
