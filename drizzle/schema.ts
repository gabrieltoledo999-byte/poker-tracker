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
  role: mysqlEnum("role", ["user", "coach", "reviewer", "admin", "developer", "system_ai_service"]).default("user").notNull(),
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
  
  // Original currency info for sessions entered outside BRL
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).default("BRL").notNull(),
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
  tournamentName: varchar("tournamentName", { length: 160 }), // Nome do torneio jogado
  finalPosition: int("finalPosition"), // Colocacao final no torneio (1 = campeao)
  fieldSize: int("fieldSize"), // Total de jogadores no torneio
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
 * Keeps persistent premium-hand results per user for social/ranking interactions.
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

  aaHands: int("aaHands").default(0).notNull(),
  aaWins: int("aaWins").default(0).notNull(),
  aaLosses: int("aaLosses").default(0).notNull(),

  akHands: int("akHands").default(0).notNull(),
  akWins: int("akWins").default(0).notNull(),
  akLosses: int("akLosses").default(0).notNull(),

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
  
  // Currency for this venue's balance (BRL, USD, CAD, JPY, CNY)
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).default("BRL").notNull(),
  
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
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).default("BRL").notNull(),
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
 * User blocks table - tracks blocked users
 */
export const userBlocks = mysqlTable("user_blocks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  blockedUserId: int("blockedUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;

/**
 * Private messages between friends
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  receiverId: int("receiverId").notNull(),
  content: text("content").notNull(),
  caption: text("caption"),
  type: mysqlEnum("type", ["text", "image"]).default("text").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export const messageReactions = mysqlTable("message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;

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
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).default("BRL").notNull(),

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
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).default("BRL").notNull(),
  buyIn: int("buyIn").notNull().default(0), // in original currency centavos
  cashOut: int("cashOut"), // null = still in progress
  initialBuyIn: int("initialBuyIn"), // original buy-in at table creation (no rebuys), null for legacy rows
  rebuyCount: int("rebuyCount").notNull().default(0), // number of rebuys made on this table

  // Optional details
  gameType: varchar("gameType", { length: 64 }), // NL Hold'em, PLO, etc.
  stakes: varchar("stakes", { length: 32 }), // 1/2, 2/5, etc.
  clubName: varchar("clubName", { length: 120 }), // Optional club label (ex: Clube XPTO)
  tournamentName: varchar("tournamentName", { length: 160 }), // Nome do torneio jogado
  finalPosition: int("finalPosition"), // Colocacao final no torneio (1 = campeao)
  fieldSize: int("fieldSize"), // Total de jogadores no torneio
  notes: text("notes"),

  // Timestamps
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"), // null = still playing

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SessionTable = typeof sessionTables.$inferSelect;
export type InsertSessionTable = typeof sessionTables.$inferInsert;

/**
 * Explicit user consent for centralized poker memory.
 */
export const userConsents = mysqlTable("user_consents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consentVersion: varchar("consentVersion", { length: 32 }).notNull(),
  allowDataStorage: int("allowDataStorage").notNull().default(0),
  allowSharedInternalAnalysis: int("allowSharedInternalAnalysis").notNull().default(0),
  allowAiTrainingUsage: int("allowAiTrainingUsage").notNull().default(0),
  allowDeveloperAccess: int("allowDeveloperAccess").notNull().default(0),
  allowFieldAggregation: int("allowFieldAggregation").notNull().default(0),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserConsent = typeof userConsents.$inferSelect;
export type InsertUserConsent = typeof userConsents.$inferInsert;

/**
 * Owner-managed access grants used by coach/reviewer roles.
 */
export const userDataAccessGrants = mysqlTable("user_data_access_grants", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  viewerUserId: int("viewerUserId").notNull(),
  allowHandReview: int("allowHandReview").notNull().default(1),
  allowTrainerAccess: int("allowTrainerAccess").notNull().default(0),
  allowGtoAccess: int("allowGtoAccess").notNull().default(0),
  allowFieldComparison: int("allowFieldComparison").notNull().default(0),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserDataAccessGrant = typeof userDataAccessGrants.$inferSelect;
export type InsertUserDataAccessGrant = typeof userDataAccessGrants.$inferInsert;

/**
 * Auditable trail for data access.
 */
export const dataAccessAuditLogs = mysqlTable("data_access_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  targetUserId: int("targetUserId").notNull(),
  actorRole: varchar("actorRole", { length: 40 }),
  accessScope: varchar("accessScope", { length: 64 }).notNull(),
  accessMethod: varchar("accessMethod", { length: 32 }).notNull().default("trpc"),
  reason: text("reason"),
  outcome: mysqlEnum("outcome", ["allowed", "denied"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DataAccessAuditLog = typeof dataAccessAuditLogs.$inferSelect;
export type InsertDataAccessAuditLog = typeof dataAccessAuditLogs.$inferInsert;

/**
 * Centralized imported tournaments.
 */
export const centralTournaments = mysqlTable("central_tournaments", {
  id: int("id").autoincrement().primaryKey(),
  externalTournamentId: varchar("externalTournamentId", { length: 191 }),
  userId: int("userId").notNull(),
  site: varchar("site", { length: 64 }).notNull(),
  format: varchar("format", { length: 32 }).notNull().default("tournament"),
  buyIn: int("buyIn").notNull().default(0),
  fee: int("fee").notNull().default(0),
  totalCost: int("totalCost").notNull().default(0),
  currency: mysqlEnum("currency", ["BRL", "USD", "CAD", "JPY", "CNY", "EUR"]).notNull().default("BRL"),
  abiValue: int("abiValue").notNull().default(0),
  abiBucket: varchar("abiBucket", { length: 32 }).notNull().default("micro"),
  playerAbiSnapshot: int("playerAbiSnapshot").notNull().default(0),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  totalHands: int("totalHands").notNull().default(0),
  finalPosition: int("finalPosition"),
  wasEliminated: int("wasEliminated").notNull().default(0),
  eliminationHandId: int("eliminationHandId"),
  rawSourceId: varchar("rawSourceId", { length: 191 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CentralTournament = typeof centralTournaments.$inferSelect;
export type InsertCentralTournament = typeof centralTournaments.$inferInsert;

/**
 * Parsed poker hands as persistent memory.
 */
export const centralHands = mysqlTable("central_hands", {
  id: int("id").autoincrement().primaryKey(),
  externalHandId: varchar("externalHandId", { length: 191 }),
  tournamentId: int("tournamentId").notNull(),
  userId: int("userId").notNull(),
  handNumber: varchar("handNumber", { length: 64 }),
  datetimeOriginal: timestamp("datetimeOriginal"),
  buttonSeat: int("buttonSeat"),
  heroSeat: int("heroSeat"),
  heroPosition: varchar("heroPosition", { length: 16 }),
  smallBlind: int("smallBlind").default(0),
  bigBlind: int("bigBlind").default(0),
  ante: int("ante").default(0),
  board: text("board"),
  heroCards: varchar("heroCards", { length: 32 }),
  totalPot: int("totalPot"),
  rake: int("rake"),
  result: int("result"),
  showdown: int("showdown").notNull().default(0),
  rawText: text("rawText"),
  parsedJson: mediumtext("parsedJson"),
  handContextJson: mediumtext("handContextJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CentralHand = typeof centralHands.$inferSelect;
export type InsertCentralHand = typeof centralHands.$inferInsert;

/**
 * Granular action-level representation of each hand.
 */
export const centralHandActions = mysqlTable("central_hand_actions", {
  id: int("id").autoincrement().primaryKey(),
  handId: int("handId").notNull(),
  tournamentId: int("tournamentId").notNull(),
  userId: int("userId").notNull(),
  street: mysqlEnum("street", ["preflop", "flop", "turn", "river", "showdown", "summary"]).notNull(),
  actionOrder: int("actionOrder").notNull().default(0),
  playerName: varchar("playerName", { length: 120 }).notNull(),
  seat: int("seat"),
  position: varchar("position", { length: 16 }),
  actionType: mysqlEnum("actionType", ["fold", "check", "call", "bet", "raise", "all_in", "post_blind", "post_ante", "straddle", "show", "muck", "collect", "other"]).notNull(),
  amount: int("amount"),
  toAmount: int("toAmount"),
  stackBefore: int("stackBefore"),
  stackAfter: int("stackAfter"),
  potBefore: int("potBefore"),
  potAfter: int("potAfter"),
  isAllIn: int("isAllIn").notNull().default(0),
  isForced: int("isForced").notNull().default(0),
  facingActionType: varchar("facingActionType", { length: 32 }),
  facingSizeBb: int("facingSizeBb"),
  heroInHand: int("heroInHand").notNull().default(0),
  showdownVisible: int("showdownVisible").notNull().default(0),
  contextJson: mediumtext("contextJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CentralHandAction = typeof centralHandActions.$inferSelect;
export type InsertCentralHandAction = typeof centralHandActions.$inferInsert;

/**
 * User stats per tournament.
 */
export const playerTournamentStats = mysqlTable("player_tournament_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tournamentId: int("tournamentId").notNull(),
  handsPlayed: int("handsPlayed").notNull().default(0),
  vpip: int("vpip").notNull().default(0),
  pfr: int("pfr").notNull().default(0),
  threeBet: int("threeBet").notNull().default(0),
  cbetFlop: int("cbetFlop").notNull().default(0),
  cbetTurn: int("cbetTurn").notNull().default(0),
  foldToCbet: int("foldToCbet").notNull().default(0),
  bbDefense: int("bbDefense").notNull().default(0),
  stealAttempt: int("stealAttempt").notNull().default(0),
  aggressionFactor: int("aggressionFactor").notNull().default(0),
  limpRate: int("limpRate").notNull().default(0),
  wtsd: int("wtsd").notNull().default(0),
  wsd: int("wsd").notNull().default(0),
  averageStackBb: int("averageStackBb").notNull().default(0),
  finalPosition: int("finalPosition"),
  abiBucket: varchar("abiBucket", { length: 32 }).notNull().default("micro"),
  totalCost: int("totalCost").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerTournamentStats = typeof playerTournamentStats.$inferSelect;
export type InsertPlayerTournamentStats = typeof playerTournamentStats.$inferInsert;

/**
 * Historical aggregate stats per user.
 */
export const playerAggregateStats = mysqlTable("player_aggregate_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  sampleHands: int("sampleHands").notNull().default(0),
  sampleTournaments: int("sampleTournaments").notNull().default(0),
  vpipAvg: int("vpipAvg").notNull().default(0),
  pfrAvg: int("pfrAvg").notNull().default(0),
  threeBetAvg: int("threeBetAvg").notNull().default(0),
  cbetFlopAvg: int("cbetFlopAvg").notNull().default(0),
  cbetTurnAvg: int("cbetTurnAvg").notNull().default(0),
  foldToCbetAvg: int("foldToCbetAvg").notNull().default(0),
  bbDefenseAvg: int("bbDefenseAvg").notNull().default(0),
  stealAttemptAvg: int("stealAttemptAvg").notNull().default(0),
  aggressionFactorAvg: int("aggressionFactorAvg").notNull().default(0),
  itmRate: int("itmRate").notNull().default(0),
  avgFinishPosition: int("avgFinishPosition").notNull().default(0),
  averageAbi: int("averageAbi").notNull().default(0),
  medianAbi: int("medianAbi").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerAggregateStats = typeof playerAggregateStats.$inferSelect;
export type InsertPlayerAggregateStats = typeof playerAggregateStats.$inferInsert;

/**
 * Position-driven user stats.
 */
export const playerPositionStats = mysqlTable("player_position_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  position: mysqlEnum("position", ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB", "UNKNOWN"]).notNull().default("UNKNOWN"),
  handsPlayed: int("handsPlayed").notNull().default(0),
  vpip: int("vpip").notNull().default(0),
  pfr: int("pfr").notNull().default(0),
  winRateBb100: int("winRateBb100").notNull().default(0),
  chipEv: int("chipEv").notNull().default(0),
  netChips: int("netChips").notNull().default(0),
  foldToOpen: int("foldToOpen").notNull().default(0),
  callOpen: int("callOpen").notNull().default(0),
  raiseFirstIn: int("raiseFirstIn").notNull().default(0),
  threeBet: int("threeBet").notNull().default(0),
  bbDefenseWhenApplicable: int("bbDefenseWhenApplicable").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerPositionStats = typeof playerPositionStats.$inferSelect;
export type InsertPlayerPositionStats = typeof playerPositionStats.$inferInsert;

/**
 * Leak detections for future trainer/reviewer modules.
 */
export const playerLeakFlags = mysqlTable("player_leak_flags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leakCode: varchar("leakCode", { length: 80 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  confidence: int("confidence").notNull().default(0),
  description: text("description").notNull(),
  evidenceJson: mediumtext("evidenceJson"),
  firstDetectedAt: timestamp("firstDetectedAt").defaultNow().notNull(),
  lastDetectedAt: timestamp("lastDetectedAt").defaultNow().notNull(),
  active: int("active").notNull().default(1),
});

export type PlayerLeakFlag = typeof playerLeakFlags.$inferSelect;
export type InsertPlayerLeakFlag = typeof playerLeakFlags.$inferInsert;

/**
 * Aggregated population tendencies for field intelligence.
 */
export const fieldAggregateStats = mysqlTable("field_aggregate_stats", {
  id: int("id").autoincrement().primaryKey(),
  filterScope: varchar("filterScope", { length: 80 }).notNull(),
  site: varchar("site", { length: 64 }),
  stakeLevel: varchar("stakeLevel", { length: 64 }),
  format: varchar("format", { length: 32 }),
  position: varchar("position", { length: 16 }),
  sampleHands: int("sampleHands").notNull().default(0),
  avgVpip: int("avgVpip").notNull().default(0),
  avgPfr: int("avgPfr").notNull().default(0),
  avgThreeBet: int("avgThreeBet").notNull().default(0),
  avgBbDefense: int("avgBbDefense").notNull().default(0),
  avgCbetFlop: int("avgCbetFlop").notNull().default(0),
  avgFoldToCbet: int("avgFoldToCbet").notNull().default(0),
  avgSteal: int("avgSteal").notNull().default(0),
  avgOpenSizeBb: int("avgOpenSizeBb").notNull().default(0),
  avgCallOpenRate: int("avgCallOpenRate").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FieldAggregateStats = typeof fieldAggregateStats.$inferSelect;
export type InsertFieldAggregateStats = typeof fieldAggregateStats.$inferInsert;

/**
 * Showdown ground-truth records extracted from replay.
 */
export const showdownRecords = mysqlTable("showdown_records", {
  id: int("id").autoincrement().primaryKey(),
  handId: int("handId").notNull(),
  tournamentId: int("tournamentId").notNull(),
  userId: int("userId").notNull(),
  playerName: varchar("playerName", { length: 120 }).notNull(),
  seat: int("seat"),
  position: varchar("position", { length: 16 }),
  holeCards: varchar("holeCards", { length: 64 }),
  finalHandDescription: text("finalHandDescription"),
  wonPot: int("wonPot").notNull().default(0),
  amountWon: int("amountWon"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ShowdownRecord = typeof showdownRecords.$inferSelect;
export type InsertShowdownRecord = typeof showdownRecords.$inferInsert;

/**
 * User aggregate segmented by ABI bucket.
 */
export const playerStatsByAbi = mysqlTable("player_stats_by_abi", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  abiBucket: varchar("abiBucket", { length: 32 }).notNull(),
  tournaments: int("tournaments").notNull().default(0),
  handsPlayed: int("handsPlayed").notNull().default(0),
  vpip: int("vpip"),
  pfr: int("pfr"),
  threeBet: int("threeBet"),
  cbetFlop: int("cbetFlop"),
  bbDefense: int("bbDefense"),
  avgFinishPosition: int("avgFinishPosition"),
  itmRate: int("itmRate"),
  roiEstimate: int("roiEstimate"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerStatsByAbi = typeof playerStatsByAbi.$inferSelect;
export type InsertPlayerStatsByAbi = typeof playerStatsByAbi.$inferInsert;

/**
 * Field aggregate segmented by ABI bucket.
 */
export const fieldAggregateStatsByAbi = mysqlTable("field_aggregate_stats_by_abi", {
  id: int("id").autoincrement().primaryKey(),
  site: varchar("site", { length: 64 }).notNull(),
  abiBucket: varchar("abiBucket", { length: 32 }).notNull(),
  sampleTournaments: int("sampleTournaments").notNull().default(0),
  sampleHands: int("sampleHands").notNull().default(0),
  avgVpip: int("avgVpip"),
  avgPfr: int("avgPfr"),
  avgThreeBet: int("avgThreeBet"),
  avgCbetFlop: int("avgCbetFlop"),
  avgBbDefense: int("avgBbDefense"),
  avgSteal: int("avgSteal"),
  avgOpenSizeBb: int("avgOpenSizeBb"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FieldAggregateStatsByAbi = typeof fieldAggregateStatsByAbi.$inferSelect;
export type InsertFieldAggregateStatsByAbi = typeof fieldAggregateStatsByAbi.$inferInsert;

/**
 * User aggregate segmented by ABI bucket and position.
 */
export const playerStatsByPositionAndAbi = mysqlTable("player_stats_by_position_and_abi", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  abiBucket: varchar("abiBucket", { length: 32 }).notNull(),
  position: varchar("position", { length: 16 }).notNull(),
  handsPlayed: int("handsPlayed").notNull().default(0),
  vpip: int("vpip"),
  pfr: int("pfr"),
  threeBet: int("threeBet"),
  netChips: int("netChips"),
  bb100: int("bb100"),
  stealAttempt: int("stealAttempt"),
  foldTo3Bet: int("foldTo3Bet"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerStatsByPositionAndAbi = typeof playerStatsByPositionAndAbi.$inferSelect;
export type InsertPlayerStatsByPositionAndAbi = typeof playerStatsByPositionAndAbi.$inferInsert;

