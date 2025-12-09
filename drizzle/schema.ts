import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  
  // Financial data (stored in centavos to avoid decimal issues)
  buyIn: int("buyIn").notNull(), // in centavos (R$ 100.00 = 10000)
  cashOut: int("cashOut").notNull(), // in centavos
  
  // Time data
  sessionDate: timestamp("sessionDate").notNull(),
  durationMinutes: int("durationMinutes").notNull(), // duration in minutes
  
  // Optional notes
  notes: text("notes"),
  
  // Game details (optional)
  gameType: varchar("gameType", { length: 64 }), // e.g., "NL Hold'em", "PLO"
  stakes: varchar("stakes", { length: 32 }), // e.g., "1/2", "2/5"
  location: varchar("location", { length: 128 }), // casino/site name
  
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
