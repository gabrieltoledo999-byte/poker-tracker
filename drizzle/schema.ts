import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Invite system
  inviteCode: varchar("inviteCode", { length: 32 }).unique(),
  invitedBy: int("invitedBy"),
  inviteCount: int("inviteCount").default(0).notNull(),
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
  initialOnline: int("initialOnline").notNull().default(100000), // R$ 1.000,00
  initialLive: int("initialLive").notNull().default(400000), // R$ 4.000,00
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BankrollSettings = typeof bankrollSettings.$inferSelect;
export type InsertBankrollSettings = typeof bankrollSettings.$inferInsert;

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
