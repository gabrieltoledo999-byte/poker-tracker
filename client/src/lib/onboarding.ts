export type OnboardingStatus = {
  complete: boolean;
  missing: string[];
};

const FORCED_ONBOARDING_REFRESH_AFTER_MS = 365 * 24 * 60 * 60 * 1000;
const CPF_OPTIONAL_EMAILS = new Set(["gu.antunez@gmail.com"]);

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function canSkipTaxDocument(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  return CPF_OPTIONAL_EMAILS.has(email);
}

export function evaluateOnboardingStatus(user: any, profile: any): OnboardingStatus {
  const missing: string[] = [];

  if (!user) {
    missing.push("user");
    return { complete: false, missing };
  }

  if (!hasText(user.avatarUrl)) missing.push("avatar");
  if (!profile || !hasText(profile.preferredPlayType)) missing.push("preferredPlayType");

  const preferredPlatforms = Array.isArray(profile?.preferredPlatforms) ? profile.preferredPlatforms : [];
  const preferredFormats = Array.isArray(profile?.preferredFormats) ? profile.preferredFormats : [];
  const preferredBuyInsOnline = Array.isArray(profile?.preferredBuyInsOnline) ? profile.preferredBuyInsOnline : [];
  const preferredBuyInsLive = Array.isArray(profile?.preferredBuyInsLive) ? profile.preferredBuyInsLive : [];

  if (preferredPlatforms.length === 0) missing.push("preferredPlatforms");
  if (preferredFormats.length === 0) missing.push("preferredFormats");
  if (preferredBuyInsOnline.length === 0) missing.push("preferredBuyInsOnline");
  if (preferredBuyInsLive.length === 0) missing.push("preferredBuyInsLive");

  if (!hasText(profile?.country)) missing.push("country");
  if (!hasText(profile?.stateRegion)) missing.push("stateRegion");
  if (!hasText(profile?.city)) missing.push("city");
  if (!canSkipTaxDocument(user) && !hasText(profile?.taxDocument)) missing.push("taxDocument");
  if (!hasText(user?.passwordHash)) missing.push("passwordHash");

  if (!profile?.rankingConsentAnsweredAt) missing.push("rankingConsentAnsweredAt");
  if (!profile?.locationConsentAt) missing.push("locationConsentAt");
  if (!profile?.onboardingCompletedAt) missing.push("onboardingCompletedAt");
  if (!profile?.onboardingReviewedAt) missing.push("onboardingReviewedAt");

  const reviewedAtMs = profile?.onboardingReviewedAt
    ? new Date(profile.onboardingReviewedAt).getTime()
    : Number.NaN;
  if (
    !Number.isFinite(reviewedAtMs) ||
    Date.now() - reviewedAtMs >= FORCED_ONBOARDING_REFRESH_AFTER_MS
  ) {
    missing.push("onboardingRefreshAnnual");
  }

  return { complete: missing.length === 0, missing };
}
