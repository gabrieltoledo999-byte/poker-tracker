import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionById: vi.fn(),
  getUserSessions: vi.fn(),
  getSessionStats: vi.fn(),
  getBankrollSettings: vi.fn(),
  upsertBankrollSettings: vi.fn(),
  getBankrollHistory: vi.fn(),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("sessions router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sessions.list", () => {
    it("returns user sessions", async () => {
      const mockSessions = [
        {
          id: 1,
          userId: 1,
          type: "live" as const,
          buyIn: 50000,
          cashOut: 75000,
          sessionDate: new Date(),
          durationMinutes: 180,
          notes: null,
          gameType: "NL Hold'em",
          stakes: "1/2",
          location: "Casino",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getUserSessions).mockResolvedValue(mockSessions);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.sessions.list({});

      expect(result).toEqual(mockSessions);
      expect(db.getUserSessions).toHaveBeenCalledWith(1, {});
    });

    it("filters by type", async () => {
      vi.mocked(db.getUserSessions).mockResolvedValue([]);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.sessions.list({ type: "online" });

      expect(db.getUserSessions).toHaveBeenCalledWith(1, { type: "online" });
    });
  });

  describe("sessions.stats", () => {
    it("returns session statistics", async () => {
      const mockStats = {
        totalSessions: 10,
        totalBuyIn: 500000,
        totalCashOut: 600000,
        totalProfit: 100000,
        totalDuration: 1800,
        winningSessions: 7,
        losingSessions: 3,
        breakEvenSessions: 0,
        bestSession: null,
        worstSession: null,
        avgProfit: 10000,
        winRate: 70,
        avgHourlyRate: 3333,
      };

      vi.mocked(db.getSessionStats).mockResolvedValue(mockStats);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.sessions.stats({});

      expect(result).toEqual(mockStats);
      expect(db.getSessionStats).toHaveBeenCalledWith(1, undefined);
    });
  });

  describe("sessions.create", () => {
    it("creates a new session", async () => {
      const newSession = {
        id: 1,
        userId: 1,
        type: "live" as const,
        buyIn: 50000,
        cashOut: 75000,
        sessionDate: new Date(),
        durationMinutes: 180,
        notes: "Good session",
        gameType: null,
        stakes: null,
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.createSession).mockResolvedValue(newSession);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.sessions.create({
        type: "live",
        buyIn: 50000,
        cashOut: 75000,
        sessionDate: new Date(),
        durationMinutes: 180,
        notes: "Good session",
      });

      expect(result).toEqual(newSession);
      expect(db.createSession).toHaveBeenCalled();
    });
  });

  describe("sessions.delete", () => {
    it("deletes a session", async () => {
      vi.mocked(db.deleteSession).mockResolvedValue(true);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.sessions.delete({ id: 1 });

      expect(result).toBe(true);
      expect(db.deleteSession).toHaveBeenCalledWith(1, 1);
    });
  });
});

describe("bankroll router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bankroll.getSettings", () => {
    it("returns default settings when none exist", async () => {
      vi.mocked(db.getBankrollSettings).mockResolvedValue(null);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.bankroll.getSettings();

      expect(result).toEqual({
        initialOnline: 100000,
        initialLive: 400000,
      });
    });

    it("returns existing settings", async () => {
      vi.mocked(db.getBankrollSettings).mockResolvedValue({
        id: 1,
        userId: 1,
        initialOnline: 200000,
        initialLive: 800000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.bankroll.getSettings();

      expect(result).toEqual({
        initialOnline: 200000,
        initialLive: 800000,
      });
    });
  });

  describe("bankroll.getCurrent", () => {
    it("calculates current bankroll with profits", async () => {
      vi.mocked(db.getBankrollSettings).mockResolvedValue({
        id: 1,
        userId: 1,
        initialOnline: 100000,
        initialLive: 400000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(db.getSessionStats)
        .mockResolvedValueOnce({
          totalSessions: 5,
          totalBuyIn: 250000,
          totalCashOut: 300000,
          totalProfit: 50000,
          totalDuration: 600,
          winningSessions: 3,
          losingSessions: 2,
          breakEvenSessions: 0,
          bestSession: null,
          worstSession: null,
          avgProfit: 10000,
          winRate: 60,
          avgHourlyRate: 5000,
        })
        .mockResolvedValueOnce({
          totalSessions: 3,
          totalBuyIn: 150000,
          totalCashOut: 180000,
          totalProfit: 30000,
          totalDuration: 540,
          winningSessions: 2,
          losingSessions: 1,
          breakEvenSessions: 0,
          bestSession: null,
          worstSession: null,
          avgProfit: 10000,
          winRate: 67,
          avgHourlyRate: 3333,
        });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.bankroll.getCurrent();

      expect(result.online.current).toBe(150000); // 100000 + 50000
      expect(result.live.current).toBe(430000); // 400000 + 30000
      expect(result.total.current).toBe(580000); // 150000 + 430000
    });
  });
});
