import { sql } from "drizzle-orm";
import { users } from "../drizzle/schema";

// Auth-critical queries should tolerate partially migrated production schemas.
export const authCompatUserSelect = {
  id: users.id,
  openId: users.openId,
  name: users.name,
  email: users.email,
  passwordHash: users.passwordHash,
  avatarUrl: users.avatarUrl,
  loginMethod: users.loginMethod,
  role: users.role,
  inviteCode: users.inviteCode,
  invitedBy: users.invitedBy,
  inviteCount: users.inviteCount,
  preferredPlayType: sql<"online" | "live" | null>`null`.as("preferredPlayType"),
  preferredPlatforms: sql<string | null>`null`.as("preferredPlatforms"),
  preferredFormats: sql<string | null>`null`.as("preferredFormats"),
  preferredBuyIns: sql<string | null>`null`.as("preferredBuyIns"),
  preferredBuyInsOnline: sql<string | null>`null`.as("preferredBuyInsOnline"),
  preferredBuyInsLive: sql<string | null>`null`.as("preferredBuyInsLive"),
  playsMultiPlatform: sql<number>`0`.as("playsMultiPlatform"),
  showInGlobalRanking: sql<number>`0`.as("showInGlobalRanking"),
  showInFriendsRanking: sql<number>`0`.as("showInFriendsRanking"),
  rankingConsentAnsweredAt: sql<Date | null>`null`.as("rankingConsentAnsweredAt"),
  playStyleAnsweredAt: sql<Date | null>`null`.as("playStyleAnsweredAt"),
  onboardingCompletedAt: sql<Date | null>`null`.as("onboardingCompletedAt"),
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  lastSignedIn: users.lastSignedIn,
};