import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, sessions, bankrollSettings, venues, InsertSession, Session, BankrollSettings, Venue, InsertVenue, fundTransactions, FundTransaction, InsertFundTransaction } from "../drizzle/schema";
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

    const textFields = ["name", "email", "loginMethod"] as const;
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
): Promise<Session[]> {
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
  
  const result = await db.select().from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.sessionDate));
  
  return result;
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

export async function initializePresetVenues(userId: number, presets: Array<{ name: string; type: "online" | "live"; logoUrl: string; website?: string }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if user already has preset venues
  const existingPresets = await db.select().from(venues)
    .where(and(eq(venues.userId, userId), eq(venues.isPreset, 1)));
  
  if (existingPresets.length > 0) {
    return; // Already initialized
  }
  
  // Insert preset venues for this user
  for (const preset of presets) {
    await db.insert(venues).values({
      userId,
      name: preset.name,
      type: preset.type,
      logoUrl: preset.logoUrl,
      website: preset.website || null,
      isPreset: 1,
    });
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
