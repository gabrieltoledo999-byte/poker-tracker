import { and, desc, eq, gte, inArray, isNull, like, lte, ne, or, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, sessions, bankrollSettings, venues, InsertSession, Session, BankrollSettings, Venue, InsertVenue, fundTransactions, FundTransaction, InsertFundTransaction, venueBalanceHistory, VenueBalanceHistory, InsertVenueBalanceHistory, activeSessions, ActiveSession, InsertActiveSession, sessionTables, SessionTable, InsertSessionTable, handPatternCounters, userBlocks, messages, Message, messageReactions } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getAllRates } from "./currency";
import { authCompatUserSelect } from "./userCompat";
import { shouldReplaceAvatar } from "./avatarPersistence";

const SYSTEM_ADMIN_EMAILS = new Set(["admin@therailapp.company"]);

let _db: ReturnType<typeof drizzle> | null = null;

function isConnectionLostError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | undefined;
  const code = String(err?.code ?? err?.cause?.code ?? "").toUpperCase();
  const message = String(err?.message ?? err?.cause?.message ?? "").toLowerCase();

  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    message.includes("connection lost") ||
    message.includes("server closed the connection")
  );
}

function resetDbConnection() {
  _db = null;
}

async function withDbRetry<T>(operation: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    return await operation(db);
  } catch (error) {
    if (!isConnectionLostError(error)) throw error;

    console.warn("[Database] Connection lost. Retrying query once...");
    resetDbConnection();

    const retriedDb = await getDb();
    if (!retriedDb) {
      throw error;
    }

    return await operation(retriedDb);
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const existingUser = await db
      .select({ id: users.id, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1);

    const currentAvatarUrl = existingUser[0]?.avatarUrl ?? null;
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "avatarUrl", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;

      if (
        field === "avatarUrl" &&
        !shouldReplaceAvatar({
          currentAvatarUrl,
          incomingAvatarUrl: value,
          source: "provider-sync",
        })
      ) {
        if (!existingUser.length) {
          values[field] = value ?? null;
        }
        return;
      }

      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    const normalizedEmail = String(user.email ?? values.email ?? "").trim().toLowerCase();
    const shouldForceAdminRole = user.openId === ENV.ownerOpenId || SYSTEM_ADMIN_EMAILS.has(normalizedEmail);

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (shouldForceAdminRole) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await withDbRetry((conn) =>
    conn
      .select(authCompatUserSelect)
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1)
  );

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await withDbRetry((conn) =>
    conn
      .select(authCompatUserSelect)
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)
  );
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByNickname(nickname: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by nickname: database not available");
    return undefined;
  }

  const normalizedNickname = nickname.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalizedNickname) return undefined;

  const result = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(sql`lower(trim(${users.name})) = ${normalizedNickname}`)
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function linkUserToGoogle(params: {
  userId: number;
  googleSub: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const openId = `google_${params.googleSub}`;

  const [existingUser] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const nextAvatarUrl = shouldReplaceAvatar({
    currentAvatarUrl: existingUser?.avatarUrl ?? null,
    incomingAvatarUrl: params.avatarUrl ?? null,
    source: "provider-sync",
  })
    ? params.avatarUrl ?? null
    : existingUser?.avatarUrl ?? null;

  await db.update(users)
    .set({
      openId,
      name: params.name ?? null,
      email: params.email ? params.email.trim().toLowerCase() : null,
      avatarUrl: nextAvatarUrl,
      loginMethod: "google",
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));

  const [updated] = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  return updated;
}

// ============== SESSION QUERIES ==============

export async function createSession(data: InsertSession): Promise<Session> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(sessions).values(data).$returningId();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, result.id));
  return session;
}

export async function updateSession(id: number, userId: number, data: Partial<InsertSession>): Promise<Session | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(sessions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  return session || null;
}

export async function deleteSession(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Remove finalized tables linked to this session so dashboard/platform stats stay consistent.
  await db.delete(sessionTables)
    .where(and(eq(sessionTables.sessionId, id), eq(sessionTables.userId, userId)));
  
  const result = await db.delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  
  return (result[0] as any).affectedRows > 0;
}

export async function deleteAllSessionHistory(userId: number): Promise<{ sessionsDeleted: number; tablesDeleted: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Only finalized history is deleted. Active session remains untouched.
  const tablesResult = await db.delete(sessionTables)
    .where(and(eq(sessionTables.userId, userId), sql`${sessionTables.sessionId} IS NOT NULL`));

  const sessionsResult = await db.delete(sessions)
    .where(eq(sessions.userId, userId));

  return {
    sessionsDeleted: (sessionsResult[0] as any).affectedRows ?? 0,
    tablesDeleted: (tablesResult[0] as any).affectedRows ?? 0,
  };
}

export async function getHandPatternStats(userId: number): Promise<{
  kk: { hands: number; wins: number; losses: number; winRate: number };
  jj: { hands: number; wins: number; losses: number; winRate: number };
  aa: { hands: number; wins: number; losses: number; winRate: number };
  ak: { hands: number; wins: number; losses: number; winRate: number };
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tableRows = await db
    .select({
      notes: sessionTables.notes,
      buyIn: sessionTables.buyIn,
      cashOut: sessionTables.cashOut,
      sessionId: sessionTables.sessionId,
    })
    .from(sessionTables)
    .innerJoin(
      sessions,
      and(
        eq(sessionTables.sessionId, sessions.id),
        eq(sessions.userId, userId),
      )
    )
    .where(and(eq(sessionTables.userId, userId), sql`${sessionTables.notes} IS NOT NULL`));

  const kkRegex = /\b(kk|rei\s*rei|k\s*k)\b/i;
  const jjRegex = /\b(jj|vala\s*vala|j\s*j)\b/i;
  const aaRegex = /\b(aa|as\s*as|a\s*a)\b/i;
  const akRegex = /\b(ak|as\s*e\s*k|a\s*k)\b/i;

  const kk = { hands: 0, wins: 0, losses: 0, winRate: 0 };
  const jj = { hands: 0, wins: 0, losses: 0, winRate: 0 };
  const aa = { hands: 0, wins: 0, losses: 0, winRate: 0 };
  const ak = { hands: 0, wins: 0, losses: 0, winRate: 0 };

  for (const row of tableRows) {
    const notes = (row.notes ?? "").toString();
    const profit = (row.cashOut ?? row.buyIn ?? 0) - (row.buyIn ?? 0);

    if (kkRegex.test(notes)) {
      kk.hands += 1;
      if (profit > 0) kk.wins += 1;
      else if (profit < 0) kk.losses += 1;
    }

    if (jjRegex.test(notes)) {
      jj.hands += 1;
      if (profit > 0) jj.wins += 1;
      else if (profit < 0) jj.losses += 1;
    }

    if (aaRegex.test(notes)) {
      aa.hands += 1;
      if (profit > 0) aa.wins += 1;
      else if (profit < 0) aa.losses += 1;
    }

    if (akRegex.test(notes)) {
      ak.hands += 1;
      if (profit > 0) ak.wins += 1;
      else if (profit < 0) ak.losses += 1;
    }
  }

  const [manual] = await db
    .select({
      kkHands: handPatternCounters.kkHands,
      kkWins: handPatternCounters.kkWins,
      kkLosses: handPatternCounters.kkLosses,
      jjHands: handPatternCounters.jjHands,
      jjWins: handPatternCounters.jjWins,
      jjLosses: handPatternCounters.jjLosses,
      aaHands: handPatternCounters.aaHands,
      aaWins: handPatternCounters.aaWins,
      aaLosses: handPatternCounters.aaLosses,
      akHands: handPatternCounters.akHands,
      akWins: handPatternCounters.akWins,
      akLosses: handPatternCounters.akLosses,
    })
    .from(handPatternCounters)
    .where(eq(handPatternCounters.userId, userId))
    .limit(1);

  if (manual) {
    kk.hands += Math.max(0, Number(manual.kkHands ?? 0));
    kk.wins += Math.max(0, Number(manual.kkWins ?? 0));
    kk.losses += Math.max(0, Number(manual.kkLosses ?? 0));

    jj.hands += Math.max(0, Number(manual.jjHands ?? 0));
    jj.wins += Math.max(0, Number(manual.jjWins ?? 0));
    jj.losses += Math.max(0, Number(manual.jjLosses ?? 0));

    aa.hands += Math.max(0, Number(manual.aaHands ?? 0));
    aa.wins += Math.max(0, Number(manual.aaWins ?? 0));
    aa.losses += Math.max(0, Number(manual.aaLosses ?? 0));

    ak.hands += Math.max(0, Number(manual.akHands ?? 0));
    ak.wins += Math.max(0, Number(manual.akWins ?? 0));
    ak.losses += Math.max(0, Number(manual.akLosses ?? 0));
  }

  kk.hands = Math.max(kk.hands, kk.wins + kk.losses);
  jj.hands = Math.max(jj.hands, jj.wins + jj.losses);
  aa.hands = Math.max(aa.hands, aa.wins + aa.losses);
  ak.hands = Math.max(ak.hands, ak.wins + ak.losses);

  kk.winRate = kk.hands > 0 ? Math.round((kk.wins / kk.hands) * 100) : 0;
  jj.winRate = jj.hands > 0 ? Math.round((jj.wins / jj.hands) * 100) : 0;
  aa.winRate = aa.hands > 0 ? Math.round((aa.wins / aa.hands) * 100) : 0;
  ak.winRate = ak.hands > 0 ? Math.round((ak.wins / ak.hands) * 100) : 0;

  return { kk, jj, aa, ak };
}

export async function getGlobalHandPatternStats(limit = 20, minHands = 6): Promise<Array<{
  userId: number;
  name: string | null;
  avatarUrl: string | null;
  kk: { hands: number; wins: number; losses: number; winRate: number };
  jj: { hands: number; wins: number; losses: number; winRate: number };
  aa: { hands: number; wins: number; losses: number; winRate: number };
  ak: { hands: number; wins: number; losses: number; winRate: number };
  totalHands: number;
  totalWins: number;
  totalLosses: number;
  overallWinRate: number;
  performanceScore: number;
}>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tableRows = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      notes: sessionTables.notes,
      buyIn: sessionTables.buyIn,
      cashOut: sessionTables.cashOut,
    })
    .from(sessionTables)
    .innerJoin(sessions, and(eq(sessionTables.sessionId, sessions.id), eq(sessionTables.userId, sessions.userId)))
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(sql`${sessionTables.notes} IS NOT NULL`);

  const kkRegex = /\b(kk|rei\s*rei|k\s*k)\b/i;
  const jjRegex = /\b(jj|vala\s*vala|j\s*j)\b/i;
  const aaRegex = /\b(aa|as\s*as|a\s*a)\b/i;
  const akRegex = /\b(ak|as\s*e\s*k|a\s*k)\b/i;

  const byUser = new Map<number, {
    userId: number;
    name: string | null;
    avatarUrl: string | null;
    kk: { hands: number; wins: number; losses: number; winRate: number };
    jj: { hands: number; wins: number; losses: number; winRate: number };
    aa: { hands: number; wins: number; losses: number; winRate: number };
    ak: { hands: number; wins: number; losses: number; winRate: number };
    totalHands: number;
  }>();

  for (const row of tableRows) {
    const id = Number(row.userId);
    if (!byUser.has(id)) {
      byUser.set(id, {
        userId: id,
        name: row.name ?? null,
        avatarUrl: row.avatarUrl ?? null,
        kk: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        jj: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        aa: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        ak: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        totalHands: 0,
      });
    }

    const entry = byUser.get(id)!;
    const notes = (row.notes ?? "").toString();
    const profit = (row.cashOut ?? row.buyIn ?? 0) - (row.buyIn ?? 0);

    let matched = false;
    if (kkRegex.test(notes)) {
      entry.kk.hands += 1;
      if (profit > 0) entry.kk.wins += 1;
      else if (profit < 0) entry.kk.losses += 1;
      matched = true;
    }

    if (jjRegex.test(notes)) {
      entry.jj.hands += 1;
      if (profit > 0) entry.jj.wins += 1;
      else if (profit < 0) entry.jj.losses += 1;
      matched = true;
    }

    if (aaRegex.test(notes)) {
      entry.aa.hands += 1;
      if (profit > 0) entry.aa.wins += 1;
      else if (profit < 0) entry.aa.losses += 1;
      matched = true;
    }

    if (akRegex.test(notes)) {
      entry.ak.hands += 1;
      if (profit > 0) entry.ak.wins += 1;
      else if (profit < 0) entry.ak.losses += 1;
      matched = true;
    }

    if (matched) entry.totalHands += 1;
  }

  const manualRows = await db
    .select({
      userId: handPatternCounters.userId,
      kkHands: handPatternCounters.kkHands,
      kkWins: handPatternCounters.kkWins,
      kkLosses: handPatternCounters.kkLosses,
      jjHands: handPatternCounters.jjHands,
      jjWins: handPatternCounters.jjWins,
      jjLosses: handPatternCounters.jjLosses,
      aaHands: handPatternCounters.aaHands,
      aaWins: handPatternCounters.aaWins,
      aaLosses: handPatternCounters.aaLosses,
      akHands: handPatternCounters.akHands,
      akWins: handPatternCounters.akWins,
      akLosses: handPatternCounters.akLosses,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(handPatternCounters)
    .innerJoin(users, eq(handPatternCounters.userId, users.id));

  for (const row of manualRows) {
    const id = Number(row.userId);
    if (!byUser.has(id)) {
      byUser.set(id, {
        userId: id,
        name: row.name ?? null,
        avatarUrl: row.avatarUrl ?? null,
        kk: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        jj: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        aa: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        ak: { hands: 0, wins: 0, losses: 0, winRate: 0 },
        totalHands: 0,
      });
    }

    const entry = byUser.get(id)!;
    entry.name = entry.name ?? row.name ?? null;
    entry.avatarUrl = entry.avatarUrl ?? row.avatarUrl ?? null;

    entry.kk.hands += Math.max(0, Number(row.kkHands ?? 0));
    entry.kk.wins += Math.max(0, Number(row.kkWins ?? 0));
    entry.kk.losses += Math.max(0, Number(row.kkLosses ?? 0));

    entry.jj.hands += Math.max(0, Number(row.jjHands ?? 0));
    entry.jj.wins += Math.max(0, Number(row.jjWins ?? 0));
    entry.jj.losses += Math.max(0, Number(row.jjLosses ?? 0));

    entry.aa.hands += Math.max(0, Number(row.aaHands ?? 0));
    entry.aa.wins += Math.max(0, Number(row.aaWins ?? 0));
    entry.aa.losses += Math.max(0, Number(row.aaLosses ?? 0));

    entry.ak.hands += Math.max(0, Number(row.akHands ?? 0));
    entry.ak.wins += Math.max(0, Number(row.akWins ?? 0));
    entry.ak.losses += Math.max(0, Number(row.akLosses ?? 0));
  }

  const data = Array.from(byUser.values())
    .map((entry) => {
      entry.kk.hands = Math.max(entry.kk.hands, entry.kk.wins + entry.kk.losses);
      entry.jj.hands = Math.max(entry.jj.hands, entry.jj.wins + entry.jj.losses);
      entry.aa.hands = Math.max(entry.aa.hands, entry.aa.wins + entry.aa.losses);
      entry.ak.hands = Math.max(entry.ak.hands, entry.ak.wins + entry.ak.losses);
      entry.kk.winRate = entry.kk.hands > 0 ? Math.round((entry.kk.wins / entry.kk.hands) * 100) : 0;
      entry.jj.winRate = entry.jj.hands > 0 ? Math.round((entry.jj.wins / entry.jj.hands) * 100) : 0;
      entry.aa.winRate = entry.aa.hands > 0 ? Math.round((entry.aa.wins / entry.aa.hands) * 100) : 0;
      entry.ak.winRate = entry.ak.hands > 0 ? Math.round((entry.ak.wins / entry.ak.hands) * 100) : 0;
      const totalHands = entry.kk.hands + entry.jj.hands + entry.aa.hands + entry.ak.hands;
      const totalWins = entry.kk.wins + entry.jj.wins + entry.aa.wins + entry.ak.wins;
      const totalLosses = entry.kk.losses + entry.jj.losses + entry.aa.losses + entry.ak.losses;
      const overallWinRate = totalHands > 0 ? Math.round((totalWins / totalHands) * 100) : 0;
      const performanceScore = totalHands > 0 ? Number((overallWinRate * Math.log10(totalHands + 1)).toFixed(4)) : 0;
      return {
        ...entry,
        totalHands,
        totalWins,
        totalLosses,
        overallWinRate,
        performanceScore,
      };
    })
    .filter((entry) => entry.totalHands >= Math.max(1, minHands))
    .sort((a, b) => {
      if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
      if (b.overallWinRate !== a.overallWinRate) return b.overallWinRate - a.overallWinRate;
      return b.totalHands - a.totalHands;
    })
    .slice(0, Math.max(1, limit));

  return data;
}

function normalizeHandCounters(stats: { hands: number; wins: number; losses: number }) {
  const wins = Math.max(0, Math.round(Number(stats.wins ?? 0)));
  const losses = Math.max(0, Math.round(Number(stats.losses ?? 0)));
  const hands = Math.max(Math.max(0, Math.round(Number(stats.hands ?? 0))), wins + losses);
  return { hands, wins, losses };
}

export async function updateHandPatternManualStats(
  userId: number,
  input: {
    kk: { hands: number; wins: number; losses: number };
    jj: { hands: number; wins: number; losses: number };
    aa: { hands: number; wins: number; losses: number };
    ak: { hands: number; wins: number; losses: number };
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const kk = normalizeHandCounters(input.kk);
  const jj = normalizeHandCounters(input.jj);
  const aa = normalizeHandCounters(input.aa);
  const ak = normalizeHandCounters(input.ak);

  await db
    .insert(handPatternCounters)
    .values({
      userId,
      kkHands: kk.hands,
      kkWins: kk.wins,
      kkLosses: kk.losses,
      jjHands: jj.hands,
      jjWins: jj.wins,
      jjLosses: jj.losses,
      aaHands: aa.hands,
      aaWins: aa.wins,
      aaLosses: aa.losses,
      akHands: ak.hands,
      akWins: ak.wins,
      akLosses: ak.losses,
    })
    .onDuplicateKeyUpdate({
      set: {
        kkHands: kk.hands,
        kkWins: kk.wins,
        kkLosses: kk.losses,
        jjHands: jj.hands,
        jjWins: jj.wins,
        jjLosses: jj.losses,
        aaHands: aa.hands,
        aaWins: aa.wins,
        aaLosses: aa.losses,
        akHands: ak.hands,
        akWins: ak.wins,
        akLosses: ak.losses,
      },
    });

  return getHandPatternStats(userId);
}

export async function registerHandPatternResult(
  userId: number,
  hand: "kk" | "jj" | "aa" | "ak",
  outcome: "win" | "loss"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(handPatternCounters)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });

  const [row] = await db
    .select()
    .from(handPatternCounters)
    .where(eq(handPatternCounters.userId, userId))
    .limit(1);

  const kk = normalizeHandCounters({
    hands: Number(row?.kkHands ?? 0),
    wins: Number(row?.kkWins ?? 0),
    losses: Number(row?.kkLosses ?? 0),
  });
  const jj = normalizeHandCounters({
    hands: Number(row?.jjHands ?? 0),
    wins: Number(row?.jjWins ?? 0),
    losses: Number(row?.jjLosses ?? 0),
  });
  const aa = normalizeHandCounters({
    hands: Number(row?.aaHands ?? 0),
    wins: Number(row?.aaWins ?? 0),
    losses: Number(row?.aaLosses ?? 0),
  });
  const ak = normalizeHandCounters({
    hands: Number(row?.akHands ?? 0),
    wins: Number(row?.akWins ?? 0),
    losses: Number(row?.akLosses ?? 0),
  });

  const target = hand === "kk" ? kk : hand === "jj" ? jj : hand === "aa" ? aa : ak;
  target.hands += 1;
  if (outcome === "win") target.wins += 1;
  else target.losses += 1;

  return updateHandPatternManualStats(userId, { kk, jj, aa, ak });
}

export async function getSessionById(id: number, userId: number): Promise<Session | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [session] = await db.select().from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  
  return session || null;
}

// Game format type
type GameFormat = "cash_game" | "tournament" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game";

export async function getUserSessions(
  userId: number,
  filters?: {
    type?: "online" | "live";
    gameFormat?: GameFormat;
    startDate?: Date;
    endDate?: Date;
    orderBy?: "date" | "profit" | "duration";
    orderDir?: "asc" | "desc";
  }
): Promise<(Session & { venueName?: string | null; venueLogoUrl?: string | null })[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions = [eq(sessions.userId, userId)];
  
  if (filters?.type) {
    conditions.push(eq(sessions.type, filters.type));
  }
  if (filters?.gameFormat) {
    conditions.push(eq(sessions.gameFormat, filters.gameFormat));
  }
  if (filters?.startDate) {
    conditions.push(gte(sessions.sessionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(sessions.sessionDate, filters.endDate));
  }
  
  const result = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      type: sessions.type,
      gameFormat: sessions.gameFormat,
      buyIn: sessions.buyIn,
      cashOut: sessions.cashOut,
      currency: sessions.currency,
      originalBuyIn: sessions.originalBuyIn,
      originalCashOut: sessions.originalCashOut,
      exchangeRate: sessions.exchangeRate,
      sessionDate: sessions.sessionDate,
      durationMinutes: sessions.durationMinutes,
      notes: sessions.notes,
      doubts: sessions.doubts,
      venueId: sessions.venueId,
      gameType: sessions.gameType,
      stakes: sessions.stakes,
      tournamentName: sessions.tournamentName,
      finalPosition: sessions.finalPosition,
      fieldSize: sessions.fieldSize,
      location: sessions.location,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      venueName: venues.name,
      venueLogoUrl: venues.logoUrl,
    })
    .from(sessions)
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.sessionDate));
  
  const sessionRows = result as any[];
  if (sessionRows.length === 0) {
    return sessionRows as any;
  }

  // Build metrics from session_tables so session is a true container and tables are the source of truth.
  const sessionIds = sessionRows.map((s) => s.id);
  const tableRows = await db
    .select({
      sessionId: sessionTables.sessionId,
      type: sessionTables.type,
      buyIn: sessionTables.buyIn,
      cashOut: sessionTables.cashOut,
      currency: sessionTables.currency,
      venueId: sessionTables.venueId,
      gameFormat: sessionTables.gameFormat,
      tournamentName: sessionTables.tournamentName,
      finalPosition: sessionTables.finalPosition,
      fieldSize: sessionTables.fieldSize,
    })
    .from(sessionTables)
    .where(and(eq(sessionTables.userId, userId), sql`${sessionTables.sessionId} IN (${sql.join(sessionIds.map((id) => sql`${id}`), sql`,`)})`));

  const rates = await getAllRates().catch(() => null);
  const toBrl = (amount: number, currency?: string | null): number => {
    if (currency === "USD") return Math.round(amount * (rates?.USD?.rate ?? 5.75));
    if (currency === "CAD") return Math.round(amount * (rates?.CAD?.rate ?? 4.20));
    if (currency === "JPY") return Math.round(amount * (rates?.JPY?.rate ?? 0.033));
    if (currency === "CNY") return Math.round(amount * (rates?.CNY?.rate ?? 0.80));
    return amount;
  };

  const bySession = new Map<number, {
    tableCount: number;
    totalTableBuyIn: number;
    totalTableCashOut: number;
    bestTableProfit: number | null;
    worstTableProfit: number | null;
    venueIds: Set<number>;
    gameFormats: Set<string>;
    primaryTournamentName: string | null;
    bestFinalPosition: number | null;
    maxFieldSize: number | null;
    finalPositionSum: number;
    finalPositionCount: number;
    hasOnlineTables: boolean;
    hasLiveTables: boolean;
  }>();

  for (const row of tableRows) {
    if (!row.sessionId) continue;
    const key = Number(row.sessionId);
    if (!bySession.has(key)) {
      bySession.set(key, {
        tableCount: 0,
        totalTableBuyIn: 0,
        totalTableCashOut: 0,
        bestTableProfit: null,
        worstTableProfit: null,
        venueIds: new Set<number>(),
        gameFormats: new Set<string>(),
        primaryTournamentName: null,
        bestFinalPosition: null,
        maxFieldSize: null,
        finalPositionSum: 0,
        finalPositionCount: 0,
        hasOnlineTables: false,
        hasLiveTables: false,
      });
    }

    const agg = bySession.get(key)!;
    const buyIn = toBrl(row.buyIn ?? 0, row.currency);
    const cashOut = toBrl(row.cashOut ?? 0, row.currency);
    const profit = cashOut - buyIn;

    agg.tableCount += 1;
    agg.totalTableBuyIn += buyIn;
    agg.totalTableCashOut += cashOut;
    agg.bestTableProfit = agg.bestTableProfit === null ? profit : Math.max(agg.bestTableProfit, profit);
    agg.worstTableProfit = agg.worstTableProfit === null ? profit : Math.min(agg.worstTableProfit, profit);
    if (row.venueId != null) agg.venueIds.add(row.venueId);
    agg.gameFormats.add(row.gameFormat);
    if (row.type === "online") agg.hasOnlineTables = true;
    if (row.type === "live") agg.hasLiveTables = true;
    if (!agg.primaryTournamentName && row.tournamentName && row.tournamentName.trim()) {
      agg.primaryTournamentName = row.tournamentName.trim();
    }
    if (typeof row.finalPosition === "number" && row.finalPosition > 0) {
      agg.bestFinalPosition = agg.bestFinalPosition === null
        ? row.finalPosition
        : Math.min(agg.bestFinalPosition, row.finalPosition);
      agg.finalPositionSum += row.finalPosition;
      agg.finalPositionCount += 1;
    }
    if (typeof row.fieldSize === "number" && row.fieldSize > 0) {
      agg.maxFieldSize = agg.maxFieldSize === null
        ? row.fieldSize
        : Math.max(agg.maxFieldSize, row.fieldSize);
    }
  }

  const enriched = sessionRows.map((s) => {
    const agg = bySession.get(s.id);
    const totalBuyIn = agg ? agg.totalTableBuyIn : s.buyIn;
    const totalCashOut = agg ? agg.totalTableCashOut : s.cashOut;
    const totalProfit = totalCashOut - totalBuyIn;
    const roi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;
    const hourlyRate = s.durationMinutes > 0 ? Math.round((totalProfit / s.durationMinutes) * 60) : 0;

    return {
      ...s,
      tableCount: agg?.tableCount ?? 0,
      totalTableBuyIn: totalBuyIn,
      totalTableCashOut: totalCashOut,
      totalTableProfit: totalProfit,
      roi,
      hourlyRate,
      bestTableProfit: agg?.bestTableProfit ?? null,
      worstTableProfit: agg?.worstTableProfit ?? null,
      primaryTournamentName: agg?.primaryTournamentName ?? null,
      bestFinalPosition: agg?.bestFinalPosition ?? s.finalPosition ?? null,
      avgFinalPosition: agg && agg.finalPositionCount > 0
        ? Math.round(agg.finalPositionSum / agg.finalPositionCount)
        : (s.finalPosition ?? null),
      fieldSize: agg?.maxFieldSize ?? s.fieldSize ?? null,
      uniqueVenueCount: agg?.venueIds.size ?? 0,
      uniqueGameFormatCount: agg?.gameFormats.size ?? 0,
      isMultiTable: (agg?.tableCount ?? 0) > 1,
      isMultiVenue: (agg?.venueIds.size ?? 0) > 1,
      isMultiFormat: (agg?.gameFormats.size ?? 0) > 1,
      hasOnlineTables: agg?.hasOnlineTables ?? (s.type === "online"),
      hasLiveTables: agg?.hasLiveTables ?? (s.type === "live"),
      effectiveType: agg
        ? (agg.hasOnlineTables && agg.hasLiveTables ? "mixed" : agg.hasOnlineTables ? "online" : "live")
        : s.type,
    };
  });

  return enriched as any;
}

export async function getRecentPlayedTables(userId: number, limit = 12) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      id: sessionTables.id,
      sessionId: sessionTables.sessionId,
      startedAt: sessionTables.startedAt,
      endedAt: sessionTables.endedAt,
      type: sessionTables.type,
      gameFormat: sessionTables.gameFormat,
      currency: sessionTables.currency,
      buyIn: sessionTables.buyIn,
      cashOut: sessionTables.cashOut,
      stakes: sessionTables.stakes,
      tournamentName: sessionTables.tournamentName,
      finalPosition: sessionTables.finalPosition,
      venueId: sessionTables.venueId,
      venueName: venues.name,
      venueLogoUrl: venues.logoUrl,
      sessionDate: sessions.sessionDate,
      sessionDurationMinutes: sessions.durationMinutes,
    })
    .from(sessionTables)
    .innerJoin(sessions, eq(sessionTables.sessionId, sessions.id))
    .leftJoin(venues, eq(sessionTables.venueId, venues.id))
    .where(eq(sessionTables.userId, userId))
    .orderBy(desc(sessions.sessionDate), desc(sessionTables.startedAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    tableProfit: (row.cashOut ?? 0) - row.buyIn,
  }));
}

export async function getSessionStats(userId: number, type?: "online" | "live", gameFormat?: GameFormat) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));

  if (allSessions.length === 0) {
    return {
      totalSessions: 0,
      totalTables: 0,
      totalBuyIn: 0,
      totalCashOut: 0,
      totalProfit: 0,
      totalDuration: 0,
      winningSessions: 0,
      losingSessions: 0,
      breakEvenSessions: 0,
      bestSession: null,
      worstSession: null,
      trophyCount: 0,
      maxFieldSize: null,
      avgFieldSize: null,
      avgProfit: 0,
      winRate: 0,
      avgHourlyRate: 0,
    };
  }

  const sessionIds = allSessions.map((s) => s.id);
  const allTables = await db
    .select({
      sessionId: sessionTables.sessionId,
      type: sessionTables.type,
      gameFormat: sessionTables.gameFormat,
      cashOut: sessionTables.cashOut,
      finalPosition: sessionTables.finalPosition,
    })
    .from(sessionTables)
    .where(
      and(
        eq(sessionTables.userId, userId),
        sql`${sessionTables.sessionId} IS NOT NULL`,
        sql`${sessionTables.sessionId} IN (${sql.join(sessionIds.map((id) => sql`${id}`), sql`,`)})`
      )
    );

  const tablesBySession = new Map<number, Array<{ type: "online" | "live"; gameFormat: GameFormat; cashOut: number | null; finalPosition: number | null }>>();
  for (const t of allTables) {
    if (!t.sessionId) continue;
    const sid = Number(t.sessionId);
    if (!tablesBySession.has(sid)) tablesBySession.set(sid, []);
    tablesBySession.get(sid)!.push({
      type: t.type as "online" | "live",
      gameFormat: t.gameFormat as GameFormat,
      cashOut: t.cashOut ?? 0,
      finalPosition: t.finalPosition ?? null,
    });
  }

  const hasTableFilter = Boolean(type || gameFormat);
  const includedSessions: Array<{
    session: Session;
    share: number;
    matchedTables: number;
    matchedItmTables: number;
    matchedItmEligibleTables: number;
    matchedBestFinalPosition: number | null;
    matchedFinalPositionSum: number;
    matchedFinalPositionCount: number;
    matchedTrophyCount: number;
    totalTables: number;
  }> = [];

  for (const session of allSessions) {
    const tables = tablesBySession.get(session.id) ?? [];
    const totalTables = tables.length;

    if (!hasTableFilter) {
      const itmEligibleTables = tables.filter((t) => t.gameFormat !== "cash_game");
      const validFinalPositions = tables
        .map((t) => t.finalPosition)
        .filter((fp): fp is number => typeof fp === "number" && fp > 0);
      includedSessions.push({
        session,
        share: 1,
        matchedTables: totalTables,
        matchedItmTables: itmEligibleTables.filter((t) => (t.cashOut ?? 0) > 0).length,
        matchedItmEligibleTables: itmEligibleTables.length,
        matchedBestFinalPosition: validFinalPositions.length > 0 ? Math.min(...validFinalPositions) : null,
        matchedFinalPositionSum: validFinalPositions.reduce((acc, fp) => acc + fp, 0),
        matchedFinalPositionCount: validFinalPositions.length,
        matchedTrophyCount: validFinalPositions.filter((fp) => fp === 1).length,
        totalTables,
      });
      continue;
    }

    if (totalTables === 0) {
      let matchedByLegacyFields = true;
      if (type && session.type !== type) matchedByLegacyFields = false;
      if (gameFormat && session.gameFormat !== gameFormat) matchedByLegacyFields = false;
      if (matchedByLegacyFields) {
        const itmEligible = session.gameFormat !== "cash_game";
        const fp = typeof session.finalPosition === "number" && session.finalPosition > 0
          ? session.finalPosition
          : null;
        includedSessions.push({
          session,
          share: 1,
          matchedTables: 1,
          matchedItmTables: itmEligible && session.cashOut > 0 ? 1 : 0,
          matchedItmEligibleTables: itmEligible ? 1 : 0,
          matchedBestFinalPosition: fp,
          matchedFinalPositionSum: fp ?? 0,
          matchedFinalPositionCount: fp ? 1 : 0,
          matchedTrophyCount: fp === 1 ? 1 : 0,
          totalTables: 1,
        });
      }
      continue;
    }

    const matched = tables.filter((t) => {
      if (type && t.type !== type) return false;
      if (gameFormat && t.gameFormat !== gameFormat) return false;
      return true;
    });

    const matchedTables = matched.length;
    const itmEligibleMatched = matched.filter((t) => t.gameFormat !== "cash_game");
    const matchedItmTables = itmEligibleMatched.filter((t) => (t.cashOut ?? 0) > 0).length;
    const matchedItmEligibleTables = itmEligibleMatched.length;
    const validFinalPositions = matched
      .map((t) => t.finalPosition)
      .filter((fp): fp is number => typeof fp === "number" && fp > 0);

    if (matchedTables <= 0) continue;
    includedSessions.push({
      session,
      share: matchedTables / totalTables,
      matchedTables,
      matchedItmTables,
      matchedItmEligibleTables,
      matchedBestFinalPosition: validFinalPositions.length > 0 ? Math.min(...validFinalPositions) : null,
      matchedFinalPositionSum: validFinalPositions.reduce((acc, fp) => acc + fp, 0),
      matchedFinalPositionCount: validFinalPositions.length,
      matchedTrophyCount: validFinalPositions.filter((fp) => fp === 1).length,
      totalTables,
    });
  }

  if (includedSessions.length === 0) {
    return {
      totalSessions: 0,
      totalTables: 0,
      totalBuyIn: 0,
      totalCashOut: 0,
      totalProfit: 0,
      totalDuration: 0,
      winningSessions: 0,
      losingSessions: 0,
      breakEvenSessions: 0,
      itmCount: 0,
      trophyCount: 0,
      bestSession: null,
      worstSession: null,
      maxFieldSize: null,
      avgFieldSize: null,
      avgProfit: 0,
      winRate: 0,
      avgHourlyRate: 0,
    };
  }

  let totalBuyIn = 0;
  let totalCashOut = 0;
  let totalDuration = 0;
  let totalTables = 0;
  let itmCount = 0;
  let itmEligibleTables = 0;
  let trophyCount = 0;
  let winningSessions = 0;
  let losingSessions = 0;
  let breakEvenSessions = 0;
  let bestProfit = -Infinity;
  let worstProfit = Infinity;
  let bestSession: Session | null = null;
  let worstSession: Session | null = null;
  let bestFinalPosition: number | null = null;
  let finalPositionSum = 0;
  let finalPositionCount = 0;
  let maxFieldSize: number | null = null;
  let fieldSizeSum = 0;
  let fieldSizeCount = 0;

  for (const row of includedSessions) {
    const buyIn = Math.round(row.session.buyIn * row.share);
    const cashOut = Math.round(row.session.cashOut * row.share);
    const duration = Math.max(1, Math.round(row.session.durationMinutes * row.share));
    const profit = cashOut - buyIn;

    totalBuyIn += buyIn;
    totalCashOut += cashOut;
    totalDuration += duration;
    totalTables += row.matchedTables;
    itmCount += row.matchedItmTables;
    itmEligibleTables += row.matchedItmEligibleTables;

    if (typeof row.matchedBestFinalPosition === "number" && row.matchedBestFinalPosition > 0) {
      bestFinalPosition = bestFinalPosition === null
        ? row.matchedBestFinalPosition
        : Math.min(bestFinalPosition, row.matchedBestFinalPosition);
      finalPositionSum += row.matchedFinalPositionSum;
      finalPositionCount += row.matchedFinalPositionCount;
      trophyCount += row.matchedTrophyCount;
    }

    const fs = (row.session as any).fieldSize;
    if (typeof fs === "number" && fs > 0) {
      maxFieldSize = maxFieldSize === null ? fs : Math.max(maxFieldSize, fs);
      fieldSizeSum += fs;
      fieldSizeCount += 1;
    }

    if (profit > 0) winningSessions++;
    else if (profit < 0) losingSessions++;
    else breakEvenSessions++;

    if (profit > bestProfit) {
      bestProfit = profit;
      bestSession = row.session;
    }
    if (profit < worstProfit) {
      worstProfit = profit;
      worstSession = row.session;
    }
  }

  const totalProfit = totalCashOut - totalBuyIn;
  const totalHours = totalDuration / 60;

  return {
    totalSessions: includedSessions.length,
    totalTables,
    totalBuyIn,
    totalCashOut,
    totalProfit,
    totalDuration,
    winningSessions,
    losingSessions,
    breakEvenSessions,
    itmCount,
    trophyCount,
    bestSession,
    worstSession,
    bestFinalPosition,
    avgFinalPosition: finalPositionCount > 0 ? Math.round(finalPositionSum / finalPositionCount) : null,
    maxFieldSize,
    avgFieldSize: fieldSizeCount > 0 ? Math.round(fieldSizeSum / fieldSizeCount) : null,
    avgProfit: Math.round(totalProfit / includedSessions.length),
    winRate: itmEligibleTables > 0 ? Math.round((itmCount / itmEligibleTables) * 100) : 0,
    avgHourlyRate: totalHours > 0 ? Math.round(totalProfit / totalHours) : 0,
  };
}

// ─── Private Chat ─────────────────────────────────────────────────────────────

const ALLOWED_MESSAGE_REACTIONS = ["❤️", "🔥", "😂", "👏", "👀"] as const;
type AllowedMessageReaction = (typeof ALLOWED_MESSAGE_REACTIONS)[number];

function isDuplicateColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | undefined;
  const code = String(err?.code ?? err?.cause?.code ?? "").toUpperCase();
  const message = String(err?.message ?? err?.cause?.message ?? "").toLowerCase();

  return code === "ER_DUP_FIELDNAME" || message.includes("duplicate column name");
}

async function addColumnIfMissing(
  db: Awaited<ReturnType<typeof getDb>>,
  tableName: string,
  columnDefinition: string
) {
  try {
    await db.execute(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`));
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }
}

async function modifyColumn(
  db: Awaited<ReturnType<typeof getDb>>,
  tableName: string,
  columnDefinition: string
) {
  await db.execute(sql.raw(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnDefinition}`));
}

async function ensureMessagesTable(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id int AUTO_INCREMENT NOT NULL,
      senderId int NOT NULL,
      receiverId int NOT NULL,
      content text NOT NULL,
      caption text NULL,
      type enum('text','image') NOT NULL DEFAULT 'text',
      readAt timestamp NULL,
      createdAt timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT messages_id PRIMARY KEY(id)
    )
  `);

  // Ensure old deployments with partial schema are upgraded in place.
  await addColumnIfMissing(db, "messages", "senderId int NOT NULL");
  await addColumnIfMissing(db, "messages", "receiverId int NOT NULL");
  await addColumnIfMissing(db, "messages", "content text NOT NULL");
  await addColumnIfMissing(db, "messages", "caption text NULL");
  await addColumnIfMissing(db, "messages", "type enum('text','image') NOT NULL DEFAULT 'text'");
  await addColumnIfMissing(db, "messages", "readAt timestamp NULL");
  await addColumnIfMissing(db, "messages", "createdAt timestamp NOT NULL DEFAULT (now())");
  await modifyColumn(db, "messages", "id int AUTO_INCREMENT NOT NULL");
  await modifyColumn(db, "messages", "senderId int NOT NULL");
  await modifyColumn(db, "messages", "receiverId int NOT NULL");
  await modifyColumn(db, "messages", "content text NOT NULL");
  await modifyColumn(db, "messages", "caption text NULL");
  await modifyColumn(db, "messages", "type enum('text','image') NOT NULL DEFAULT 'text'");
  await modifyColumn(db, "messages", "readAt timestamp NULL DEFAULT NULL");
  await modifyColumn(db, "messages", "createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
}

async function ensureMessageReactionsTable(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id int AUTO_INCREMENT NOT NULL,
      messageId int NOT NULL,
      userId int NOT NULL,
      emoji varchar(16) NOT NULL,
      createdAt timestamp NOT NULL DEFAULT (now()),
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT message_reactions_id PRIMARY KEY(id)
    )
  `);

  await addColumnIfMissing(db, "message_reactions", "messageId int NOT NULL");
  await addColumnIfMissing(db, "message_reactions", "userId int NOT NULL");
  await addColumnIfMissing(db, "message_reactions", "emoji varchar(16) NOT NULL");
  await addColumnIfMissing(db, "message_reactions", "createdAt timestamp NOT NULL DEFAULT (now())");
  await addColumnIfMissing(db, "message_reactions", "updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  await modifyColumn(db, "message_reactions", "messageId int NOT NULL");
  await modifyColumn(db, "message_reactions", "userId int NOT NULL");
  await modifyColumn(db, "message_reactions", "emoji varchar(16) NOT NULL");
}

function isMessagesSchemaError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; sql?: string; cause?: { code?: string; message?: string; sql?: string } } | undefined;
  if (!err) return false;
  const code = String(err.code ?? err.cause?.code ?? "").toUpperCase();
  const message = String(err.message ?? err.cause?.message ?? "").toLowerCase();
  const sqlText = String(err.sql ?? err.cause?.sql ?? "").toLowerCase();

  // 1146: table doesn't exist; 1054: unknown column; 1265/1366: bad enum value;
  // 1364: field doesn't have default; 1048: column cannot be null
  if (
    code === "ER_NO_SUCH_TABLE" ||
    code === "ER_BAD_FIELD_ERROR" ||
    code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" ||
    code === "ER_TRUNCATED_WRONG_VALUE" ||
    code === "ER_NO_DEFAULT_FOR_FIELD" ||
    code === "ER_BAD_NULL_ERROR"
  ) {
    return true;
  }

  if (
    sqlText.includes("insert into `messages`") ||
    sqlText.includes("insert into messages") ||
    sqlText.includes("message_reactions") ||
    (message.includes("failed query") && message.includes("insert into `messages`")) ||
    (message.includes("failed query") && message.includes("insert into messages")) ||
    (message.includes("failed query") && message.includes("message_reactions"))
  ) {
    return true;
  }

  return (
    (message.includes("messages") || message.includes("message_reactions") || message.includes("field list") || message.includes("default value")) &&
    (message.includes("doesn't exist") ||
      message.includes("unknown column") ||
      message.includes("incorrect") ||
      message.includes("truncated") ||
      message.includes("doesn't have a default value") ||
      message.includes("cannot be null"))
  );
}

async function runWithMessagesTableRetry<T>(
  db: Awaited<ReturnType<typeof getDb>>,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isMessagesSchemaError(error)) {
      throw error;
    }
    await ensureMessagesTable(db);
    await ensureMessageReactionsTable(db);
    return await operation();
  }
}

async function getMessageReactionState(db: Awaited<ReturnType<typeof getDb>>, currentUserId: number, messageIds: number[]) {
  if (messageIds.length === 0) {
    return { summaryByMessage: new Map<number, Array<{ emoji: string; count: number }>>(), myReactionByMessage: new Map<number, string | null>() };
  }

  const rows = await runWithMessagesTableRetry(db, async () => {
    return db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds));
  });

  const byMessageAndEmoji = new Map<number, Map<string, number>>();
  const myReactionByMessage = new Map<number, string | null>();

  for (const row of rows) {
    if (!byMessageAndEmoji.has(row.messageId)) {
      byMessageAndEmoji.set(row.messageId, new Map<string, number>());
    }
    const bucket = byMessageAndEmoji.get(row.messageId)!;
    bucket.set(row.emoji, (bucket.get(row.emoji) ?? 0) + 1);
    if (row.userId === currentUserId) {
      myReactionByMessage.set(row.messageId, row.emoji);
    }
  }

  const summaryByMessage = new Map<number, Array<{ emoji: string; count: number }>>();
  for (const [messageId, emojiMap] of byMessageAndEmoji.entries()) {
    summaryByMessage.set(
      messageId,
      Array.from(emojiMap.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
    );
  }

  return { summaryByMessage, myReactionByMessage };
}

export async function sendMessage(
  senderId: number,
  receiverId: number,
  content: string,
  type: "text" | "image" = "text",
  caption?: string | null
): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return runWithMessagesTableRetry(db, async () => {
    const [result] = await db.insert(messages).values({ senderId, receiverId, content, type, caption: caption?.trim() || null }).$returningId();
    const [msg] = await db.select().from(messages).where(eq(messages.id, result.id)).limit(1);
    return msg;
  });
}

export async function getConversation(userId: number, friendId: number, limit = 50, before?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return runWithMessagesTableRetry(db, async () => {
    const cond = and(
      or(
        and(eq(messages.senderId, userId), eq(messages.receiverId, friendId)),
        and(eq(messages.senderId, friendId), eq(messages.receiverId, userId))
      ),
      before ? sql`${messages.id} < ${before}` : undefined
    );
    const rows = await db.select().from(messages).where(cond).orderBy(desc(messages.createdAt)).limit(limit);
    const reactionState = await getMessageReactionState(db, userId, rows.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      reactionSummary: reactionState.summaryByMessage.get(row.id) ?? [],
      myReaction: reactionState.myReactionByMessage.get(row.id) ?? null,
    }));
  });
}

export async function markConversationRead(userId: number, senderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await runWithMessagesTableRetry(db, async () => {
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.senderId, senderId), eq(messages.receiverId, userId), isNull(messages.readAt)));
  });
}

export async function getUnreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  return runWithMessagesTableRetry(db, async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), isNull(messages.readAt)));
    return Number(row?.count ?? 0);
  });
}

export async function getConversationList(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return runWithMessagesTableRetry(db, async () => {
    // Get all messages involving this user, ordered newest first
    const allMessages = await db
      .select()
      .from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(desc(messages.createdAt));

    // Build a map of friendId -> last message
    const seen = new Map<number, Message>();
    for (const msg of allMessages) {
      const friendId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!seen.has(friendId)) seen.set(friendId, msg);
    }

    // Count unread per friend
    const unreadMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.receiverId, userId), isNull(messages.readAt)));
    const unreadByFriend = new Map<number, number>();
    for (const msg of unreadMessages) {
      unreadByFriend.set(msg.senderId, (unreadByFriend.get(msg.senderId) ?? 0) + 1);
    }

    // Fetch friend info
    const friendIds = [...seen.keys()];
    if (friendIds.length === 0) return [];

    const friendUsers = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, inviteCode: users.inviteCode })
      .from(users)
      .where(inArray(users.id, friendIds));

    return friendUsers.map((friend) => ({
      friend,
      lastMessage: seen.get(friend.id)!,
      unreadCount: unreadByFriend.get(friend.id) ?? 0,
    })).sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  });
}

export async function toggleMessageReaction(messageId: number, userId: number, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!ALLOWED_MESSAGE_REACTIONS.includes(emoji as AllowedMessageReaction)) {
    throw new Error("Reação inválida.");
  }

  return runWithMessagesTableRetry(db, async () => {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), or(eq(messages.senderId, userId), eq(messages.receiverId, userId))))
      .limit(1);

    if (!message) {
      throw new Error("Mensagem não encontrada.");
    }

    const [existing] = await db
      .select()
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId)))
      .limit(1);

    if (existing) {
      if (existing.emoji === emoji) {
        await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
      } else {
        await db.update(messageReactions).set({ emoji, updatedAt: new Date() }).where(eq(messageReactions.id, existing.id));
      }
    } else {
      await db.insert(messageReactions).values({ messageId, userId, emoji });
    }

    const reactionState = await getMessageReactionState(db, userId, [messageId]);
    return {
      reactionSummary: reactionState.summaryByMessage.get(messageId) ?? [],
      myReaction: reactionState.myReactionByMessage.get(messageId) ?? null,
    };
  });
}

// ============== BANKROLL QUERIES ==============

export async function getBankrollSettings(userId: number): Promise<BankrollSettings | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [settings] = await db.select().from(bankrollSettings)
    .where(eq(bankrollSettings.userId, userId));
  
  return settings || null;
}

export async function upsertBankrollSettings(userId: number, initialOnline: number, initialLive: number): Promise<BankrollSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(bankrollSettings)
    .values({ userId, initialOnline, initialLive })
    .onDuplicateKeyUpdate({
      set: { initialOnline, initialLive, updatedAt: new Date() }
    });
  
  const [settings] = await db.select().from(bankrollSettings)
    .where(eq(bankrollSettings.userId, userId));
  
  return settings;
}

// Get statistics grouped by game format
export async function getStatsByGameFormat(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const allSessions = await db.select().from(sessions)
    .where(eq(sessions.userId, userId));
  
  const formatStats: Record<string, {
    format: string;
    sessions: number;
    totalProfit: number;
    totalBuyIn: number;
    winningSessions: number;
    avgProfit: number;
    winRate: number;
    totalDuration: number;
    avgHourlyRate: number;
  }> = {};
  
  const formats: GameFormat[] = [
    "cash_game", "tournament", "turbo", "hyper_turbo",
    "sit_and_go", "spin_and_go", "bounty", "satellite",
    "freeroll", "home_game"
  ];
  
  // Initialize all formats
  for (const format of formats) {
    formatStats[format] = {
      format,
      sessions: 0,
      totalProfit: 0,
      totalBuyIn: 0,
      winningSessions: 0,
      avgProfit: 0,
      winRate: 0,
      totalDuration: 0,
      avgHourlyRate: 0,
    };
  }
  
  // Calculate stats for each format
  for (const session of allSessions) {
    const format = session.gameFormat;
    const profit = session.cashOut - session.buyIn;
    
    formatStats[format].sessions++;
    formatStats[format].totalProfit += profit;
    formatStats[format].totalBuyIn += session.buyIn;
    formatStats[format].totalDuration += session.durationMinutes;
    if (profit > 0) formatStats[format].winningSessions++;
  }
  
  // Calculate averages
  for (const format of formats) {
    const stats = formatStats[format];
    if (stats.sessions > 0) {
      stats.avgProfit = Math.round(stats.totalProfit / stats.sessions);
      stats.winRate = Math.round((stats.winningSessions / stats.sessions) * 100);
      const totalHours = stats.totalDuration / 60;
      stats.avgHourlyRate = totalHours > 0 ? Math.round(stats.totalProfit / totalHours) : 0;
    }
  }
  
  // Return only formats with sessions, sorted by profit
  return Object.values(formatStats)
    .filter(s => s.sessions > 0)
    .sort((a, b) => b.totalProfit - a.totalProfit);
}

export async function getBankrollHistory(userId: number, type?: "online" | "live") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(sessions.sessionDate);

  if (allSessions.length === 0) return [];

  const sessionIds = allSessions.map((s) => s.id);
  const tableRows = await db
    .select({
      sessionId: sessionTables.sessionId,
      type: sessionTables.type,
    })
    .from(sessionTables)
    .where(
      and(
        eq(sessionTables.userId, userId),
        sql`${sessionTables.sessionId} IS NOT NULL`,
        sql`${sessionTables.sessionId} IN (${sql.join(sessionIds.map((id) => sql`${id}`), sql`,`)})`
      )
    );

  const countsBySession = new Map<number, { online: number; live: number }>();
  for (const row of tableRows) {
    if (!row.sessionId) continue;
    const sid = Number(row.sessionId);
    if (!countsBySession.has(sid)) countsBySession.set(sid, { online: 0, live: 0 });
    if (row.type === "online") countsBySession.get(sid)!.online += 1;
    else countsBySession.get(sid)!.live += 1;
  }

  const normalized: Array<{
    id: number;
    sessionDate: Date;
    type: "online" | "live";
    buyIn: number;
    cashOut: number;
  }> = [];

  for (const session of allSessions) {
    const counts = countsBySession.get(session.id);
    const onlineCount = counts?.online ?? (session.type === "online" ? 1 : 0);
    const liveCount = counts?.live ?? (session.type === "live" ? 1 : 0);
    const totalCount = onlineCount + liveCount;

    if (totalCount <= 0) continue;

    const totalProfit = session.cashOut - session.buyIn;
    const onlineShare = onlineCount / totalCount;
    const onlineProfit = Math.round(totalProfit * onlineShare);
    const liveProfit = totalProfit - onlineProfit;

    const pushRow = (entryType: "online" | "live", profit: number, suffix: number) => {
      normalized.push({
        id: session.id * 10 + suffix,
        sessionDate: session.sessionDate,
        type: entryType,
        buyIn: 0,
        cashOut: profit,
      });
    };

    if (!type || type === "online") {
      if (onlineCount > 0) pushRow("online", onlineProfit, 1);
    }
    if (!type || type === "live") {
      if (liveCount > 0) pushRow("live", liveProfit, 2);
    }
  }

  return normalized.sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());
}

// ============== VENUE QUERIES ==============

const VENUE_ALIAS_MAP: Record<string, string> = {
  "suprema": "Suprema Poker",
  "suprema poker": "Suprema Poker",
  "gg poker": "GG Poker",
  "ggpoker": "GG Poker",
  "pp poker": "PP Poker",
  "pppoker": "PP Poker",
  "pokerstars": "PokerStars",
  "poker stars": "PokerStars",
  "888 poker": "888poker",
  "poker bros": "PokerBros",
  "kk poker": "KKPoker",
  "wpt global": "WPT Global",
  "x poker": "X-Poker",
};

function normalizeVenueText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalVenueName(name: string): string {
  const normalized = normalizeVenueText(name);
  return VENUE_ALIAS_MAP[normalized] ?? name.trim();
}

function venueCanonicalKey(type: "online" | "live", name: string): string {
  const canonical = canonicalVenueName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${type}:${canonical}`;
}

async function mergeDuplicateVenuesForUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allVenues = await db.select().from(venues).where(eq(venues.userId, userId));
  if (allVenues.length < 2) return;

  const grouped = new Map<string, Venue[]>();
  for (const venue of allVenues) {
    const key = venueCanonicalKey(venue.type, venue.name);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(venue);
  }

  for (const group of Array.from(grouped.values())) {
    if (group.length < 2) continue;

    group.sort((a: Venue, b: Venue) => {
      if (b.isPreset !== a.isPreset) return b.isPreset - a.isPreset;
      return a.id - b.id;
    });

    const canonical = group[0];
    for (const duplicate of group.slice(1)) {
      await db.update(sessions)
        .set({ venueId: canonical.id })
        .where(and(eq(sessions.userId, userId), eq(sessions.venueId, duplicate.id)));

      await db.update(sessionTables)
        .set({ venueId: canonical.id })
        .where(and(eq(sessionTables.userId, userId), eq(sessionTables.venueId, duplicate.id)));

      await db.update(venueBalanceHistory)
        .set({ venueId: canonical.id })
        .where(and(eq(venueBalanceHistory.userId, userId), eq(venueBalanceHistory.venueId, duplicate.id)));

      if ((duplicate.balance ?? 0) !== 0) {
        await db.update(venues)
          .set({
            balance: sql`${venues.balance} + ${duplicate.balance}` as any,
            updatedAt: new Date(),
          })
          .where(eq(venues.id, canonical.id));
      }

      await db.delete(venues).where(eq(venues.id, duplicate.id));
    }
  }
}

export async function createVenue(data: InsertVenue): Promise<Venue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await mergeDuplicateVenuesForUser(data.userId);

  const normalizedName = canonicalVenueName(data.name);
  const sameTypeVenues = await db.select().from(venues)
    .where(and(eq(venues.userId, data.userId), eq(venues.type, data.type)));
  const existing = sameTypeVenues.find((venue) => venueCanonicalKey(venue.type, venue.name) === venueCanonicalKey(data.type, normalizedName));
  if (existing) {
    return existing;
  }

  const [result] = await db.insert(venues).values({ ...data, name: normalizedName }).$returningId();
  const [venue] = await db.select().from(venues).where(eq(venues.id, result.id));
  return venue;
}

export async function updateVenue(id: number, userId: number, data: Partial<InsertVenue>): Promise<Venue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [current] = await db.select().from(venues)
    .where(and(eq(venues.id, id), eq(venues.userId, userId)));
  if (!current) return null;

  await mergeDuplicateVenuesForUser(userId);

  const nextType = data.type ?? current.type;
  const nextName = canonicalVenueName(data.name ?? current.name);
  const sameTypeVenues = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.type, nextType)));
  const duplicate = sameTypeVenues.find((venue) => venue.id !== id && venueCanonicalKey(venue.type, venue.name) === venueCanonicalKey(nextType, nextName));
  if (duplicate) {
    throw new Error("Ja existe uma plataforma com esse nome.");
  }
  
  await db.update(venues)
    .set({ ...data, name: nextName, updatedAt: new Date() })
    .where(and(eq(venues.id, id), eq(venues.userId, userId)));

  await mergeDuplicateVenuesForUser(userId);
  
  const [venue] = await db.select().from(venues).where(eq(venues.id, id));
  return venue || null;
}

export async function deleteVenue(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Don't allow deleting preset venues
  const [venue] = await db.select().from(venues).where(eq(venues.id, id));
  if (venue?.isPreset === 1) {
    return false;
  }
  
  const result = await db.delete(venues)
    .where(and(eq(venues.id, id), eq(venues.userId, userId)));
  
  return (result[0] as any).affectedRows > 0;
}

export async function getUserVenues(userId: number, type?: "online" | "live"): Promise<Venue[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await mergeDuplicateVenuesForUser(userId);
  
  const conditions = [eq(venues.userId, userId)];
  if (type) {
    conditions.push(eq(venues.type, type));
  }
  
  const result = await db.select().from(venues)
    .where(and(...conditions))
    .orderBy(venues.name);
  
  return result;
}

export async function getVenueById(id: number, userId: number): Promise<Venue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [venue] = await db.select().from(venues)
    .where(and(eq(venues.id, id), eq(venues.userId, userId)));
  
  return venue || null;
}

export async function initializePresetVenues(userId: number, presets: Array<{ name: string; type: "online" | "live"; logoUrl: string; defaultCurrency?: string; website?: string }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await mergeDuplicateVenuesForUser(userId);

  // Legacy cleanup: merge old ClubGG preset into GGPoker.
  const [legacyClubGg] = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.isPreset, 1), eq(venues.name, "ClubGG"), eq(venues.type, "online")))
    .limit(1);
  const [ggPokerPreset] = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.isPreset, 1), eq(venues.name, "GGPoker"), eq(venues.type, "online")))
    .limit(1);
  if (legacyClubGg) {
    if (!ggPokerPreset) {
      await db.update(venues)
        .set({
          name: "GGPoker",
          logoUrl: "/logos/ggpoker.png",
          website: "https://www.ggpoker.com",
          updatedAt: new Date(),
        })
        .where(eq(venues.id, legacyClubGg.id));
    } else {
      await db.update(sessions)
        .set({ venueId: ggPokerPreset.id })
        .where(and(eq(sessions.userId, userId), eq(sessions.venueId, legacyClubGg.id)));

      await db.update(sessionTables)
        .set({ venueId: ggPokerPreset.id })
        .where(and(eq(sessionTables.userId, userId), eq(sessionTables.venueId, legacyClubGg.id)));

      await db.delete(venues).where(eq(venues.id, legacyClubGg.id));
    }
  }
  
  // Get existing preset venues
  const existingPresets = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.isPreset, 1)));

  const presetKeys = new Set(presets.map((preset) => venueCanonicalKey(preset.type, preset.name)));

  // Update logos/websites for existing presets
  for (const preset of presets) {
    const canonicalName = canonicalVenueName(preset.name);
    const existing = existingPresets.find((venue) => venueCanonicalKey(venue.type, venue.name) === venueCanonicalKey(preset.type, canonicalName));
    if (existing) {
      // Update logo, website if changed (do not override user-set currency)
      await db.update(venues)
        .set({ name: canonicalName, logoUrl: preset.logoUrl, website: preset.website || null, updatedAt: new Date() })
        .where(eq(venues.id, existing.id));
    } else {
      // Insert new preset with default currency
      await db.insert(venues).values({
        userId,
        name: canonicalName,
        type: preset.type,
        logoUrl: preset.logoUrl,
        website: preset.website || null,
        isPreset: 1,
        currency: (preset.defaultCurrency as "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR") || "BRL",
      });
    }
  }

  // Remove old presets that are no longer in the list (no sessions attached)
  for (const existing of existingPresets) {
    if (!presetKeys.has(venueCanonicalKey(existing.type, existing.name))) {
      // Only delete if no sessions reference this venue
      const sessionCount = await db.select().from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.venueId, existing.id)));
      if (sessionCount.length === 0) {
        await db.delete(venues).where(eq(venues.id, existing.id));
      }
    }
  }

  await mergeDuplicateVenuesForUser(userId);
}

export async function getBuyInsByVenue(userId: number, venueId: number): Promise<Array<{ buyIn: number; currency: string; count: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      buyIn: sessionTables.initialBuyIn,
      currency: sessionTables.currency,
    })
    .from(sessionTables)
    .where(
      and(
        eq(sessionTables.userId, userId),
        eq(sessionTables.venueId, venueId),
        sql`${sessionTables.initialBuyIn} IS NOT NULL AND ${sessionTables.initialBuyIn} > 0`,
      )
    )
    .orderBy(desc(sessionTables.startedAt))
    .limit(500);

  // Count by (buyIn, currency) pair
  const freq = new Map<string, { buyIn: number; currency: string; count: number }>();
  for (const row of rows) {
    const bi = row.buyIn ?? 0;
    const cur = row.currency ?? "BRL";
    const key = `${bi}:${cur}`;
    const entry = freq.get(key);
    if (entry) {
      entry.count++;
    } else {
      freq.set(key, { buyIn: bi, currency: cur, count: 1 });
    }
  }

  return Array.from(freq.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}

export async function getStatsByVenue(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allVenues = await db.select().from(venues)
    .where(eq(venues.userId, userId));

  const venueMap = new Map(allVenues.map(v => [v.id, v]));

  const tables = await db
    .select({
      id: sessionTables.id,
      sessionId: sessionTables.sessionId,
      venueId: sessionTables.venueId,
      currency: sessionTables.currency,
      buyIn: sessionTables.buyIn,
      cashOut: sessionTables.cashOut,
      startedAt: sessionTables.startedAt,
      endedAt: sessionTables.endedAt,
    })
    .from(sessionTables)
    .innerJoin(
      sessions,
      and(
        eq(sessionTables.sessionId, sessions.id),
        eq(sessions.userId, userId),
      )
    )
    .where(and(eq(sessionTables.userId, userId), sql`${sessionTables.venueId} IS NOT NULL`));

  const rates = await getAllRates().catch(() => null);
  const toBrl = (amount: number, currency: string): number => {
    if (currency === "USD") return Math.round(amount * (rates?.USD?.rate ?? 5.75));
    if (currency === "CAD") return Math.round(amount * (rates?.CAD?.rate ?? 4.20));
    if (currency === "JPY") return Math.round(amount * (rates?.JPY?.rate ?? 0.033));
    if (currency === "CNY") return Math.round(amount * (rates?.CNY?.rate ?? 0.80));
    return amount;
  };

  const venueStats: Record<number, {
    venueId: number;
    venueName: string;
    venueType: "online" | "live";
    logoUrl: string | null;
    sessions: number;
    tables: number;
    totalBuyIn: number;
    totalCashOut: number;
    totalProfit: number;
    winningTables: number;
    winRate: number;
    totalDuration: number;
    avgHourlyRate: number;
  }> = {};

  const sessionsByVenue = new Map<number, Set<number>>();
  for (const t of tables) {
    if (!t.venueId) continue;
    const venueId = Number(t.venueId);
    const venue = venueMap.get(venueId);
    if (!venue) continue;

    if (!venueStats[venueId]) {
      venueStats[venueId] = {
        venueId: venue.id,
        venueName: venue.name,
        venueType: venue.type,
        logoUrl: venue.logoUrl,
        sessions: 0,
        tables: 0,
        totalBuyIn: 0,
        totalCashOut: 0,
        totalProfit: 0,
        winningTables: 0,
        winRate: 0,
        totalDuration: 0,
        avgHourlyRate: 0,
      };
    }

    const buyInBrl = toBrl(t.buyIn ?? 0, t.currency);
    const cashOutBrl = toBrl(t.cashOut ?? 0, t.currency);
    const tableProfit = cashOutBrl - buyInBrl;
    const startedMs = new Date(t.startedAt).getTime();
    const endedMs = t.endedAt ? new Date(t.endedAt).getTime() : startedMs;
    const durationMin = Math.max(1, Math.round((endedMs - startedMs) / 60000));

    venueStats[venueId].tables += 1;
    venueStats[venueId].totalBuyIn += buyInBrl;
    venueStats[venueId].totalCashOut += cashOutBrl;
    venueStats[venueId].totalProfit += tableProfit;
    venueStats[venueId].totalDuration += durationMin;
    if (cashOutBrl > 0) venueStats[venueId].winningTables += 1;

    if (!sessionsByVenue.has(venueId)) sessionsByVenue.set(venueId, new Set<number>());
    if (t.sessionId) sessionsByVenue.get(venueId)!.add(Number(t.sessionId));
  }

  // Calculate rates
  for (const [venueId, stats] of Object.entries(venueStats).map(([k, v]) => [Number(k), v] as const)) {
    stats.sessions = sessionsByVenue.get(venueId)?.size ?? 0;
    if (stats.tables > 0) {
      stats.winRate = Math.round((stats.winningTables / stats.tables) * 100);
      const totalHours = stats.totalDuration / 60;
      stats.avgHourlyRate = totalHours > 0 ? Math.round(stats.totalProfit / totalHours) : 0;
    }
  }
  
  return Object.values(venueStats).sort((a, b) => b.totalProfit - a.totalProfit);
}


// ============== INVITE QUERIES ==============

import { invites, Invite, InsertInvite } from "../drizzle/schema";
import { nanoid } from "nanoid";

export async function generateInviteCode(): Promise<string> {
  return nanoid(12);
}

export async function createInvite(inviterId: number, email?: string): Promise<Invite> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const code = await generateInviteCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
  
  const [result] = await db.insert(invites).values({
    inviterId,
    code,
    inviteeEmail: email || null,
    status: "pending",
    expiresAt,
  }).$returningId();
  
  const [invite] = await db.select().from(invites).where(eq(invites.id, result.id));
  return invite;
}

export async function getInviteByCode(code: string): Promise<Invite | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [invite] = await db.select().from(invites).where(eq(invites.code, code));
  return invite || null;
}

export async function acceptInvite(code: string, inviteeId: number): Promise<Invite | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const invite = await getInviteByCode(code);
  if (!invite || invite.status !== "pending") {
    return null;
  }
  
  // Check if expired
  if (invite.expiresAt && new Date() > invite.expiresAt) {
    await db.update(invites)
      .set({ status: "expired" })
      .where(eq(invites.id, invite.id));
    return null;
  }
  
  // Update invite
  await db.update(invites)
    .set({ 
      inviteeId, 
      status: "accepted", 
      acceptedAt: new Date() 
    })
    .where(eq(invites.id, invite.id));
  
  // Update inviter's invite count
  await db.update(users)
    .set({ 
      inviteCount: sql`${users.inviteCount} + 1` 
    })
    .where(eq(users.id, invite.inviterId));
  
  // Update invitee's invitedBy
  await db.update(users)
    .set({ invitedBy: invite.inviterId })
    .where(eq(users.id, inviteeId));
  
  const [updated] = await db.select().from(invites).where(eq(invites.id, invite.id));
  return updated;
}

export async function getUserInvites(userId: number): Promise<Invite[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(invites)
    .where(eq(invites.inviterId, userId))
    .orderBy(desc(invites.createdAt));
  
  return result;
}

export async function getInviteRanking(limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select({
    id: users.id,
    name: users.name,
    avatarUrl: users.avatarUrl,
    inviteCount: users.inviteCount,
  })
    .from(users)
    .where(gte(users.inviteCount, 1))
    .orderBy(desc(users.inviteCount))
    .limit(limit);
  
  return result;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [user] = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user || null;
}

const SUPPORTED_GAME_FORMATS = new Set([
  "cash_game",
  "tournament",
  "turbo",
  "hyper_turbo",
  "sit_and_go",
  "spin_and_go",
  "bounty",
  "satellite",
  "freeroll",
  "home_game",
]);

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function normalizeStringArray(values?: string[] | null): string[] {
  if (!values) return [];
  const uniq = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    uniq.add(normalized);
    if (uniq.size >= 20) break;
  }
  return Array.from(uniq);
}

function normalizeBuyInsToCents(values?: number[] | null): number[] {
  if (!values) return [];
  const uniq = new Set<number>();
  for (const value of values) {
    const cents = Math.round(Number(value));
    if (!Number.isFinite(cents) || cents <= 0) continue;
    uniq.add(cents);
    if (uniq.size >= 12) break;
  }
  return Array.from(uniq).sort((a, b) => a - b);
}

export type UserOnboardingProfileInput = {
  preferredPlayType: "online" | "live";
  preferredPlatforms?: string[];
  preferredFormats?: string[];
  preferredBuyIns?: number[];
  preferredBuyInsOnline?: number[];
  preferredBuyInsLive?: number[];
  playsMultiPlatform?: boolean;
  showInGlobalRanking?: boolean;
  showInFriendsRanking?: boolean;
};

export async function updateUserOnboardingProfile(
  userId: number,
  input: UserOnboardingProfileInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [current] = await db
    .select({
      showInGlobalRanking: users.showInGlobalRanking,
      showInFriendsRanking: users.showInFriendsRanking,
      rankingConsentAnsweredAt: users.rankingConsentAnsweredAt,
      playsMultiPlatform: users.playsMultiPlatform,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const preferredPlatforms = normalizeStringArray(input.preferredPlatforms);
  const preferredFormats = normalizeStringArray(input.preferredFormats);
  const preferredBuyIns = normalizeBuyInsToCents(input.preferredBuyIns);
  const preferredBuyInsOnline = normalizeBuyInsToCents(input.preferredBuyInsOnline);
  const preferredBuyInsLive = normalizeBuyInsToCents(input.preferredBuyInsLive);
  const showInGlobalRanking = input.showInGlobalRanking
    ?? (current?.showInGlobalRanking === 1);
  const showInFriendsRanking = input.showInFriendsRanking
    ?? (current?.showInFriendsRanking === 1);
  const rankingConsentTouched = input.showInGlobalRanking !== undefined || input.showInFriendsRanking !== undefined;

  const fallbackOnline = input.preferredPlayType === "online" ? preferredBuyIns : [];
  const fallbackLive = input.preferredPlayType === "live" ? preferredBuyIns : [];

  await db
    .update(users)
    .set({
      preferredPlayType: input.preferredPlayType,
      preferredPlatforms: JSON.stringify(preferredPlatforms),
      preferredFormats: JSON.stringify(preferredFormats),
      preferredBuyIns: JSON.stringify(preferredBuyIns),
      preferredBuyInsOnline: JSON.stringify(preferredBuyInsOnline.length > 0 ? preferredBuyInsOnline : fallbackOnline),
      preferredBuyInsLive: JSON.stringify(preferredBuyInsLive.length > 0 ? preferredBuyInsLive : fallbackLive),
      playsMultiPlatform: input.playsMultiPlatform === undefined
        ? (current?.playsMultiPlatform ?? 0)
        : (input.playsMultiPlatform ? 1 : 0),
      showInGlobalRanking: showInGlobalRanking ? 1 : 0,
      showInFriendsRanking: showInFriendsRanking ? 1 : 0,
      rankingConsentAnsweredAt: rankingConsentTouched
        ? new Date()
        : (current?.rankingConsentAnsweredAt ?? null),
      playStyleAnsweredAt: new Date(),
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const [user] = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function getUserOnboardingProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db
    .select({
      preferredPlayType: users.preferredPlayType,
      preferredPlatforms: users.preferredPlatforms,
      preferredFormats: users.preferredFormats,
      preferredBuyIns: users.preferredBuyIns,
      preferredBuyInsOnline: users.preferredBuyInsOnline,
      preferredBuyInsLive: users.preferredBuyInsLive,
      playsMultiPlatform: users.playsMultiPlatform,
      showInGlobalRanking: users.showInGlobalRanking,
      showInFriendsRanking: users.showInFriendsRanking,
      rankingConsentAnsweredAt: users.rankingConsentAnsweredAt,
      playStyleAnsweredAt: users.playStyleAnsweredAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  return {
    preferredPlayType: (user.preferredPlayType as "online" | "live" | null) ?? null,
    preferredPlatforms: parseJsonArray(user.preferredPlatforms),
    preferredFormats: parseJsonArray(user.preferredFormats),
    preferredBuyIns: parseJsonArray(user.preferredBuyIns)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
    preferredBuyInsOnline: parseJsonArray(user.preferredBuyInsOnline)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
    preferredBuyInsLive: parseJsonArray(user.preferredBuyInsLive)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
    playsMultiPlatform: user.playsMultiPlatform === 1,
    showInGlobalRanking: user.showInGlobalRanking === 1,
    showInFriendsRanking: user.showInFriendsRanking === 1,
    rankingConsentAnsweredAt: user.rankingConsentAnsweredAt,
    playStyleAnsweredAt: user.playStyleAnsweredAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export async function updateUserPreferredPlayType(
  userId: number,
  preferredPlayType: "online" | "live"
) {
  return updateUserOnboardingProfile(userId, {
    preferredPlayType,
  });
}

export async function updateUserAvatar(userId: number, avatarUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
    .set({ avatarUrl })
    .where(eq(users.id, userId));
}

export async function getUserInviteCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [user] = await db
    .select({ inviteCode: users.inviteCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (user?.inviteCode) {
    return user.inviteCode;
  }
  
  // Generate new invite code for user
  const code = nanoid(8);
  await db.update(users)
    .set({ inviteCode: code })
    .where(eq(users.id, userId));
  
  return code;
}

export async function getUserByInviteCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [user] = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.inviteCode, code))
    .limit(1);
  return user || null;
}

// ============= Fund Transactions =============

export async function createFundTransaction(
  userId: number,
  data: {
    transactionType: "deposit" | "withdrawal";
    bankrollType: "online" | "live";
    amount: number;
    currency?: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR";
    originalAmount?: number;
    exchangeRate?: number;
    description?: string;
    transactionDate: Date;
  }
): Promise<FundTransaction> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(fundTransactions).values({
    userId,
    transactionType: data.transactionType,
    bankrollType: data.bankrollType,
    amount: data.amount,
    currency: data.currency || "BRL",
    originalAmount: data.originalAmount || null,
    exchangeRate: data.exchangeRate || null,
    description: data.description || null,
    transactionDate: data.transactionDate,
  });
  
  const [transaction] = await db.select().from(fundTransactions)
    .where(eq(fundTransactions.id, (result[0] as any).insertId));
  
  return transaction;
}

export async function getUserFundTransactions(
  userId: number,
  bankrollType?: "online" | "live"
): Promise<FundTransaction[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions = [eq(fundTransactions.userId, userId)];
  if (bankrollType) {
    conditions.push(eq(fundTransactions.bankrollType, bankrollType));
  }
  
  const result = await db.select().from(fundTransactions)
    .where(and(...conditions))
    .orderBy(desc(fundTransactions.transactionDate));
  
  return result;
}

export async function deleteFundTransaction(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.delete(fundTransactions)
    .where(and(eq(fundTransactions.id, id), eq(fundTransactions.userId, userId)));
  
  return (result[0] as any).affectedRows > 0;
}

export async function getFundTransactionsTotals(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const transactions = await db.select().from(fundTransactions)
    .where(eq(fundTransactions.userId, userId));
  
  let onlineDeposits = 0;
  let onlineWithdrawals = 0;
  let liveDeposits = 0;
  let liveWithdrawals = 0;
  
  for (const t of transactions) {
    if (t.bankrollType === "online") {
      if (t.transactionType === "deposit") {
        onlineDeposits += t.amount;
      } else {
        onlineWithdrawals += t.amount;
      }
    } else {
      if (t.transactionType === "deposit") {
        liveDeposits += t.amount;
      } else {
        liveWithdrawals += t.amount;
      }
    }
  }
  
  return {
    online: {
      deposits: onlineDeposits,
      withdrawals: onlineWithdrawals,
      net: onlineDeposits - onlineWithdrawals,
    },
    live: {
      deposits: liveDeposits,
      withdrawals: liveWithdrawals,
      net: liveDeposits - liveWithdrawals,
    },
    total: {
      deposits: onlineDeposits + liveDeposits,
      withdrawals: onlineWithdrawals + liveWithdrawals,
      net: (onlineDeposits + liveDeposits) - (onlineWithdrawals + liveWithdrawals),
    },
  };
}

// ============================================================
// RANKING helpers
// ============================================================
import { posts, postLikes, postComments, postReactions, friendships, friendRequests, Post, PostComment } from "../drizzle/schema";
import { count } from "drizzle-orm";

export async function getLeaderboard(currentUserId: number, friendsOnly: boolean = false) {
  const db = await getDb();
  if (!db) return [];

  let userIds: number[] = [];
  if (friendsOnly) {
    const friends = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, currentUserId));
    userIds = friends.map((f) => f.friendId);
    userIds.push(currentUserId);
    if (userIds.length === 0) return [];
  }

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      showInGlobalRanking: users.showInGlobalRanking,
      showInFriendsRanking: users.showInFriendsRanking,
      rankingConsentAnsweredAt: users.rankingConsentAnsweredAt,
    })
    .from(users);

  const targetUsers = allUsers.filter((user) => {
    if (friendsOnly) {
      return userIds.includes(user.id) && user.showInFriendsRanking === 1 && user.rankingConsentAnsweredAt !== null;
    }
    return user.showInGlobalRanking === 1 && user.rankingConsentAnsweredAt !== null;
  });

  const results = await Promise.all(
    targetUsers.map(async (user) => {
      const stats = await getSessionStats(user.id);
      const totalBuyIn = stats.totalBuyIn ?? 0;
      const totalProfit = stats.totalProfit ?? 0;
      const bestSessionProfit = stats.bestSession ? (stats.bestSession.cashOut - stats.bestSession.buyIn) : 0;
      const worstSessionProfit = stats.worstSession ? (stats.worstSession.cashOut - stats.worstSession.buyIn) : 0;
      const roi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;
      return {
        userId: user.id,
        name: user.name ?? "Jogador",
        avatarUrl: user.avatarUrl,
        roi,
        winRate: stats.winRate ?? 0,
        trophyCount: stats.trophyCount ?? 0,
        wonTournaments: stats.trophyCount ?? 0,
        bestSession: bestSessionProfit,
        worstSession: worstSessionProfit,
        totalSessions: stats.totalSessions ?? 0,
        totalTables: stats.totalTables ?? 0,
      };
    })
  );

  return results.sort((a, b) => b.roi - a.roi);
}

export async function getFriendIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const friends = await db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(eq(friendships.userId, userId));
  return friends.map((f) => f.friendId);
}

export async function addFriendship(userId: number, friendId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(friendships).ignore().values({ userId, friendId });
  await db.insert(friendships).ignore().values({ userId: friendId, friendId: userId });
}

export async function removeFriendship(userId: number, friendId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
        and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
      )
    );

  return ((result as any)[0]?.affectedRows ?? 0) > 0;
}

async function getBlockedRelationshipIds(userId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set<number>();

  const blockedByMe = await db
    .select({ blockedUserId: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.userId, userId));

  const blockedMe = await db
    .select({ blockerId: userBlocks.userId })
    .from(userBlocks)
    .where(eq(userBlocks.blockedUserId, userId));

  return new Set<number>([
    ...blockedByMe.map((row) => row.blockedUserId),
    ...blockedMe.map((row) => row.blockerId),
  ]);
}

async function hasBlockedRelationship(userId: number, targetUserId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const found = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.userId, userId), eq(userBlocks.blockedUserId, targetUserId)),
        and(eq(userBlocks.userId, targetUserId), eq(userBlocks.blockedUserId, userId))
      )
    )
    .limit(1);

  return found.length > 0;
}

export async function blockUser(userId: number, targetUserId: number): Promise<{ success: true; blocked: true }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (userId === targetUserId) {
    throw new Error("Você não pode bloquear a si mesmo.");
  }

  await db.insert(userBlocks).ignore().values({ userId, blockedUserId: targetUserId });

  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, userId), eq(friendships.friendId, targetUserId)),
        and(eq(friendships.userId, targetUserId), eq(friendships.friendId, userId))
      )
    );

  await db
    .update(friendRequests)
    .set({ status: "canceled", respondedAt: new Date() })
    .where(
      and(
        eq(friendRequests.status, "pending"),
        or(
          and(eq(friendRequests.requesterId, userId), eq(friendRequests.receiverId, targetUserId)),
          and(eq(friendRequests.requesterId, targetUserId), eq(friendRequests.receiverId, userId))
        )
      )
    );

  return { success: true, blocked: true } as const;
}

export async function resetFriendshipNetworkForUser(userId: number): Promise<{
  success: true;
  removedFriendships: number;
  removedRequests: number;
  removedBlocks: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const deletedFriendships = await db
    .delete(friendships)
    .where(or(eq(friendships.userId, userId), eq(friendships.friendId, userId)));

  const deletedRequests = await db
    .delete(friendRequests)
    .where(or(eq(friendRequests.requesterId, userId), eq(friendRequests.receiverId, userId)));

  const deletedBlocks = await db
    .delete(userBlocks)
    .where(or(eq(userBlocks.userId, userId), eq(userBlocks.blockedUserId, userId)));

  return {
    success: true,
    removedFriendships: Number((deletedFriendships as any)[0]?.affectedRows ?? 0),
    removedRequests: Number((deletedRequests as any)[0]?.affectedRows ?? 0),
    removedBlocks: Number((deletedBlocks as any)[0]?.affectedRows ?? 0),
  } as const;
}

export async function resetFriendshipNetworkGlobally(): Promise<{
  success: true;
  removedFriendships: number;
  removedRequests: number;
  removedBlocks: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const deletedFriendships = await db.delete(friendships);
  const deletedRequests = await db.delete(friendRequests);
  const deletedBlocks = await db.delete(userBlocks);

  return {
    success: true,
    removedFriendships: Number((deletedFriendships as any)[0]?.affectedRows ?? 0),
    removedRequests: Number((deletedRequests as any)[0]?.affectedRows ?? 0),
    removedBlocks: Number((deletedBlocks as any)[0]?.affectedRows ?? 0),
  } as const;
}

async function hasFriendship(userId: number, friendId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const existing = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
        and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
      )
    )
    .limit(1);

  return existing.length > 0;
}

export async function sendFriendRequest(requesterId: number, receiverId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (requesterId === receiverId) {
    throw new Error("Você não pode enviar pedido para si mesmo.");
  }

  const hasBlocked = await hasBlockedRelationship(requesterId, receiverId);
  if (hasBlocked) {
    throw new Error("Não é possível enviar pedido para este usuário.");
  }

  const alreadyFriends = await hasFriendship(requesterId, receiverId);
  if (alreadyFriends) {
    throw new Error("Vocês já são amigos.");
  }

  const reversePending = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.requesterId, receiverId),
        eq(friendRequests.receiverId, requesterId),
        eq(friendRequests.status, "pending")
      )
    )
    .limit(1);

  if (reversePending.length > 0) {
    throw new Error("Este usuário já te enviou um pedido. Abra Pedidos recebidos para aceitar.");
  }

  const existingPending = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.requesterId, requesterId),
        eq(friendRequests.receiverId, receiverId),
        eq(friendRequests.status, "pending")
      )
    )
    .limit(1);

  if (existingPending.length > 0) {
    return { status: "pending", requestId: existingPending[0].id } as const;
  }

  const [inserted] = await db.insert(friendRequests).values({
    requesterId,
    receiverId,
    status: "pending",
  });

  return { status: "pending", requestId: (inserted as any).insertId as number } as const;
}

export async function sendFriendRequestByNickname(requesterId: number, nickname: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedNickname = nickname.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalizedNickname) {
    throw new Error("Nickname inválido.");
  }

  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.name})) = ${normalizedNickname}`)
    .limit(1);

  if (target.length === 0) {
    throw new Error("Nickname não encontrado.");
  }

  return await sendFriendRequest(requesterId, target[0].id);
}

export async function getIncomingFriendRequests(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const blockedIds = await getBlockedRelationshipIds(userId);

  const rows = await db
    .select({
      id: friendRequests.id,
      createdAt: friendRequests.createdAt,
      requester: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(friendRequests)
    .innerJoin(users, eq(friendRequests.requesterId, users.id))
    .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));

  return rows.filter((row) => !blockedIds.has(row.requester.id));
}

export async function getOutgoingFriendRequests(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const blockedIds = await getBlockedRelationshipIds(userId);

  const rows = await db
    .select({
      id: friendRequests.id,
      receiverId: friendRequests.receiverId,
      createdAt: friendRequests.createdAt,
      receiver: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(friendRequests)
    .innerJoin(users, eq(friendRequests.receiverId, users.id))
    .where(and(eq(friendRequests.requesterId, userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));

  return rows.filter((row) => !blockedIds.has(row.receiver.id));
}

export async function respondToFriendRequest(userId: number, requestId: number, action: "accept" | "reject") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const request = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending")))
    .limit(1);

  if (request.length === 0) {
    throw new Error("Pedido não encontrado ou já respondido.");
  }

  const nextStatus = action === "accept" ? "accepted" : "rejected";
  await db
    .update(friendRequests)
    .set({ status: nextStatus, respondedAt: new Date() })
    .where(eq(friendRequests.id, requestId));

  if (action === "accept") {
    await addFriendship(request[0].requesterId, request[0].receiverId);
  }

  return { success: true, status: nextStatus } as const;
}

export async function cancelFriendRequest(userId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(friendRequests)
    .set({ status: "canceled", respondedAt: new Date() })
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.requesterId, userId), eq(friendRequests.status, "pending")));

  return ((result as any)[0]?.affectedRows ?? 0) > 0;
}

export async function getFriends(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const friendIds = await getFriendIds(userId);
  const blockedIds = await getBlockedRelationshipIds(userId);
  const visibleFriendIds = friendIds.filter((id) => !blockedIds.has(id));
  if (visibleFriendIds.length === 0) return [];

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, visibleFriendIds));
}

export async function searchUsersToAdd(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const friendIds = await getFriendIds(userId);
  const pending = await db
    .select({ requesterId: friendRequests.requesterId, receiverId: friendRequests.receiverId })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.status, "pending"),
        or(eq(friendRequests.requesterId, userId), eq(friendRequests.receiverId, userId))
      )
    );

  const excludedIds = new Set([userId, ...friendIds]);
  const blockedIds = await getBlockedRelationshipIds(userId);
  Array.from(blockedIds).forEach((blockedId) => excludedIds.add(blockedId));
  for (const request of pending) {
    excludedIds.add(request.requesterId);
    excludedIds.add(request.receiverId);
  }

  const matches = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      inviteCode: users.inviteCode,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        or(
          like(users.name, `%${normalizedQuery}%`),
          like(users.email, `%${normalizedQuery}%`),
          like(users.inviteCode, `%${normalizedQuery.toUpperCase()}%`)
        )
      )
    )
    .orderBy(
      sql`CASE
        WHEN LOWER(${users.name}) = LOWER(${normalizedQuery}) THEN 0
        WHEN LOWER(${users.name}) LIKE LOWER(${`${normalizedQuery}%`}) THEN 1
        WHEN LOWER(${users.email}) LIKE LOWER(${`${normalizedQuery}%`}) THEN 2
        ELSE 3
      END`,
      users.name
    )
    .limit(12);

  return matches.filter((user) => !excludedIds.has(user.id));
}

// ============================================================
// POSTS helpers
// ============================================================

export async function createPost(data: {
  userId: number;
  content: string;
  imageUrl?: string;
  imageKey?: string;
  sessionId?: number;
  visibility: "public" | "friends";
}): Promise<Post> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [inserted] = await db.insert(posts).values(data).$returningId();
  const post = await db.select().from(posts).where(eq(posts.id, inserted.id)).limit(1);
  return post[0];
}

export async function getPublicFeed(currentUserId: number, limit: number = 30, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  const friendIds = await getFriendIds(currentUserId);
  const allAllowedIds = [...friendIds, currentUserId];

  const allPosts = await db
    .select({
      post: posts,
      author: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .where(
      sql`(${posts.visibility} = 'public' OR (${posts.visibility} = 'friends' AND ${posts.userId} IN (${sql.raw(allAllowedIds.join(','))})))`
    )
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  const postIds = allPosts.map((item) => item.post.id);

  let reactionRows: Array<{ postId: number; emoji: string; userId: number }> = [];
  if (postIds.length > 0) {
    try {
      reactionRows = await db
        .select({ postId: postReactions.postId, emoji: postReactions.emoji, userId: postReactions.userId })
        .from(postReactions)
        .where(inArray(postReactions.postId, postIds));
    } catch (err: any) {
      // During rollout, table may not exist yet. Keep feed working without reactions.
      if (err?.errno !== 1146 && err?.code !== "ER_NO_SUCH_TABLE") {
        throw err;
      }
    }
  }

  const reactionSummaryByPost = new Map<number, Array<{ emoji: string; count: number }>>();
  const myReactionByPost = new Map<number, string | null>();

  const reactionAccumulator = new Map<number, Map<string, number>>();
  for (const row of reactionRows) {
    if (!reactionAccumulator.has(row.postId)) {
      reactionAccumulator.set(row.postId, new Map<string, number>());
    }
    const byEmoji = reactionAccumulator.get(row.postId)!;
    byEmoji.set(row.emoji, (byEmoji.get(row.emoji) ?? 0) + 1);

    if (row.userId === currentUserId) {
      myReactionByPost.set(row.postId, row.emoji);
    }
  }

  Array.from(reactionAccumulator.entries()).forEach(([postId, byEmoji]) => {
    const summary = Array.from(byEmoji.entries())
      .map(([emoji, count]) => ({ emoji, count: Number(count) }))
      .sort((a, b) => b.count - a.count);
    reactionSummaryByPost.set(postId, summary);
  });

  const enriched = await Promise.all(
    allPosts.map(async (p) => {
      const [likeRow] = await db
        .select({ cnt: count() })
        .from(postLikes)
        .where(eq(postLikes.postId, p.post.id));
      const [commentRow] = await db
        .select({ cnt: count() })
        .from(postComments)
        .where(eq(postComments.postId, p.post.id));
      const myLike = await db
        .select()
        .from(postLikes)
        .where(and(eq(postLikes.postId, p.post.id), eq(postLikes.userId, currentUserId)))
        .limit(1);
      return {
        ...p.post,
        author: p.author,
        likeCount: likeRow?.cnt ?? 0,
        commentCount: commentRow?.cnt ?? 0,
        likedByMe: myLike.length > 0,
        reactionSummary: reactionSummaryByPost.get(p.post.id) ?? [],
        myReaction: myReactionByPost.get(p.post.id) ?? null,
      };
    })
  );

  return enriched;
}

export async function deletePost(postId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [result] = await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  return (result as any).affectedRows > 0;
}

export async function toggleLike(postId: number, userId: number): Promise<{ liked: boolean }> {
  const db = await getDb();
  if (!db) return { liked: false };
  const existing = await db
    .select()
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .limit(1);
  if (existing.length > 0) {
    await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    return { liked: false };
  } else {
    await db.insert(postLikes).values({ postId, userId });
    return { liked: true };
  }
}

const ALLOWED_POST_REACTIONS = ["🔥", "👏", "😂", "😮", "😢", "🎯"] as const;
type AllowedPostReaction = (typeof ALLOWED_POST_REACTIONS)[number];

export async function togglePostReaction(postId: number, userId: number, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (!ALLOWED_POST_REACTIONS.includes(emoji as AllowedPostReaction)) {
    throw new Error("Reação inválida.");
  }

  const existing = await db
    .select({ id: postReactions.id, emoji: postReactions.emoji })
    .from(postReactions)
    .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].emoji === emoji) {
      await db.delete(postReactions)
        .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)));
      return { reaction: null as string | null };
    }

    await db.update(postReactions)
      .set({ emoji, updatedAt: new Date() })
      .where(eq(postReactions.id, existing[0].id));
    return { reaction: emoji };
  }

  await db.insert(postReactions).values({ postId, userId, emoji });
  return { reaction: emoji };
}

export async function getPostComments(postId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      comment: postComments,
      author: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(postComments)
    .innerJoin(users, eq(postComments.userId, users.id))
    .where(eq(postComments.postId, postId))
    .orderBy(postComments.createdAt);
}

export async function createComment(data: { postId: number; userId: number; content: string }): Promise<PostComment> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(postComments).values(data);
  const comment = await db.select().from(postComments).where(eq(postComments.id, (result as any).insertId)).limit(1);
  return comment[0];
}

export async function deleteComment(commentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [result] = await db.delete(postComments).where(and(eq(postComments.id, commentId), eq(postComments.userId, userId)));
  return (result as any).affectedRows > 0;
}

// ============== CLUBS QUERIES ==============
import { clubs, Club, InsertClub } from "../drizzle/schema";

export async function getUserClubs(userId: number): Promise<Club[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(clubs).where(eq(clubs.userId, userId));
}

export async function createClub(data: InsertClub): Promise<Club> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(clubs).values(data);
  const inserted = await db.select().from(clubs).where(eq(clubs.id, (result as any).insertId));
  return inserted[0];
}

export async function updateClub(id: number, userId: number, data: Partial<InsertClub>): Promise<Club | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clubs).set({ ...data, updatedAt: new Date() }).where(eq(clubs.id, id));
  const updated = await db.select().from(clubs).where(eq(clubs.id, id));
  if (!updated[0] || updated[0].userId !== userId) return null;
  return updated[0];
}

export async function deleteClub(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(clubs).where(eq(clubs.id, id));
  if (!existing[0] || existing[0].userId !== userId) return false;
  await db.delete(clubs).where(eq(clubs.id, id));
  return true;
}

export async function getClubsWithStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userClubs = await db.select().from(clubs).where(eq(clubs.userId, userId));
  const allSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));
  const allVenues = await db.select().from(venues).where(eq(venues.userId, userId));

  // Map venues by name (lowercase) to clubs by name (lowercase) for matching
  return userClubs.map((club) => {
    // Find sessions linked to venues matching this club name
    const matchingVenues = allVenues.filter(
      (v) => v.name.toLowerCase() === club.name.toLowerCase()
    );
    const venueIds = new Set(matchingVenues.map((v) => v.id));
    const clubSessions = allSessions.filter(
      (s) => s.venueId && venueIds.has(s.venueId)
    );

    const totalProfit = clubSessions.reduce(
      (sum, s) => sum + (s.cashOut - s.buyIn),
      0
    );
    const sessionCount = clubSessions.length;

    // Build mini chart: last 10 sessions cumulative profit
    let cumulative = 0;
    const chartPoints = clubSessions.slice(-10).map((s) => {
      cumulative += s.cashOut - s.buyIn;
      return { value: cumulative / 100 };
    });

    return {
      id: club.id,
      name: club.name,
      logoUrl: club.logoUrl,
      type: club.type,
      allocatedAmount: club.allocatedAmount,
      totalProfit,
      sessionCount,
      trend: totalProfit >= 0 ? "up" : "down",
      chartPoints,
    };
  }).sort((a, b) => b.allocatedAmount - a.allocatedAmount);
}

// ─── Venue Balance History ───────────────────────────────────────────────────

/**
 * Records a balance change for a venue.
 * Always call this alongside any update to venues.balance.
 */
export async function recordVenueBalanceChange(data: {
  userId: number;
  venueId: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR";
  changeType: "manual" | "session" | "initial";
  sessionId?: number;
  note?: string;
  changedAt?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(venueBalanceHistory).values({
    userId: data.userId,
    venueId: data.venueId,
    balanceBefore: data.balanceBefore,
    balanceAfter: data.balanceAfter,
    delta: data.balanceAfter - data.balanceBefore,
    currency: data.currency,
    changeType: data.changeType,
    sessionId: data.sessionId ?? null,
    note: data.note ?? null,
    changedAt: data.changedAt ?? new Date(),
  });
}

/**
 * Returns the full balance history for a venue, newest first.
 */
export async function getVenueBalanceHistory(
  venueId: number,
  userId: number,
  limit = 50
): Promise<VenueBalanceHistory[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(venueBalanceHistory)
    .where(
      and(
        eq(venueBalanceHistory.venueId, venueId),
        eq(venueBalanceHistory.userId, userId)
      )
    )
    .orderBy(desc(venueBalanceHistory.changedAt))
    .limit(limit);
}

/**
 * Updates a venue's balance and records the change in history.
 * This is the single entry point for all balance mutations.
 */
export async function updateVenueBalance(
  venueId: number,
  userId: number,
  newBalance: number,
  currency: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR",
  changeType: "manual" | "session" | "initial",
  opts?: { sessionId?: number; note?: string; changedAt?: Date }
): Promise<Venue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current balance before updating
  const [current] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.userId, userId)));

  if (!current) return null;

  const balanceBefore = current.balance;

  // Update the venue balance and currency
  await db
    .update(venues)
    .set({ balance: newBalance, currency, updatedAt: new Date() })
    .where(and(eq(venues.id, venueId), eq(venues.userId, userId)));

  // Record the change in history
  await recordVenueBalanceChange({
    userId,
    venueId,
    balanceBefore,
    balanceAfter: newBalance,
    currency,
    changeType,
    sessionId: opts?.sessionId,
    note: opts?.note,
    changedAt: opts?.changedAt,
  });

  const [updated] = await db.select().from(venues).where(eq(venues.id, venueId));
  return updated ?? null;
}

// ─── User Preferences (Smart Suggestions) ────────────────────────────────────
/**
 * Analyzes the user's session history to extract personalized preferences.
 * Returns ordered lists of venues, game formats, buy-ins and session types
 * based on actual frequency of use — no fixed logic, purely data-driven.
 */
export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const buildRanking = <T extends string | number>(
    counts: Record<string, number>,
    mapValue: (key: string) => T,
    tieBreaker?: (a: T, b: T) => number,
  ) => {
    const entries = Object.entries(counts).filter(([, count]) => count > 0);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    return entries
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        if (!tieBreaker) return 0;
        return tieBreaker(mapValue(a[0]), mapValue(b[0]));
      })
      .map(([key, count]) => ({
        value: mapValue(key),
        count,
        share: total > 0 ? Number((count / total).toFixed(4)) : 0,
      }));
  };

  const buildSeededRanking = <T extends string | number>(values: T[]) => {
    if (values.length === 0) return [] as Array<{ value: T; count: number; share: number }>;
    const total = values.length;
    return values.map((value, index) => ({
      value,
      count: total - index,
      share: Number((1 / total).toFixed(4)),
    }));
  };

  const [userProfile] = await db
    .select({
      preferredPlayType: users.preferredPlayType,
      preferredPlatforms: users.preferredPlatforms,
      preferredFormats: users.preferredFormats,
      preferredBuyIns: users.preferredBuyIns,
      preferredBuyInsOnline: users.preferredBuyInsOnline,
      preferredBuyInsLive: users.preferredBuyInsLive,
      playsMultiPlatform: users.playsMultiPlatform,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const onboardingType = (userProfile?.preferredPlayType as "online" | "live" | null | undefined) ?? null;
  const onboardingPlatforms = parseJsonArray(userProfile?.preferredPlatforms);
  const onboardingFormats = parseJsonArray(userProfile?.preferredFormats);
  const onboardingBuyIns = parseJsonArray(userProfile?.preferredBuyIns)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const onboardingBuyInsOnline = parseJsonArray(userProfile?.preferredBuyInsOnline)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const onboardingBuyInsLive = parseJsonArray(userProfile?.preferredBuyInsLive)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  const allUserVenues = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.userId, userId));

  const lowerVenueNameToId = new Map(allUserVenues.map((v) => [v.name.trim().toLowerCase(), v.id]));
  const onboardingVenueIds = onboardingPlatforms
    .map((name) => lowerVenueNameToId.get(name.trim().toLowerCase()))
    .filter((id): id is number => typeof id === "number");

  // Use individual played tables as source of truth for preferences.
  const recentTables = await db
    .select({
      sessionId: sessionTables.sessionId,
      startedAt: sessionTables.startedAt,
      type: sessionTables.type,
      gameFormat: sessionTables.gameFormat,
      buyIn: sessionTables.buyIn,
      venueId: sessionTables.venueId,
      gameType: sessionTables.gameType,
        initialBuyIn: sessionTables.initialBuyIn,
      currency: sessionTables.currency,
    })
    .from(sessionTables)
    .where(and(eq(sessionTables.userId, userId), sql`${sessionTables.sessionId} IS NOT NULL`))
    .orderBy(desc(sessionTables.startedAt))
    .limit(200);

  // ABI baselines from the last up to 100 tables per type.
  const onlineAbiTables = recentTables.filter((t) => t.type === "online").slice(0, 100);
  const liveAbiTables = recentTables.filter((t) => t.type === "live").slice(0, 100);
  const rates = await getAllRates().catch(() => null);
  const toBrlFromTableCurrency = (amount: number, currency?: string | null): number => {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (currency === "USD") return Math.round(amount * (rates?.USD?.rate ?? 5.75));
    if (currency === "CAD") return Math.round(amount * (rates?.CAD?.rate ?? 4.20));
    if (currency === "JPY") return Math.round(amount * (rates?.JPY?.rate ?? 0.033));
    if (currency === "CNY") return Math.round(amount * (rates?.CNY?.rate ?? 0.80));
    return Math.round(amount);
  };
  const abiOnlineAvgBuyIn = onlineAbiTables.length > 0
    ? Math.round(onlineAbiTables.reduce((sum, t) => sum + (t.initialBuyIn ?? t.buyIn ?? 0), 0) / onlineAbiTables.length)
    : 0;
  const abiLiveAvgBuyIn = liveAbiTables.length > 0
    ? Math.round(liveAbiTables.reduce((sum, t) => sum + (t.initialBuyIn ?? t.buyIn ?? 0), 0) / liveAbiTables.length)
    : 0;
  const abiOnlineAvgBuyInBrl = onlineAbiTables.length > 0
    ? Math.round(onlineAbiTables.reduce((sum, t) => sum + toBrlFromTableCurrency((t.initialBuyIn ?? t.buyIn ?? 0), t.currency), 0) / onlineAbiTables.length)
    : 0;
  const abiLiveAvgBuyInBrl = liveAbiTables.length > 0
    ? Math.round(liveAbiTables.reduce((sum, t) => sum + toBrlFromTableCurrency((t.initialBuyIn ?? t.buyIn ?? 0), t.currency), 0) / liveAbiTables.length)
    : 0;
  const abiOnlineSampleSize = onlineAbiTables.length;
  const abiLiveSampleSize = liveAbiTables.length;

  if (recentTables.length === 0) {
    const preferredType = onboardingType ?? "online";
    const seededFormats = onboardingFormats.filter((f) => SUPPORTED_GAME_FORMATS.has(f));
    const seededBuyInsBase = preferredType === "live"
      ? (onboardingBuyInsLive.length > 0 ? onboardingBuyInsLive : onboardingBuyIns)
      : (onboardingBuyInsOnline.length > 0 ? onboardingBuyInsOnline : onboardingBuyIns);
    const seededBuyIns = seededBuyInsBase.slice(0, 5);
    const typeRanking = buildSeededRanking([preferredType]);
    const gameFormatRanking = buildSeededRanking(seededFormats);
    const venueRanking = buildSeededRanking(onboardingVenueIds);
    const buyInRankingOnline = buildSeededRanking(onboardingBuyInsOnline.length > 0 ? onboardingBuyInsOnline : seededBuyIns.filter((value) => value > 0));
    const buyInRankingLive = buildSeededRanking(onboardingBuyInsLive);
    const buyInRanking = preferredType === "live"
      ? (buyInRankingLive.length > 0 ? buyInRankingLive : buildSeededRanking(seededBuyIns))
      : (buyInRankingOnline.length > 0 ? buyInRankingOnline : buildSeededRanking(seededBuyIns));
    return {
      totalSessions: 0,
      totalTables: 0,
      preferredType,
      preferredGameFormats: seededFormats,
      preferredVenueIds: onboardingVenueIds,
      preferredBuyIns: seededBuyIns,
      preferredBuyInsOnline: buyInRankingOnline.map((entry) => entry.value).slice(0, 8),
      preferredBuyInsLive: buyInRankingLive.map((entry) => entry.value).slice(0, 8),
      preferredGameTypes: [],
      preferredCurrency: preferredType === "online" ? "USD" : "BRL",
      typeRanking,
      gameFormatRanking,
      venueRanking,
      buyInRanking,
      buyInRankingOnline,
      buyInRankingLive,
      gameTypeRanking: [],
      currencyRanking: buildSeededRanking([preferredType === "online" ? "USD" : "BRL"]),
      recentCombos: [],
      isOnlinePlayer: preferredType === "online",
      onboardingPreferredType: onboardingType,
      onboardingPreferredPlatforms: onboardingPlatforms,
      onboardingPreferredFormats: onboardingFormats,
      onboardingPreferredBuyIns: onboardingBuyIns,
      onboardingPreferredBuyInsOnline: onboardingBuyInsOnline,
      onboardingPreferredBuyInsLive: onboardingBuyInsLive,
      onboardingPlaysMultiPlatform: userProfile?.playsMultiPlatform === 1,
      onboardingCompletedAt: userProfile?.onboardingCompletedAt ?? null,
      abiOnlineAvgBuyIn,
      abiLiveAvgBuyIn,
      abiOnlineAvgBuyInBrl,
      abiLiveAvgBuyInBrl,
      abiOnlineSampleSize,
      abiLiveSampleSize,
    };
  }

  // Count frequencies
  const typeCount: Record<string, number> = {};
  const gameFormatCount: Record<string, number> = {};
  const venueCount: Record<number, number> = {};
  const buyInCount: Record<number, number> = {};
  const buyInCountOnline: Record<number, number> = {};
  const buyInCountLive: Record<number, number> = {};
  const gameTypeCount: Record<string, number> = {};
  const currencyCount: Record<string, number> = {};

  for (const s of recentTables) {
    // Session type (online/live)
    typeCount[s.type] = (typeCount[s.type] || 0) + 1;
    // Game format
    if (s.gameFormat) gameFormatCount[s.gameFormat] = (gameFormatCount[s.gameFormat] || 0) + 1;
    // Venue
    if (s.venueId) venueCount[s.venueId] = (venueCount[s.venueId] || 0) + 1;
    // Buy-in (keep exact cents so recurrent stakes like $0.50 stay precise)
    if (s.buyIn > 0) {
      buyInCount[s.buyIn] = (buyInCount[s.buyIn] || 0) + 1;
      if (s.type === "online") {
        buyInCountOnline[s.buyIn] = (buyInCountOnline[s.buyIn] || 0) + 1;
      }
      if (s.type === "live") {
        buyInCountLive[s.buyIn] = (buyInCountLive[s.buyIn] || 0) + 1;
      }
    }
    // Game type (NL Hold'em, PLO, etc.)
    if (s.gameType) gameTypeCount[s.gameType] = (gameTypeCount[s.gameType] || 0) + 1;
    // Currency
    if (s.currency) currencyCount[s.currency] = (currencyCount[s.currency] || 0) + 1;
  }

  // Bootstrap early intelligence with onboarding answer when history is still small.
  if (onboardingType) {
    typeCount[onboardingType] = (typeCount[onboardingType] || 0) + 3;
  }
  for (const format of onboardingFormats) {
    if (SUPPORTED_GAME_FORMATS.has(format)) {
      gameFormatCount[format] = (gameFormatCount[format] || 0) + 3;
    }
  }
  for (const venueId of onboardingVenueIds) {
    venueCount[venueId] = (venueCount[venueId] || 0) + 3;
  }
  const boostedBuyIns = [
    ...onboardingBuyIns,
    ...onboardingBuyInsOnline,
    ...onboardingBuyInsLive,
  ];
  for (const buyIn of boostedBuyIns) {
    buyInCount[buyIn] = (buyInCount[buyIn] || 0) + 2;
  }
  for (const buyIn of onboardingBuyInsOnline) {
    buyInCountOnline[buyIn] = (buyInCountOnline[buyIn] || 0) + 2;
  }
  for (const buyIn of onboardingBuyInsLive) {
    buyInCountLive[buyIn] = (buyInCountLive[buyIn] || 0) + 2;
  }
  if (onboardingType === "online") {
    for (const buyIn of onboardingBuyIns) {
      buyInCountOnline[buyIn] = (buyInCountOnline[buyIn] || 0) + 1;
    }
  }
  if (onboardingType === "live") {
    for (const buyIn of onboardingBuyIns) {
      buyInCountLive[buyIn] = (buyInCountLive[buyIn] || 0) + 1;
    }
  }

  // Sort by frequency descending
  const typeRanking = buildRanking(typeCount, (key) => key, (a, b) => String(a).localeCompare(String(b)));
  const gameFormatRanking = buildRanking(gameFormatCount, (key) => key, (a, b) => String(a).localeCompare(String(b)));
  const venueRanking = buildRanking(venueCount as Record<string, number>, (key) => Number(key), (a, b) => Number(a) - Number(b));
  const buyInRanking = buildRanking(buyInCount as Record<string, number>, (key) => Number(key), (a, b) => Number(a) - Number(b));
  const buyInRankingOnline = buildRanking(buyInCountOnline as Record<string, number>, (key) => Number(key), (a, b) => Number(a) - Number(b));
  const buyInRankingLive = buildRanking(buyInCountLive as Record<string, number>, (key) => Number(key), (a, b) => Number(a) - Number(b));
  const gameTypeRanking = buildRanking(gameTypeCount, (key) => key, (a, b) => String(a).localeCompare(String(b)));
  const currencyRanking = buildRanking(currencyCount, (key) => key, (a, b) => String(a).localeCompare(String(b)));

  const preferredType = typeRanking.map((entry) => entry.value);
  const preferredGameFormats = gameFormatRanking.map((entry) => entry.value);
  const preferredVenueIds = venueRanking.map((entry) => entry.value);
  const preferredBuyInsAll = buyInRanking.map((entry) => entry.value);
  const preferredBuyInsOnline = buyInRankingOnline.map((entry) => entry.value);
  const preferredBuyInsLive = buyInRankingLive.map((entry) => entry.value);
  const preferredGameTypes = gameTypeRanking.map((entry) => entry.value);
  const preferredCurrency = currencyRanking.map((entry) => entry.value);

  const primaryType = (preferredType[0] as "online" | "live" | undefined) ?? "online";
  const preferredBuyIns = (primaryType === "live" ? preferredBuyInsLive : preferredBuyInsOnline).length > 0
    ? (primaryType === "live" ? preferredBuyInsLive : preferredBuyInsOnline)
    : preferredBuyInsAll;

  // Last 5 unique combinations used (for "quick repeat" suggestions)
  const seen = new Set<string>();
  const recentCombos: Array<{
    type: string;
    gameFormat: string;
    venueId: number | null;
    buyIn: number;
    gameType: string | null;
    currency: string | null;
  }> = [];
  for (const s of recentTables) {
    const key = `${s.type}|${s.gameFormat}|${s.venueId}|${s.buyIn}`;
    if (!seen.has(key)) {
      seen.add(key);
      recentCombos.push({
        type: s.type,
        gameFormat: s.gameFormat,
        venueId: s.venueId ?? null,
        buyIn: s.buyIn,
        gameType: s.gameType ?? null,
        currency: s.currency ?? null,
      });
      if (recentCombos.length >= 5) break;
    }
  }

  const uniqueSessionIds = new Set<number>();
  for (const t of recentTables) {
    if (t.sessionId) uniqueSessionIds.add(Number(t.sessionId));
  }

  return {
    totalSessions: uniqueSessionIds.size,
    totalTables: recentTables.length,
    preferredType: primaryType,
    preferredGameFormats,
    preferredVenueIds,
    preferredBuyIns: preferredBuyIns.slice(0, 8),
    preferredBuyInsOnline: preferredBuyInsOnline.slice(0, 8),
    preferredBuyInsLive: preferredBuyInsLive.slice(0, 8),
    preferredGameTypes,
    preferredCurrency: preferredCurrency[0] || "BRL",
    typeRanking,
    gameFormatRanking,
    venueRanking,
    buyInRanking,
    buyInRankingOnline,
    buyInRankingLive,
    gameTypeRanking,
    currencyRanking,
    recentCombos,
    isOnlinePlayer: (typeCount["online"] || 0) >= (typeCount["live"] || 0),
    onboardingPreferredType: onboardingType,
    onboardingPreferredPlatforms: onboardingPlatforms,
    onboardingPreferredFormats: onboardingFormats,
    onboardingPreferredBuyIns: onboardingBuyIns,
    onboardingPreferredBuyInsOnline: onboardingBuyInsOnline,
    onboardingPreferredBuyInsLive: onboardingBuyInsLive,
    onboardingPlaysMultiPlatform: userProfile?.playsMultiPlatform === 1,
    onboardingCompletedAt: userProfile?.onboardingCompletedAt ?? null,
    abiOnlineAvgBuyIn,
    abiLiveAvgBuyIn,
    abiOnlineAvgBuyInBrl,
    abiLiveAvgBuyInBrl,
    abiOnlineSampleSize,
    abiLiveSampleSize,
  };
}

// ─── Active Sessions & Session Tables ────────────────────────────────────────

/** Start a new active session for the user (one at a time). */
export async function startActiveSession(userId: number, notes?: string): Promise<ActiveSession | null> {
  const db = await getDb();
  if (!db) return null;
  // Upsert: if one already exists, return it
  const existing = await db.select().from(activeSessions).where(eq(activeSessions.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(activeSessions).values({ userId, notes: notes ?? null, startedAt: new Date() });
  const [created] = await db.select().from(activeSessions).where(eq(activeSessions.userId, userId)).limit(1);
  return created ?? null;
}

/** Get the current active session for the user (null if none). */
export async function getActiveSession(userId: number): Promise<ActiveSession | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(activeSessions).where(eq(activeSessions.userId, userId)).limit(1);
  return row ?? null;
}

/** Add a table to the active session. */
export async function addSessionTable(data: InsertSessionTable): Promise<SessionTable | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(sessionTables).values({ ...data, initialBuyIn: data.initialBuyIn ?? data.buyIn });
  const [row] = await db
    .select()
    .from(sessionTables)
    .where(and(eq(sessionTables.userId, data.userId), eq(sessionTables.activeSessionId, data.activeSessionId!)))
    .orderBy(desc(sessionTables.createdAt))
    .limit(1);
  return row ?? null;
}

/** Update a session table (e.g. set cashOut, endedAt). */
export async function updateSessionTable(
  id: number,
  userId: number,
  data: Partial<InsertSessionTable>
): Promise<SessionTable | null>;
export async function updateSessionTable(
  id: number,
  userId: number,
  data: Partial<InsertSessionTable>,
  incrementRebuy: boolean
): Promise<SessionTable | null>;
export async function updateSessionTable(
  id: number,
  userId: number,
  data: Partial<InsertSessionTable>,
  incrementRebuy?: boolean
): Promise<SessionTable | null> {
  const db = await getDb();
  if (!db) return null;

  const [current] = await db
    .select()
    .from(sessionTables)
    .where(and(eq(sessionTables.id, id), eq(sessionTables.userId, userId)))
    .limit(1);
  if (!current) return null;

  const isFinalizingTable = data.cashOut !== undefined || data.endedAt !== undefined;
  const resultingVenueId = data.venueId !== undefined ? data.venueId : current.venueId;
  if (isFinalizingTable && !resultingVenueId) {
    throw new Error("Defina a plataforma/local da mesa antes de finalizar.");
  }

  const updatePayload: any = { ...data, updatedAt: new Date() };
  if (incrementRebuy) {
    updatePayload.rebuyCount = (current.rebuyCount ?? 0) + 1;
  }
  await db.update(sessionTables).set(updatePayload).where(and(eq(sessionTables.id, id), eq(sessionTables.userId, userId)));
  const [row] = await db.select().from(sessionTables).where(eq(sessionTables.id, id)).limit(1);
  return row ?? null;
}

/** Remove a session table. */
export async function removeSessionTable(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(sessionTables).where(and(eq(sessionTables.id, id), eq(sessionTables.userId, userId)));
  return true;
}

/** Get all tables for an active session. */
export async function getActiveSessionTables(activeSessionId: number, userId: number): Promise<SessionTable[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessionTables)
    .where(and(eq(sessionTables.activeSessionId, activeSessionId), eq(sessionTables.userId, userId)))
    .orderBy(sessionTables.createdAt);
}

/** Get all tables for a finalized session. */
export async function getSessionTables(sessionId: number, userId: number): Promise<SessionTable[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessionTables)
    .where(and(eq(sessionTables.sessionId, sessionId), eq(sessionTables.userId, userId)))
    .orderBy(sessionTables.createdAt);
}

/**
 * Finalize the active session:
 * 1. Calculate total buyIn, cashOut, duration from tables
 * 2. Create a sessions record
 * 3. Link all sessionTables to the new session
 * 4. Delete the active session
 */
export async function finalizeActiveSession(
  userId: number,
  activeSessionId: number,
  notes?: string,
  exchangeRates?: { USD: number; CAD: number; JPY: number; CNY: number }
): Promise<Session | null> {
  const db = await getDb();
  if (!db) return null;

  const [active] = await db.select().from(activeSessions).where(and(eq(activeSessions.id, activeSessionId), eq(activeSessions.userId, userId))).limit(1);
  if (!active) return null;

  const tables = await getActiveSessionTables(activeSessionId, userId);
  if (tables.length === 0) {
    // No tables — just delete the active session
    await db.delete(activeSessions).where(eq(activeSessions.id, activeSessionId));
    return null;
  }

  const tablesWithoutVenue = tables.filter((t) => !t.venueId);
  if (tablesWithoutVenue.length > 0) {
    throw new Error("Não é possível finalizar sessão com mesas sem plataforma/local definido.");
  }

  const now = new Date();
  const startedAt = active.startedAt;
  const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

  // Close open tables automatically on finalize so metrics are fully calculated.
  for (const t of tables) {
    if (t.cashOut === null || t.cashOut === undefined || t.endedAt === null) {
      await db
        .update(sessionTables)
        .set({
          cashOut: t.cashOut ?? t.buyIn,
          endedAt: t.endedAt ?? now,
          updatedAt: now,
        })
        .where(eq(sessionTables.id, t.id));
    }
  }

  const normalizedTables = await getActiveSessionTables(activeSessionId, userId);

  // Convert all table values to BRL centavos for the aggregate session record
  const rates = exchangeRates ?? { USD: 575, CAD: 420, JPY: 3, CNY: 80 }; // fallback rates (per 100 units)
  function toCentsBrl(amount: number, currency: string): number {
    if (currency === "USD") return Math.round(amount * rates.USD / 100);
    if (currency === "CAD") return Math.round(amount * rates.CAD / 100);
    if (currency === "JPY") return Math.round(amount * rates.JPY / 100);
    if (currency === "CNY") return Math.round(amount * rates.CNY / 100);
    return amount;
  }

  let totalBuyIn = 0;
  let totalCashOut = 0;
  // Determine dominant type and gameFormat from tables
  const typeCount: Record<string, number> = {};
  const formatCount: Record<string, number> = {};
  let dominantVenueId: number | undefined;
  let bestFinalPosition: number | undefined;
  let maxFieldSize: number | undefined;
  const venueCounts: Record<number, number> = {};

  for (const t of normalizedTables) {
    totalBuyIn += toCentsBrl(t.buyIn, t.currency);
    totalCashOut += toCentsBrl(t.cashOut ?? 0, t.currency);
    typeCount[t.type] = (typeCount[t.type] || 0) + 1;
    formatCount[t.gameFormat] = (formatCount[t.gameFormat] || 0) + 1;
    if (t.venueId) venueCounts[t.venueId] = (venueCounts[t.venueId] || 0) + 1;
    if (typeof t.finalPosition === "number" && t.finalPosition > 0) {
      bestFinalPosition = bestFinalPosition === undefined ? t.finalPosition : Math.min(bestFinalPosition, t.finalPosition);
    }
    if (typeof (t as any).fieldSize === "number" && (t as any).fieldSize > 0) {
      maxFieldSize = maxFieldSize === undefined ? (t as any).fieldSize : Math.max(maxFieldSize, (t as any).fieldSize);
    }
  }

  const dominantType = (Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "online") as "online" | "live";
  const dominantFormat = (Object.entries(formatCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "tournament") as any;
  const venueEntries = Object.entries(venueCounts).sort((a, b) => b[1] - a[1]);
  if (venueEntries.length > 0) dominantVenueId = Number(venueEntries[0][0]);

  // Create the finalized session
  await db.insert(sessions).values({
    userId,
    type: dominantType,
    gameFormat: dominantFormat,
    currency: "BRL",
    buyIn: totalBuyIn,
    cashOut: totalCashOut,
    sessionDate: startedAt,
    durationMinutes,
    notes: notes ?? active.notes ?? undefined,
    venueId: dominantVenueId,
    tournamentName: normalizedTables.find((t) => t.tournamentName && t.tournamentName.trim())?.tournamentName ?? null,
    finalPosition: bestFinalPosition,
    fieldSize: maxFieldSize,
  });

  const [newSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(1);

  if (newSession) {
    // Link all tables to the finalized session
    await db
      .update(sessionTables)
      .set({ sessionId: newSession.id, activeSessionId: null, updatedAt: new Date() })
      .where(eq(sessionTables.activeSessionId, activeSessionId));
  }

  // Delete the active session
  await db.delete(activeSessions).where(eq(activeSessions.id, activeSessionId));

  return newSession ?? null;
}

/** Discard (cancel) an active session without saving. */
export async function discardActiveSession(userId: number, activeSessionId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Delete tables first
  await db.delete(sessionTables).where(eq(sessionTables.activeSessionId, activeSessionId));
  await db.delete(activeSessions).where(and(eq(activeSessions.id, activeSessionId), eq(activeSessions.userId, userId)));
  return true;
}

