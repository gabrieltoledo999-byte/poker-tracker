import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export type PlayType = "online" | "live";

type RankingEntry<T extends string | number> = {
  value: T;
  count: number;
  share: number;
};

function sortByExplicitOrder<T, K extends string | number>(
  items: T[],
  getKey: (item: T) => K,
  order: K[],
) {
  const orderMap = new Map(order.map((value, index) => [value, index]));
  return [...items].sort((a, b) => {
    const aIndex = orderMap.get(getKey(a));
    const bIndex = orderMap.get(getKey(b));
    if (aIndex == null && bIndex == null) return 0;
    if (aIndex == null) return 1;
    if (bIndex == null) return -1;
    return aIndex - bIndex;
  });
}

export function useBehaviorProfile() {
  const query = trpc.sessions.getUserPreferences.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const preferences = query.data;

  const primaryType = useMemo<PlayType>(() => {
    if (preferences?.preferredType === "live") return "live";
    return "online";
  }, [preferences?.preferredType]);

  const playTypeOrder = useMemo<PlayType[]>(() => {
    const ranked = (preferences?.typeRanking ?? [])
      .map((entry: RankingEntry<string>) => entry.value)
      .filter((value): value is PlayType => value === "online" || value === "live");

    const ordered: PlayType[] = [];
    for (const value of ranked) {
      if (!ordered.includes(value)) ordered.push(value);
    }
    if (!ordered.includes(primaryType)) ordered.unshift(primaryType);
    if (!ordered.includes("online")) ordered.push("online");
    if (!ordered.includes("live")) ordered.push("live");
    return ordered;
  }, [preferences?.typeRanking, primaryType]);

  const venueOrder = useMemo(() => {
    const ranked = (preferences?.venueRanking ?? []).map((entry: RankingEntry<number>) => Number(entry.value));
    return ranked.length > 0 ? ranked : (preferences?.preferredVenueIds ?? []);
  }, [preferences?.venueRanking, preferences?.preferredVenueIds]);

  const formatOrder = useMemo(() => {
    const ranked = (preferences?.gameFormatRanking ?? []).map((entry: RankingEntry<string>) => entry.value);
    return ranked.length > 0 ? ranked : (preferences?.preferredGameFormats ?? []);
  }, [preferences?.gameFormatRanking, preferences?.preferredGameFormats]);

  const buyInOrderByType = useMemo(() => ({
    online: (preferences?.buyInRankingOnline ?? []).map((entry: RankingEntry<number>) => Number(entry.value)),
    live: (preferences?.buyInRankingLive ?? []).map((entry: RankingEntry<number>) => Number(entry.value)),
    all: (preferences?.buyInRanking ?? []).map((entry: RankingEntry<number>) => Number(entry.value)),
  }), [preferences?.buyInRanking, preferences?.buyInRankingOnline, preferences?.buyInRankingLive]);

  const secondaryType = playTypeOrder.find((value) => value !== primaryType) ?? (primaryType === "online" ? "live" : "online");

  return {
    ...query,
    preferences,
    primaryType,
    secondaryType,
    playTypeOrder,
    venueOrder,
    formatOrder,
    buyInOrderByType,
    sortTypes<T extends { type: PlayType }>(items: T[]) {
      return sortByExplicitOrder(items, (item) => item.type, playTypeOrder);
    },
    sortTypeValues(values: PlayType[]) {
      return sortByExplicitOrder(values, (value) => value, playTypeOrder);
    },
    sortVenues<T>(items: T[], getVenueId: (item: T) => number) {
      return sortByExplicitOrder(items, getVenueId, venueOrder);
    },
    sortFormats<T>(items: T[], getFormat: (item: T) => string) {
      return sortByExplicitOrder(items, getFormat, formatOrder);
    },
    getPreferredBuyIns(playType: PlayType) {
      const typed = buyInOrderByType[playType];
      if (typed.length > 0) return typed;
      return buyInOrderByType.all;
    },
    getTopRank<T extends string | number>(ranking?: Array<RankingEntry<T>>) {
      return ranking?.[0] ?? null;
    },
  };
}