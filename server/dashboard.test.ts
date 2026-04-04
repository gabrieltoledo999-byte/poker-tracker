import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database functions
vi.mock("./db", () => ({
  getBankrollSettings: vi.fn().mockResolvedValue({ initialOnline: 100000, initialLive: 200000 }),
  upsertBankrollSettings: vi.fn().mockResolvedValue({ initialOnline: 100000, initialLive: 300000 }),
  getSessionStats: vi.fn().mockResolvedValue({ totalProfit: 5000, totalSessions: 10, winRate: 60, avgProfit: 500, avgHourlyRate: 250 }),
  getFundTransactionsTotals: vi.fn().mockResolvedValue({ online: { net: 0 }, live: { net: 0 } }),
  getUserVenues: vi.fn().mockResolvedValue([
    { id: 1, name: "PokerStars", type: "online", balance: 50000, currency: "BRL", userId: 1, logoUrl: null, isPreset: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, name: "Casino Local", type: "live", balance: 0, currency: "BRL", userId: 1, logoUrl: null, isPreset: 0, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getStatsByVenue: vi.fn().mockResolvedValue([
    { venueId: 1, venueName: "PokerStars", sessions: 5, totalProfit: 3000, winRate: 60, avgProfit: 600 },
  ]),
  updateVenue: vi.fn().mockResolvedValue({ id: 1, name: "PokerStars", balance: 75000, currency: "USD" }),
  initializePresetVenues: vi.fn().mockResolvedValue(undefined),
  getBankrollHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("./currency", () => ({
  convertToBrl: vi.fn().mockImplementation(async (amount: number, currency: string) => {
    if (currency === "USD") return Math.round(amount * 580);
    if (currency === "JPY") return Math.round(amount * 4);
    return amount;
  }),
  getUsdToBrlRate: vi.fn().mockResolvedValue(5.8),
  convertUsdToBrl: vi.fn().mockImplementation(async (amount: number) => Math.round(amount * 580)),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-open-id",
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("bankroll.getConsolidated", () => {
  it("returns consolidated bankroll with allVenues, online, live, and total", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankroll.getConsolidated();

    expect(result).toHaveProperty("allVenues");
    expect(result).toHaveProperty("online");
    expect(result).toHaveProperty("live");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.allVenues)).toBe(true);
  });

  it("allVenues includes balanceBrl field for currency conversion", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankroll.getConsolidated();

    expect(result.allVenues.length).toBeGreaterThan(0);
    result.allVenues.forEach((v: any) => {
      expect(v).toHaveProperty("balanceBrl");
      expect(typeof v.balanceBrl).toBe("number");
    });
  });

  it("live.current is based on initialLive + session profit, not deposits", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankroll.getConsolidated();

    // Live current should be initialLive (200000) + liveStats.totalProfit (5000) + fundTotals.live.net (0)
    expect(result.live.current).toBe(205000);
    expect(result.live.initial).toBe(200000);
  });

  it("total.current is sum of online venues balances + live bankroll", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankroll.getConsolidated();

    // online venue balance = 50000 BRL, live = 205000
    expect(result.total.current).toBe(50000 + 205000);
  });
});

describe("venues.updateBalance", () => {
  it("updates venue balance and currency", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.venues.updateBalance({ id: 1, balance: 75000, currency: "USD" });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("balance", 75000);
  });

  it("accepts BRL, USD, and JPY currencies", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw for any valid currency
    await expect(caller.venues.updateBalance({ id: 1, balance: 10000, currency: "BRL" })).resolves.toBeTruthy();
    await expect(caller.venues.updateBalance({ id: 1, balance: 10000, currency: "USD" })).resolves.toBeTruthy();
    await expect(caller.venues.updateBalance({ id: 1, balance: 10000, currency: "JPY" })).resolves.toBeTruthy();
  });

  it("rejects negative balance", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.venues.updateBalance({ id: 1, balance: -100, currency: "BRL" })).rejects.toThrow();
  });
});

describe("bankroll.updateSettings - live bankroll", () => {
  it("accepts initialLive to set live bankroll without deposits", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw - live bankroll is set directly, not via deposits
    await expect(caller.bankroll.updateSettings({ initialLive: 300000 })).resolves.toBeDefined();
  });
});
