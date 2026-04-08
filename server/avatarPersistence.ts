export function shouldReplaceAvatar(params: {
  currentAvatarUrl?: string | null;
  incomingAvatarUrl?: string | null;
  source: "provider-sync" | "manual-update";
}) {
  const currentAvatarUrl = params.currentAvatarUrl?.trim() || "";
  const incomingAvatarUrl = params.incomingAvatarUrl?.trim() || "";

  if (!incomingAvatarUrl) return false;
  if (params.source === "manual-update") return true;
  if (!currentAvatarUrl) return true;
  return currentAvatarUrl === incomingAvatarUrl;
}
