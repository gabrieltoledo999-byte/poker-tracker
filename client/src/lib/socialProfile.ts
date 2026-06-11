export function slugifyProfileName(name: string | null | undefined): string {
  const normalized = String(name ?? "jogador")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return normalized || "jogador";
}

export function buildProfilePath(params: { id: number; name?: string | null }): string {
  const id = Number(params.id);
  const safeId = Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
  const slug = slugifyProfileName(params.name);
  return `/profile/${slug}-${safeId}`;
}

export function parseProfileIdFromUsername(username: string | undefined): number | null {
  const value = String(username ?? "").trim().toLowerCase();
  if (!value) return null;

  const match = value.match(/-(\d+)$/);
  if (match) {
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const fallback = Number(value);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}
