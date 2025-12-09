import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionById: vi.fn(),
  getUserSessions: vi.fn(),
  getSessionStats: vi.fn(),
  getStatsByGameFormat: vi.fn(),
  getBankrollSettings: vi.fn(),
  upsertBankrollSettings: vi.fn(),
  getBankrollHistory: vi.fn(),
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  deleteVenue: vi.fn(),
  getUserVenues: vi.fn(),
  getVenueById: vi.fn(),
  initializePresetVenues: vi.fn(),
  getStatsByVenue: vi.fn(),
}));

// Mock the currency module
vi.mock("./currency", () => ({
  getUsdToBrlRate: vi.fn().mockResolvedValue(5.5),
  convertUsdToBrl: vi.fn((usd: number, rate: number) => Math.round(usd * rate)),
}));

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

describe("venues router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists venues for authenticated user", async () => {
    const { getUserVenues, initializePresetVenues } = await import("./db");
    const mockVenues = [
      { id: 1, userId: 1, name: "PokerStars", type: "online", logoUrl: "/logos/pokerstars.png", isPreset: 1 },
      { id: 2, userId: 1, name: "H2 Club", type: "live", logoUrl: "/logos/h2club.jpg", isPreset: 1 },
    ];
    
    (getUserVenues as any).mockResolvedValue(mockVenues);
    (initializePresetVenues as any).mockResolvedValue(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.venues.list({});

    expect(initializePresetVenues).toHaveBeenCalledWith(1, expect.any(Array));
    expect(getUserVenues).toHaveBeenCalledWith(1, undefined);
    expect(result).toEqual(mockVenues);
  });

  it("creates a custom venue", async () => {
    const { createVenue } = await import("./db");
    const mockVenue = {
      id: 10,
      userId: 1,
      name: "My Casino",
      type: "live",
      logoUrl: null,
      isPreset: 0,
    };
    
    (createVenue as any).mockResolvedValue(mockVenue);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.venues.create({
      name: "My Casino",
      type: "live",
    });

    expect(createVenue).toHaveBeenCalledWith({
      userId: 1,
      name: "My Casino",
      type: "live",
      isPreset: 0,
    });
    expect(result).toEqual(mockVenue);
  });

  it("gets venue statistics", async () => {
    const { getStatsByVenue } = await import("./db");
    const mockStats = [
      { venueId: 1, venueName: "PokerStars", sessions: 10, totalProfit: 50000, winRate: 60 },
    ];
    
    (getStatsByVenue as any).mockResolvedValue(mockStats);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.venues.statsByVenue();

    expect(getStatsByVenue).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockStats);
  });
});

describe("currency router", () => {
  it("returns current USD/BRL exchange rate", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.currency.getRate();

    expect(result).toEqual({ rate: 5.5 });
  });
});

describe("sessions with currency conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts USD to BRL when creating session", async () => {
    const { createSession } = await import("./db");
    const { convertUsdToBrl } = await import("./currency");
    
    const mockSession = {
      id: 1,
      userId: 1,
      type: "online",
      gameFormat: "cash_game",
      currency: "USD",
      buyIn: 5500, // 100 USD * 5.5 = 550 BRL = 55000 centavos
      cashOut: 8250, // 150 USD * 5.5 = 825 BRL = 82500 centavos
      originalBuyIn: 10000, // 100 USD in centavos
      originalCashOut: 15000, // 150 USD in centavos
      exchangeRate: 55000, // 5.5 * 10000
      sessionDate: new Date(),
      durationMinutes: 120,
    };
    
    (createSession as any).mockResolvedValue(mockSession);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.sessions.create({
      type: "online",
      gameFormat: "cash_game",
      currency: "USD",
      buyIn: 10000, // 100 USD in centavos
      cashOut: 15000, // 150 USD in centavos
      sessionDate: new Date(),
      durationMinutes: 120,
    });

    expect(convertUsdToBrl).toHaveBeenCalledWith(10000, 5.5);
    expect(convertUsdToBrl).toHaveBeenCalledWith(15000, 5.5);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      currency: "USD",
      originalBuyIn: 10000,
      originalCashOut: 15000,
    }));
  });

  it("does not convert BRL sessions", async () => {
    const { createSession } = await import("./db");
    const { convertUsdToBrl } = await import("./currency");
    
    const mockSession = {
      id: 1,
      userId: 1,
      type: "live",
      gameFormat: "tournament",
      currency: "BRL",
      buyIn: 50000,
      cashOut: 100000,
      sessionDate: new Date(),
      durationMinutes: 300,
    };
    
    (createSession as any).mockResolvedValue(mockSession);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.sessions.create({
      type: "live",
      gameFormat: "tournament",
      currency: "BRL",
      buyIn: 50000,
      cashOut: 100000,
      sessionDate: new Date(),
      durationMinutes: 300,
    });

    expect(convertUsdToBrl).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      currency: "BRL",
      buyIn: 50000,
      cashOut: 100000,
      originalBuyIn: null,
      originalCashOut: null,
      exchangeRate: null,
    }));
  });
});
