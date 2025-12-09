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
  createInvite: vi.fn(),
  getInviteByCode: vi.fn(),
  acceptInvite: vi.fn(),
  getUserInvites: vi.fn(),
  getInviteRanking: vi.fn(),
  getUserById: vi.fn(),
  updateUserAvatar: vi.fn(),
  getUserInviteCode: vi.fn(),
  getUserByInviteCode: vi.fn(),
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

describe("invites router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets user invite code", async () => {
    const { getUserInviteCode } = await import("./db");
    (getUserInviteCode as any).mockResolvedValue("ABC12345");

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invites.getMyCode();

    expect(getUserInviteCode).toHaveBeenCalledWith(1);
    expect(result).toEqual({ code: "ABC12345" });
  });

  it("creates a new invite", async () => {
    const { createInvite } = await import("./db");
    const mockInvite = {
      id: 1,
      inviterId: 1,
      code: "INVITE123",
      status: "pending",
      createdAt: new Date(),
    };
    (createInvite as any).mockResolvedValue(mockInvite);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invites.create({ email: "friend@test.com" });

    expect(createInvite).toHaveBeenCalledWith(1, "friend@test.com");
    expect(result).toEqual(mockInvite);
  });

  it("lists user invites", async () => {
    const { getUserInvites } = await import("./db");
    const mockInvites = [
      { id: 1, inviterId: 1, code: "INV1", status: "accepted" },
      { id: 2, inviterId: 1, code: "INV2", status: "pending" },
    ];
    (getUserInvites as any).mockResolvedValue(mockInvites);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invites.list();

    expect(getUserInvites).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockInvites);
  });

  it("gets invite ranking", async () => {
    const { getInviteRanking } = await import("./db");
    const mockRanking = [
      { id: 1, name: "Top Player", avatarUrl: null, inviteCount: 10 },
      { id: 2, name: "Second Player", avatarUrl: null, inviteCount: 5 },
    ];
    (getInviteRanking as any).mockResolvedValue(mockRanking);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invites.ranking({ limit: 10 });

    expect(getInviteRanking).toHaveBeenCalledWith(10);
    expect(result).toEqual(mockRanking);
  });

  it("accepts an invite", async () => {
    const { acceptInvite } = await import("./db");
    const mockAccepted = {
      id: 1,
      inviterId: 2,
      inviteeId: 1,
      code: "INVITE123",
      status: "accepted",
      acceptedAt: new Date(),
    };
    (acceptInvite as any).mockResolvedValue(mockAccepted);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.invites.accept({ code: "INVITE123" });

    expect(acceptInvite).toHaveBeenCalledWith("INVITE123", 1);
    expect(result).toEqual(mockAccepted);
  });
});

describe("profile router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates user avatar", async () => {
    const { updateUserAvatar } = await import("./db");
    (updateUserAvatar as any).mockResolvedValue(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.profile.updateAvatar({
      avatarUrl: "https://example.com/avatar.jpg",
    });

    expect(updateUserAvatar).toHaveBeenCalledWith(1, "https://example.com/avatar.jpg");
    expect(result).toEqual({ success: true });
  });

  it("gets user by invite code", async () => {
    const { getUserByInviteCode } = await import("./db");
    const mockUser = {
      name: "Inviter",
      avatarUrl: "https://example.com/avatar.jpg",
      inviteCount: 5,
    };
    (getUserByInviteCode as any).mockResolvedValue(mockUser);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.profile.getByInviteCode({ code: "ABC123" });

    expect(getUserByInviteCode).toHaveBeenCalledWith("ABC123");
    expect(result).toEqual(mockUser);
  });
});
