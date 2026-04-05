import { and, desc, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, sessions, bankrollSettings, venues, InsertSession, Session, BankrollSettings, Venue, InsertVenue, fundTransactions, FundTransaction, InsertFundTransaction, venueBalanceHistory, VenueBalanceHistory, InsertVenueBalanceHistory, activeSessions, ActiveSession, InsertActiveSession, sessionTables, SessionTable, InsertSessionTable } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

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
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "avatarUrl", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
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

  await db.update(users)
    .set({
      openId,
      name: params.name ?? null,
      email: params.email ? params.email.trim().toLowerCase() : null,
      avatarUrl: params.avatarUrl ?? null,
      loginMethod: "google",
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));

  const [updated] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
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
  
  const result = await db.delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  
  return (result[0] as any).affectedRows > 0;
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
  
  return result as any;
}

export async function getSessionStats(userId: number, type?: "online" | "live", gameFormat?: GameFormat) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions = [eq(sessions.userId, userId)];
  if (type) {
    conditions.push(eq(sessions.type, type));
  }
  if (gameFormat) {
    conditions.push(eq(sessions.gameFormat, gameFormat));
  }
  
  const allSessions = await db.select().from(sessions).where(and(...conditions));
  
  if (allSessions.length === 0) {
    return {
      totalSessions: 0,
      totalBuyIn: 0,
      totalCashOut: 0,
      totalProfit: 0,
      totalDuration: 0,
      winningSessions: 0,
      losingSessions: 0,
      breakEvenSessions: 0,
      bestSession: null,
      worstSession: null,
      avgProfit: 0,
      winRate: 0,
      avgHourlyRate: 0,
    };
  }
  
  let totalBuyIn = 0;
  let totalCashOut = 0;
  let totalDuration = 0;
  let winningSessions = 0;
  let losingSessions = 0;
  let breakEvenSessions = 0;
  let bestProfit = -Infinity;
  let worstProfit = Infinity;
  let bestSession: Session | null = null;
  let worstSession: Session | null = null;
  
  for (const session of allSessions) {
    const profit = session.cashOut - session.buyIn;
    totalBuyIn += session.buyIn;
    totalCashOut += session.cashOut;
    totalDuration += session.durationMinutes;
    
    if (profit > 0) winningSessions++;
    else if (profit < 0) losingSessions++;
    else breakEvenSessions++;
    
    if (profit > bestProfit) {
      bestProfit = profit;
      bestSession = session;
    }
    if (profit < worstProfit) {
      worstProfit = profit;
      worstSession = session;
    }
  }
  
  const totalProfit = totalCashOut - totalBuyIn;
  const totalHours = totalDuration / 60;
  
  return {
    totalSessions: allSessions.length,
    totalBuyIn,
    totalCashOut,
    totalProfit,
    totalDuration,
    winningSessions,
    losingSessions,
    breakEvenSessions,
    bestSession,
    worstSession,
    avgProfit: Math.round(totalProfit / allSessions.length),
    winRate: Math.round((winningSessions / allSessions.length) * 100),
    avgHourlyRate: totalHours > 0 ? Math.round(totalProfit / totalHours) : 0,
  };
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
  
  const conditions = [eq(sessions.userId, userId)];
  if (type) {
    conditions.push(eq(sessions.type, type));
  }
  
  const allSessions = await db.select().from(sessions)
    .where(and(...conditions))
    .orderBy(sessions.sessionDate);
  
  return allSessions;
}

// ============== VENUE QUERIES ==============

export async function createVenue(data: InsertVenue): Promise<Venue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(venues).values(data).$returningId();
  const [venue] = await db.select().from(venues).where(eq(venues.id, result.id));
  return venue;
}

export async function updateVenue(id: number, userId: number, data: Partial<InsertVenue>): Promise<Venue | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(venues)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(venues.id, id), eq(venues.userId, userId)));
  
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
  
  // Get existing preset venues
  const existingPresets = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.isPreset, 1)));
  
  const existingNames = new Set(existingPresets.map(v => v.name));
  const presetNames = new Set(presets.map(p => p.name));

  // Update logos/websites for existing presets
  for (const preset of presets) {
    const existing = existingPresets.find(v => v.name === preset.name);
    if (existing) {
      // Update logo, website if changed (do not override user-set currency)
      await db.update(venues)
        .set({ logoUrl: preset.logoUrl, website: preset.website || null })
        .where(eq(venues.id, existing.id));
    } else {
      // Insert new preset with default currency
      await db.insert(venues).values({
        userId,
        name: preset.name,
        type: preset.type,
        logoUrl: preset.logoUrl,
        website: preset.website || null,
        isPreset: 1,
        currency: (preset.defaultCurrency as "BRL" | "USD" | "CAD" | "JPY") || "BRL",
      });
    }
  }

  // Remove old presets that are no longer in the list (no sessions attached)
  for (const existing of existingPresets) {
    if (!presetNames.has(existing.name)) {
      // Only delete if no sessions reference this venue
      const sessionCount = await db.select().from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.venueId, existing.id)));
      if (sessionCount.length === 0) {
        await db.delete(venues).where(eq(venues.id, existing.id));
      }
    }
  }
}

export async function getStatsByVenue(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const allSessions = await db.select().from(sessions)
    .where(eq(sessions.userId, userId));
  
  const allVenues = await db.select().from(venues)
    .where(eq(venues.userId, userId));
  
  const venueMap = new Map(allVenues.map(v => [v.id, v]));
  
  const venueStats: Record<number, {
    venueId: number;
    venueName: string;
    venueType: "online" | "live";
    logoUrl: string | null;
    sessions: number;
    totalProfit: number;
    winningSessions: number;
    winRate: number;
    totalDuration: number;
    avgHourlyRate: number;
  }> = {};
  
  for (const session of allSessions) {
    if (!session.venueId) continue;
    
    const venue = venueMap.get(session.venueId);
    if (!venue) continue;
    
    if (!venueStats[session.venueId]) {
      venueStats[session.venueId] = {
        venueId: venue.id,
        venueName: venue.name,
        venueType: venue.type,
        logoUrl: venue.logoUrl,
        sessions: 0,
        totalProfit: 0,
        winningSessions: 0,
        winRate: 0,
        totalDuration: 0,
        avgHourlyRate: 0,
      };
    }
    
    const profit = session.cashOut - session.buyIn;
    venueStats[session.venueId].sessions++;
    venueStats[session.venueId].totalProfit += profit;
    venueStats[session.venueId].totalDuration += session.durationMinutes;
    if (profit > 0) venueStats[session.venueId].winningSessions++;
  }
  
  // Calculate rates
  for (const stats of Object.values(venueStats)) {
    if (stats.sessions > 0) {
      stats.winRate = Math.round((stats.winningSessions / stats.sessions) * 100);
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
  
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
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
  
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  
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
  
  const [user] = await db.select().from(users).where(eq(users.inviteCode, code));
  return user || null;
}

// ============= Fund Transactions =============

export async function createFundTransaction(
  userId: number,
  data: {
    transactionType: "deposit" | "withdrawal";
    bankrollType: "online" | "live";
    amount: number;
    currency?: "BRL" | "USD";
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
import { posts, postLikes, postComments, friendships, Post, PostComment } from "../drizzle/schema";
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

  const allUsers = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users);
  const targetUsers = friendsOnly ? allUsers.filter((u) => userIds.includes(u.id)) : allUsers;

  const results = await Promise.all(
    targetUsers.map(async (user) => {
      const stats = await getSessionStats(user.id);
      const totalBuyIn = stats.totalBuyIn ?? 0;
      const totalProfit = stats.totalProfit ?? 0;
      const roi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;
      return {
        userId: user.id,
        name: user.name ?? "Jogador",
        avatarUrl: user.avatarUrl,
        totalProfit,
        roi,
        winRate: stats.winRate ?? 0,
        bestSession: stats.bestSession ?? 0,
        totalSessions: stats.totalSessions ?? 0,
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
  const [result] = await db.insert(posts).values(data);
  const post = await db.select().from(posts).where(eq(posts.id, (result as any).insertId)).limit(1);
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
  currency: "BRL" | "USD" | "CAD" | "JPY";
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
  currency: "BRL" | "USD" | "CAD" | "JPY",
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

  // Fetch last 200 sessions to build preference profile
  const recentSessions = await db
    .select({
      type: sessions.type,
      gameFormat: sessions.gameFormat,
      buyIn: sessions.buyIn,
      venueId: sessions.venueId,
      gameType: sessions.gameType,
      currency: sessions.currency,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.sessionDate))
    .limit(200);

  if (recentSessions.length === 0) return null;

  // Count frequencies
  const typeCount: Record<string, number> = {};
  const gameFormatCount: Record<string, number> = {};
  const venueCount: Record<number, number> = {};
  const buyInCount: Record<number, number> = {};
  const gameTypeCount: Record<string, number> = {};
  const currencyCount: Record<string, number> = {};

  for (const s of recentSessions) {
    // Session type (online/live)
    typeCount[s.type] = (typeCount[s.type] || 0) + 1;
    // Game format
    if (s.gameFormat) gameFormatCount[s.gameFormat] = (gameFormatCount[s.gameFormat] || 0) + 1;
    // Venue
    if (s.venueId) venueCount[s.venueId] = (venueCount[s.venueId] || 0) + 1;
    // Buy-in (rounded to nearest common value)
    if (s.buyIn > 0) {
      const rounded = Math.round(s.buyIn / 500) * 500; // round to nearest R$5
      buyInCount[rounded] = (buyInCount[rounded] || 0) + 1;
    }
    // Game type (NL Hold'em, PLO, etc.)
    if (s.gameType) gameTypeCount[s.gameType] = (gameTypeCount[s.gameType] || 0) + 1;
    // Currency
    if (s.currency) currencyCount[s.currency] = (currencyCount[s.currency] || 0) + 1;
  }

  // Sort by frequency descending
  const preferredType = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const preferredGameFormats = Object.entries(gameFormatCount).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const preferredVenueIds = Object.entries(venueCount).sort((a, b) => b[1] - a[1]).map(([k]) => Number(k));
  const preferredBuyIns = Object.entries(buyInCount).sort((a, b) => b[1] - a[1]).map(([k]) => Number(k));
  const preferredGameTypes = Object.entries(gameTypeCount).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const preferredCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1]).map(([k]) => k);

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
  for (const s of recentSessions) {
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

  return {
    totalSessions: recentSessions.length,
    preferredType: preferredType[0] || "online",
    preferredGameFormats,
    preferredVenueIds,
    preferredBuyIns: preferredBuyIns.slice(0, 5),
    preferredGameTypes,
    preferredCurrency: preferredCurrency[0] || "BRL",
    recentCombos,
    isOnlinePlayer: (typeCount["online"] || 0) >= (typeCount["live"] || 0),
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
  await db.insert(sessionTables).values(data);
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
): Promise<SessionTable | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(sessionTables).set({ ...data, updatedAt: new Date() }).where(and(eq(sessionTables.id, id), eq(sessionTables.userId, userId)));
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
  exchangeRates?: { USD: number; CAD: number; JPY: number }
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

  const now = new Date();
  const startedAt = active.startedAt;
  const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

  // Convert all table values to BRL centavos for the aggregate session record
  const rates = exchangeRates ?? { USD: 575, CAD: 420, JPY: 3 }; // fallback rates (per 100 units)
  function toCentsBrl(amount: number, currency: string): number {
    if (currency === "USD") return Math.round(amount * rates.USD / 100);
    if (currency === "CAD") return Math.round(amount * rates.CAD / 100);
    if (currency === "JPY") return Math.round(amount * rates.JPY / 100);
    return amount;
  }

  let totalBuyIn = 0;
  let totalCashOut = 0;
  // Determine dominant type and gameFormat from tables
  const typeCount: Record<string, number> = {};
  const formatCount: Record<string, number> = {};
  let dominantVenueId: number | undefined;
  const venueCounts: Record<number, number> = {};

  for (const t of tables) {
    totalBuyIn += toCentsBrl(t.buyIn, t.currency);
    totalCashOut += toCentsBrl(t.cashOut ?? 0, t.currency);
    typeCount[t.type] = (typeCount[t.type] || 0) + 1;
    formatCount[t.gameFormat] = (formatCount[t.gameFormat] || 0) + 1;
    if (t.venueId) venueCounts[t.venueId] = (venueCounts[t.venueId] || 0) + 1;
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
