import type { ParserSelection } from "@/parser/handHistoryDispatcher";

const SESSION_STORAGE_PREFIX = "hand-review-session:";
const LOCAL_STORAGE_PREFIX = "hand-review-session-local:";

export interface HandReviewSession {
  id: string;
  createdAt: number;
  rawInput: string;
  parserSelection: ParserSelection;
}

function buildSessionKey(id: string): string {
  return `${SESSION_STORAGE_PREFIX}${id}`;
}

function buildLocalSessionKey(id: string): string {
  return `${LOCAL_STORAGE_PREFIX}${id}`;
}

function buildSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeSetStorage(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Try to recover space by deleting old hand-review keys, then retry once.
    try {
      const entries: Array<{ key: string; createdAt: number }> = [];
      for (let i = 0; i < storage.length; i++) {
        const currentKey = storage.key(i);
        if (!currentKey) continue;
        if (!currentKey.startsWith(SESSION_STORAGE_PREFIX) && !currentKey.startsWith(LOCAL_STORAGE_PREFIX)) continue;

        const raw = storage.getItem(currentKey);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Partial<HandReviewSession>;
          entries.push({ key: currentKey, createdAt: parsed.createdAt ?? 0 });
        } catch {
          entries.push({ key: currentKey, createdAt: 0 });
        }
      }

      entries
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, Math.max(1, Math.ceil(entries.length * 0.35)))
        .forEach(entry => storage.removeItem(entry.key));

      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function saveHandReviewSession(rawInput: string, parserSelection: ParserSelection = "AUTO"): string {
  const id = buildSessionId();
  const payload: HandReviewSession = {
    id,
    createdAt: Date.now(),
    rawInput,
    parserSelection,
  };

  if (typeof window !== "undefined") {
    const serialized = JSON.stringify(payload);
    const sessionSaved = safeSetStorage(window.sessionStorage, buildSessionKey(id), serialized);
    if (!sessionSaved) {
      safeSetStorage(window.localStorage, buildLocalSessionKey(id), serialized);
    }
  }

  return id;
}

// ─── Favorite Tournaments ──────────────────────────────────────────────────────

const FAVORITES_KEY_PREFIX = "hand-review-favorites:";
const FAVORITES_LIMIT = 10;

export interface FavoriteTournament {
  id: string;
  createdAt: number;
  label: string;
  handCount: number;
  rawInput: string;
  parserSelection: ParserSelection;
}

function getFavoritesKey(userId: string | number | undefined): string {
  return userId ? `${FAVORITES_KEY_PREFIX}${userId}` : `${FAVORITES_KEY_PREFIX}guest`;
}

function safeReadFavoritesByKey(key: string): FavoriteTournament[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FavoriteTournament[];
  } catch {
    return [];
  }
}

export function listFavoriteTournaments(userId: string | number | undefined): FavoriteTournament[] {
  if (typeof window === "undefined") return [];
  return safeReadFavoritesByKey(getFavoritesKey(userId));
}

export function recoverGuestFavoritesForUser(userId: string | number | undefined): FavoriteTournament[] {
  if (typeof window === "undefined") return [];
  if (!userId) return listFavoriteTournaments(undefined);

  const userKey = getFavoritesKey(userId);
  const userFavorites = safeReadFavoritesByKey(userKey);
  if (userFavorites.length > 0) return userFavorites;

  const guestFavorites = safeReadFavoritesByKey(getFavoritesKey(undefined));
  if (guestFavorites.length === 0) return [];

  const normalized = [...guestFavorites]
    .sort((a, b) => Number(a?.createdAt ?? 0) - Number(b?.createdAt ?? 0))
    .slice(-FAVORITES_LIMIT);

  try {
    window.localStorage.setItem(userKey, JSON.stringify(normalized));
    return normalized;
  } catch {
    return guestFavorites;
  }
}

export function saveFavoriteTournament(
  userId: string | number | undefined,
  rawInput: string,
  parserSelection: ParserSelection,
  handCount: number,
  label: string,
): FavoriteTournament | null {
  if (typeof window === "undefined") return null;
  const existing = listFavoriteTournaments(userId);
  // If already at limit, remove the oldest
  const trimmed = existing.length >= FAVORITES_LIMIT
    ? existing.sort((a, b) => a.createdAt - b.createdAt).slice(existing.length - FAVORITES_LIMIT + 1)
    : existing;
  const entry: FavoriteTournament = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    label,
    handCount,
    rawInput,
    parserSelection,
  };
  try {
    window.localStorage.setItem(getFavoritesKey(userId), JSON.stringify([...trimmed, entry]));
    return entry;
  } catch {
    return null;
  }
}

export function deleteFavoriteTournament(userId: string | number | undefined, id: string): void {
  if (typeof window === "undefined") return;
  const existing = listFavoriteTournaments(userId);
  try {
    window.localStorage.setItem(
      getFavoritesKey(userId),
      JSON.stringify(existing.filter((f) => f.id !== id)),
    );
  } catch {
    // no-op
  }
}

export function renameFavoriteTournament(
  userId: string | number | undefined,
  id: string,
  label: string,
): FavoriteTournament | null {
  if (typeof window === "undefined") return null;

  const safeLabel = label.trim();
  if (!safeLabel) return null;

  const existing = listFavoriteTournaments(userId);
  const updated = existing.map((favorite) => (
    favorite.id === id
      ? { ...favorite, label: safeLabel }
      : favorite
  ));
  const renamed = updated.find((favorite) => favorite.id === id) ?? null;

  try {
    window.localStorage.setItem(getFavoritesKey(userId), JSON.stringify(updated));
    return renamed;
  } catch {
    return null;
  }
}

export function loadHandReviewSession(id: string): HandReviewSession | null {
  if (!id || typeof window === "undefined") return null;

  const raw =
    window.sessionStorage.getItem(buildSessionKey(id)) ??
    window.localStorage.getItem(buildLocalSessionKey(id));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<HandReviewSession>;
    if (!parsed.id || !parsed.rawInput || !parsed.createdAt) return null;

    return {
      id: parsed.id,
      rawInput: parsed.rawInput,
      createdAt: parsed.createdAt,
      parserSelection: parsed.parserSelection ?? "AUTO",
    };
  } catch {
    return null;
  }
}
