import { int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  avatarUrl: mediumtext("avatarUrl"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Invite system
  inviteCode: varchar("inviteCode", { length: 32 }).unique(),
  invitedBy: int("invitedBy"),
  inviteCount: int("inviteCount").default(0).notNull(),
  preferredPlayType: mysqlEnum("preferredPlayType", ["online", "live"]),
  preferredPlatforms: text("preferredPlatforms"),
  preferredFormats: text("preferredFormats"),
  preferredBuyIns: text("preferredBuyIns"),
  preferredBuyInsOnline: text("preferredBuyInsOnline"),
  preferredBuyInsLive: text("preferredBuyInsLive"),
  playsMultiPlatform: int("playsMultiPlatform").default(0),
  showInGlobalRanking: int("showInGlobalRanking").default(0).notNull(),
  showInFriendsRanking: int("showInFriendsRanking").default(0).notNull(),
  rankingConsentAnsweredAt: timestamp("rankingConsentAnsweredAt"),
  playStyleAnsweredAt: timestamp("playStyleAnsweredAt"),
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Poker sessions table - tracks individual poker sessions
 */
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Session type: online or live
  type: mysqlEnum("type", ["online", "live"]).notNull(),
  
  // Game format: tournament, cash game, sit & go, etc.
  gameFormat: mysqlEnum("gameFormat", [
    "cash_game",      // Cash Game / Ring Game
    "tournament",     // Torneio Regular
    "turbo",          // Torneio Turbo/Rápido
    "hyper_turbo",    // Torneio Hyper Turbo
    "sit_and_go",     // Sit & Go
    "spin_and_go",    // Spin & Go / Jackpot
    "bounty",         // Torneio Bounty/PKO
    "satellite",      // Satélite
    "freeroll",       // Freeroll
    "home_game"       // Home Game
  ]).notNull().default("cash_game"),
  
  // Financial data (stored in BRL centavos - converted if originally USD)
  buyIn: int("buyIn").notNull(), // in BRL centavos (R$ 100.00 = 10000)
  cashOut: int("cashOut").notNull(), // in BRL centavos
  
  // Original currency info (for sessions entered in USD)
  currency: mysqlEnum("currency", ["BRL", "USD"]).default("BRL").notNull(),
  originalBuyIn: int("originalBuyIn"), // original value in original currency centavos
  originalCashOut: int("originalCashOut"), // original value in original currency centavos
  exchangeRate: int("exchangeRate"), // rate * 10000 for precision (e.g., 5.50 = 55000)
  
  // Time data
  sessionDate: timestamp("sessionDate").notNull(),
  durationMinutes: int("durationMinutes").notNull(), // duration in minutes
  
  // Optional notes and doubts
  notes: text("notes"),
  doubts: text("doubts"), // Dúvidas/questões sobre a sessão para revisar depois
  
  // Venue reference (optional - links to venues table)
  venueId: int("venueId"),
  
  // Game details (optional)
  gameType: varchar("gameType", { length: 64 }), // e.g., "NL Hold'em", "PLO"
  stakes: varchar("stakes", { length: 32 }), // e.g., "1/2", "2/5"
  location: varchar("location", { length: 128 }), // casino/site name (legacy, use venueId)
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Bankroll settings table - stores initial bankroll configuration per user
 */
export const bankrollSettings = mysqlTable("bankroll_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Initial bankroll values (in centavos)
  initialOnline: int("initialOnline").notNull().default(0), // começa zerado
  initialLive: int("initialLive").notNull().default(0), // começa zerado
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BankrollSettings = typeof bankrollSettings.$inferSelect;
export type InsertBankrollSettings = typeof bankrollSettings.$inferInsert;

/**
 * Hand pattern counters (manual + quick actions on dashboard).
 * Keeps persistent KK/JJ results per user for social/ranking interactions.
 */
export const handPatternCounters = mysqlTable("hand_pattern_counters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),

  kkHands: int("kkHands").default(0).notNull(),
  kkWins: int("kkWins").default(0).notNull(),
  kkLosses: int("kkLosses").default(0).notNull(),

  jjHands: int("jjHands").default(0).notNull(),
  jjWins: int("jjWins").default(0).notNull(),
  jjLosses: int("jjLosses").default(0).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HandPatternCounters = typeof handPatternCounters.$inferSelect;
export type InsertHandPatternCounters = typeof handPatternCounters.$inferInsert;

/**
 * Venues table - stores poker venues (online sites and live clubs)
 */
export const venues = mysqlTable("venues", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Venue info
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["online", "live"]).notNull(),
  
  // Logo URL (optional - for custom venues)
  logoUrl: varchar("logoUrl", { length: 512 }),
  
  // Is this a preset venue (not deletable by user)
  isPreset: int("isPreset").default(0).notNull(), // 0 = false, 1 = true
  
  // Currency for this venue's balance (BRL, USD, CAD, JPY)
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY"]).default("BRL").notNull(),
  
  // Current balance in the venue (in original currency cents/units)
  // For online venues: money deposited on the platform
  // For live venues: NOT used (live bankroll is managed separately)
  balance: int("balance").default(0).notNull(),
  
  // Optional details
  website: varchar("website", { length: 256 }),
  address: text("address"),
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Venue = typeof venues.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;

/**
 * Invites table - tracks sent invites
 */
export const invites = mysqlTable("invites", {
  id: int("id").autoincrement().primaryKey(),
  inviterId: int("inviterId").notNull(),
  
  // Invite code (unique per invite)
  code: varchar("code", { length: 32 }).notNull().unique(),
  
  // Invitee info (filled when accepted)
  inviteeId: int("inviteeId"),
  inviteeEmail: varchar("inviteeEmail", { length: 320 }),
  
  // Status
  status: mysqlEnum("status", ["pending", "accepted", "expired"]).default("pending").notNull(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  acceptedAt: timestamp("acceptedAt"),
  expiresAt: timestamp("expiresAt"),
});

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;

/**
 * Fund transactions table - tracks deposits and withdrawals to bankroll
 */
export const fundTransactions = mysqlTable("fund_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Transaction type
  transactionType: mysqlEnum("transactionType", ["deposit", "withdrawal"]).notNull(),
  
  // Which bankroll: online or live
  bankrollType: mysqlEnum("bankrollType", ["online", "live"]).notNull(),
  
  // Amount in centavos (positive for deposit, positive for withdrawal - type determines direction)
  amount: int("amount").notNull(),
  
  // Currency info
  currency: mysqlEnum("currency", ["BRL", "USD"]).default("BRL").notNull(),
  originalAmount: int("originalAmount"), // original value if USD
  exchangeRate: int("exchangeRate"), // rate * 10000 for precision
  
  // Description/notes
  description: text("description"),
  
  // Date of transaction
  transactionDate: timestamp("transactionDate").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FundTransaction = typeof fundTransactions.$inferSelect;
export type InsertFundTransaction = typeof fundTransactions.$inferInsert;

/**
 * Community posts table - public feed where users share results
 */
export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Post content
  content: text("content").notNull(),

  // Optional attached image URL (stored in S3)
  imageUrl: varchar("imageUrl", { length: 512 }),
  imageKey: varchar("imageKey", { length: 256 }),

  // Optional attached session result
  sessionId: int("sessionId"),

  // Visibility: public = all users, friends = only friends
  visibility: mysqlEnum("visibility", ["public", "friends"]).default("public").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

/**
 * Post likes table
 */
export const postLikes = mysqlTable("post_likes", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PostLike = typeof postLikes.$inferSelect;
export type InsertPostLike = typeof postLikes.$inferInsert;

/**
 * Post comments table
 */
export const postComments = mysqlTable("post_comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PostComment = typeof postComments.$inferSelect;
export type InsertPostComment = typeof postComments.$inferInsert;

/**
 * Post reactions table - emoji reactions per user per post
 */
export const postReactions = mysqlTable("post_reactions", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 8 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PostReaction = typeof postReactions.$inferSelect;
export type InsertPostReaction = typeof postReactions.$inferInsert;

/**
 * Friendships table - tracks accepted friend connections
 */
export const friendships = mysqlTable("friendships", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  friendId: int("friendId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Friendship = typeof friendships.$inferSelect;
export type InsertFriendship = typeof friendships.$inferInsert;

/**
 * Friend requests table - tracks pending friendship actions
 */
export const friendRequests = mysqlTable("friend_requests", {
  id: int("id").autoincrement().primaryKey(),
  requesterId: int("requesterId").notNull(),
  receiverId: int("receiverId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "canceled"]).default("pending").notNull(),
  respondedAt: timestamp("respondedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FriendRequest = typeof friendRequests.$inferSelect;
export type InsertFriendRequest = typeof friendRequests.$inferInsert;

/**
 * Clubs table - poker clubs where user allocates bankroll (online apps like PPPoker, ClubGG, etc.)
 */
export const clubs = mysqlTable("clubs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Club info
  name: varchar("name", { length: 128 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 512 }),

  // Type: online app club or live club
  type: mysqlEnum("type", ["online", "live"]).default("online").notNull(),

  // Bankroll allocated to this club (in BRL centavos)
  allocatedAmount: int("allocatedAmount").notNull().default(0),

  // Notes
  notes: text("notes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Club = typeof clubs.$inferSelect;
export type InsertClub = typeof clubs.$inferInsert;

/**
 * Venue balance history table - tracks every balance change per venue
 * This powers the "smart bankroll" feature: automatic updates from sessions
 * plus manual adjustments with notes.
 */
export const venueBalanceHistory = mysqlTable("venue_balance_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  venueId: int("venueId").notNull(),

  // Type of change
  // "manual"  → user manually set/adjusted the balance
  // "session" → automatically recorded when a session is saved
  // "initial" → first balance set when venue is created
  changeType: mysqlEnum("changeType", ["manual", "session", "initial"]).notNull(),

  // Balance BEFORE this change (in original currency cents)
  balanceBefore: int("balanceBefore").notNull().default(0),

  // Balance AFTER this change (in original currency cents)
  balanceAfter: int("balanceAfter").notNull(),

  // The delta (balanceAfter - balanceBefore), can be negative
  delta: int("delta").notNull(),

  // Currency at time of change
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY"]).default("BRL").notNull(),

  // Optional: linked session id (for changeType = "session")
  sessionId: int("sessionId"),

  // Optional: user note for manual adjustments
  note: text("note"),

  // When this change happened
  changedAt: timestamp("changedAt").defaultNow().notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VenueBalanceHistory = typeof venueBalanceHistory.$inferSelect;
export type InsertVenueBalanceHistory = typeof venueBalanceHistory.$inferInsert;

/**
 * Active sessions table - tracks sessions currently in progress (timer running)
 * When the user finalizes the session, it gets converted to a regular session record.
 */
export const activeSessions = mysqlTable("active_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // one active session per user at a time
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActiveSession = typeof activeSessions.$inferSelect;
export type InsertActiveSession = typeof activeSessions.$inferInsert;

/**
 * Session tables - individual tables/games within a session
 * A session can have multiple tables (simultaneous or sequential).
 */
export const sessionTables = mysqlTable("session_tables", {
  id: int("id").autoincrement().primaryKey(),
  // Links to either an active session or a finalized session
  activeSessionId: int("activeSessionId"),
  sessionId: int("sessionId"), // set after session is finalized
  userId: int("userId").notNull(),

  // Table details
  venueId: int("venueId"),
  type: mysqlEnum("type", ["online", "live"]).notNull().default("online"),
  gameFormat: mysqlEnum("gameFormat", [
    "cash_game", "tournament", "turbo", "hyper_turbo",
    "sit_and_go", "spin_and_go", "bounty", "satellite", "freeroll", "home_game"
  ]).notNull().default("tournament"),

  // Financial data in original currency (centavos/units)
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY"]).default("BRL").notNull(),
  buyIn: int("buyIn").notNull().default(0), // in original currency centavos
  cashOut: int("cashOut"), // null = still in progress

  // Optional details
  gameType: varchar("gameType", { length: 64 }), // NL Hold'em, PLO, etc.
  stakes: varchar("stakes", { length: 32 }), // 1/2, 2/5, etc.
  notes: text("notes"),

  // Timestamps
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"), // null = still playing

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SessionTable = typeof sessionTables.$inferSelect;
export type InsertSessionTable = typeof sessionTables.$inferInsert;
