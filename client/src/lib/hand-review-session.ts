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
