import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChartBar,
  Clock3,
  Crown,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PUBLIC_LANDING_URL } from "@/const";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const DRIVE_STORAGE_KEY = "the-rail-company-drive-url";
const BRAZIL_STATES_GEOJSON_URL = "/maps/brazil-states.geojson";
const WORLD_GEOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const defaultDriveUrl = import.meta.env.VITE_THE_RAIL_DRIVE_URL || "https://drive.google.com/drive/folders/1F10cYfnFre-VoqzGiGbBZVZDamwOv5wb";

const BOARD_ACCESS_IDENTIFIERS = ["toleto", "hugo"];
const BOARD_ACCESS_EMAILS = ["gabriel.toledo999@gmail.com"];

function normalizeIdentityToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isBoardAdminUser(user: {
  role?: string | null;
  name?: string | null;
  email?: string | null;
  openId?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (String(user.role ?? "").toLowerCase() !== "admin") return false;

  const normalizedEmail = normalizeIdentityToken(user.email);
  if (normalizedEmail && BOARD_ACCESS_EMAILS.includes(normalizedEmail)) return true;

  const tokens = [user.name, user.email, user.openId].map(normalizeIdentityToken).filter(Boolean);
  return tokens.some((token) => BOARD_ACCESS_IDENTIFIERS.some((id) => token.includes(id)));
}

const folders = [
  {
    name: "Estrategia",
    description: "Visao da empresa, objetivos, decisoes importantes e roadmap.",
    items: ["Visao da empresa", "Objetivos", "Decisoes importantes", "Roadmap"],
  },
  {
    name: "Equipe",
    description: "Gestao de pessoas, cargos, responsabilidades e planilha principal.",
    items: ["Planilha principal da equipe", "Definicao de cargos", "Responsabilidades"],
  },
  {
    name: "Produto",
    description: "Funcionalidades, melhorias, feedbacks e bugs.",
    items: ["Ideias de funcionalidades", "Melhorias", "Feedbacks", "Bugs"],
  },
  {
    name: "Operacoes",
    description: "Tarefas, processos e organizacao interna.",
    items: ["Tarefas", "Processos", "Organizacao interna"],
  },
  {
    name: "Financeiro",
    description: "Custos, receitas e planejamento financeiro para crescimento.",
    items: ["Custos", "Receitas", "Planejamento financeiro"],
  },
];

const LEVEL_DEFINITIONS = [
  { key: "N1", label: "Recreativo", visual: "A", color: "#6366f1" },
  { key: "N2", label: "Grinder", visual: "C", color: "#22c55e" },
  { key: "N3", label: "Reg", visual: "S", color: "#9ca3af" },
  { key: "N4", label: "Mid Stakes", visual: "D", color: "#f59e0b" },
  { key: "N5", label: "High Stakes", visual: "H", color: "#ef4444" },
  { key: "N6", label: "High Roller", visual: "HR", color: "#eab308" },
  { key: "N7", label: "The Edge", visual: "AE", color: "#a855f7" },
];

function normalizeLeagueToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeExternalUrl(rawUrl: string): string {
  const value = String(rawUrl ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function openInNewTab(url: string): boolean {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) return false;
  const popup = window.open(normalized, "_blank", "noopener,noreferrer");
  if (popup) {
    popup.opener = null;
    return true;
  }
  window.location.assign(normalized);
  return false;
}

function inferLevelKey(userItem: any): string {
  const role = normalizeLeagueToken(userItem?.role);
  if (role === "admin" || role === "developer" || role === "system_ai_service") {
    return "N7";
  }

  const rawTier = normalizeLeagueToken(userItem?.tier);
  if (rawTier.includes("high roller")) return "N7";
  if (rawTier.includes("the edge") || rawTier.includes("edge")) return "N6";
  if (rawTier.includes("high stakes")) return "N5";
  if (rawTier.includes("mid stakes")) return "N4";
  if (rawTier === "reg" || rawTier.includes("regular")) return "N3";
  if (rawTier.includes("grinder")) return "N2";
  if (rawTier.includes("recreativo")) return "N1";

  return "N7";
}

function getAvatarSrc(entry: { id?: number; name?: string; email?: string; avatarUrl?: string }): string {
  if (entry.avatarUrl) return entry.avatarUrl;
  const seed = encodeURIComponent(String(entry.id ?? entry.email ?? entry.name ?? "the-rail"));
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

function interpolateChannel(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function mixColor(start: [number, number, number], end: [number, number, number], t: number): string {
  const r = interpolateChannel(start[0], end[0], t);
  const g = interpolateChannel(start[1], end[1], t);
  const b = interpolateChannel(start[2], end[2], t);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeHeatRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(1, Math.pow(value, 0.62)));
}

function getDensityColor(ratio: number): string {
  const t = normalizeHeatRatio(ratio);
  if (t <= 0.5) {
    return mixColor([8, 47, 73], [34, 211, 238], t / 0.5);
  }
  if (t <= 0.8) {
    return mixColor([34, 211, 238], [245, 158, 11], (t - 0.5) / 0.3);
  }
  return mixColor([245, 158, 11], [239, 68, 68], (t - 0.8) / 0.2);
}

const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  brasil: { lat: -14.235, lng: -51.9253 },
  brazil: { lat: -14.235, lng: -51.9253 },
  portugal: { lat: 39.3999, lng: -8.2245 },
  espanha: { lat: 40.4637, lng: -3.7492 },
  spain: { lat: 40.4637, lng: -3.7492 },
  argentina: { lat: -38.4161, lng: -63.6167 },
  chile: { lat: -35.6751, lng: -71.543 },
  mexico: { lat: 23.6345, lng: -102.5528 },
  usa: { lat: 37.0902, lng: -95.7129 },
  "estados unidos": { lat: 37.0902, lng: -95.7129 },
  "united states": { lat: 37.0902, lng: -95.7129 },
  canada: { lat: 56.1304, lng: -106.3468 },
  "reino unido": { lat: 55.3781, lng: -3.436 },
  uk: { lat: 55.3781, lng: -3.436 },
  france: { lat: 46.2276, lng: 2.2137 },
  franca: { lat: 46.2276, lng: 2.2137 },
  alemanha: { lat: 51.1657, lng: 10.4515 },
  germany: { lat: 51.1657, lng: 10.4515 },
  italia: { lat: 41.8719, lng: 12.5674 },
  italy: { lat: 41.8719, lng: 12.5674 },
  india: { lat: 20.5937, lng: 78.9629 },
  china: { lat: 35.8617, lng: 104.1954 },
  japao: { lat: 36.2048, lng: 138.2529 },
  japan: { lat: 36.2048, lng: 138.2529 },
  australia: { lat: -25.2744, lng: 133.7751 },
  suica: { lat: 46.8182, lng: 8.2275 },
  switzerland: { lat: 46.8182, lng: 8.2275 },
  suisse: { lat: 46.8182, lng: 8.2275 },
  schweiz: { lat: 46.8182, lng: 8.2275 },
};

// Catalog of city centroids (real coordinates) keyed by `${countryToken}|${cityToken}`.
// Used as a high-precision fallback when the user has no recorded geo point,
// so cities like "Sao Paulo" or "Betim" appear on their actual locations
// instead of stacking at the country centroid (which can fall in the ocean
// for some projections or when the country token is not recognised).
const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Brasil — capitais
  "brasil|sao paulo": { lat: -23.5505, lng: -46.6333 },
  "brasil|rio de janeiro": { lat: -22.9068, lng: -43.1729 },
  "brasil|belo horizonte": { lat: -19.9167, lng: -43.9345 },
  "brasil|brasilia": { lat: -15.7939, lng: -47.8828 },
  "brasil|salvador": { lat: -12.9714, lng: -38.5014 },
  "brasil|fortaleza": { lat: -3.7172, lng: -38.5433 },
  "brasil|curitiba": { lat: -25.4284, lng: -49.2733 },
  "brasil|recife": { lat: -8.0476, lng: -34.877 },
  "brasil|porto alegre": { lat: -30.0346, lng: -51.2177 },
  "brasil|manaus": { lat: -3.119, lng: -60.0217 },
  "brasil|belem": { lat: -1.4554, lng: -48.4898 },
  "brasil|goiania": { lat: -16.6864, lng: -49.2643 },
  "brasil|florianopolis": { lat: -27.5949, lng: -48.5482 },
  "brasil|vitoria": { lat: -20.3155, lng: -40.3128 },
  "brasil|natal": { lat: -5.7945, lng: -35.211 },
  "brasil|joao pessoa": { lat: -7.1195, lng: -34.845 },
  "brasil|campo grande": { lat: -20.4697, lng: -54.6201 },
  "brasil|cuiaba": { lat: -15.6014, lng: -56.0979 },
  "brasil|teresina": { lat: -5.0892, lng: -42.8019 },
  "brasil|sao luis": { lat: -2.5307, lng: -44.3068 },
  "brasil|aracaju": { lat: -10.9472, lng: -37.0731 },
  "brasil|maceio": { lat: -9.6498, lng: -35.7089 },
  "brasil|palmas": { lat: -10.1845, lng: -48.3336 },
  "brasil|porto velho": { lat: -8.7619, lng: -63.9039 },
  "brasil|boa vista": { lat: 2.8235, lng: -60.6758 },
  "brasil|macapa": { lat: 0.0356, lng: -51.0705 },
  "brasil|rio branco": { lat: -9.9747, lng: -67.81 },
  // Brasil — demais cidades relevantes
  "brasil|betim": { lat: -19.9678, lng: -44.1989 },
  "brasil|contagem": { lat: -19.932, lng: -44.0535 },
  "brasil|uberlandia": { lat: -18.9186, lng: -48.2772 },
  "brasil|juiz de fora": { lat: -21.7642, lng: -43.3492 },
  "brasil|montes claros": { lat: -16.7286, lng: -43.8582 },
  "brasil|campinas": { lat: -22.9099, lng: -47.0626 },
  "brasil|guarulhos": { lat: -23.4538, lng: -46.5333 },
  "brasil|santos": { lat: -23.9608, lng: -46.3331 },
  "brasil|sao bernardo do campo": { lat: -23.6914, lng: -46.5646 },
  "brasil|santo andre": { lat: -23.6633, lng: -46.5311 },
  "brasil|osasco": { lat: -23.5325, lng: -46.7917 },
  "brasil|sao jose dos campos": { lat: -23.2237, lng: -45.9009 },
  "brasil|sorocaba": { lat: -23.5015, lng: -47.4526 },
  "brasil|ribeirao preto": { lat: -21.1775, lng: -47.8103 },
  "brasil|niteroi": { lat: -22.8833, lng: -43.1036 },
  "brasil|nova iguacu": { lat: -22.7556, lng: -43.4603 },
  "brasil|duque de caxias": { lat: -22.7858, lng: -43.3115 },
  "brasil|sao goncalo": { lat: -22.8267, lng: -43.0537 },
  "brasil|campos dos goytacazes": { lat: -21.7642, lng: -41.3296 },
  "brasil|londrina": { lat: -23.3045, lng: -51.1696 },
  "brasil|maringa": { lat: -23.4205, lng: -51.9333 },
  "brasil|joinville": { lat: -26.3045, lng: -48.8487 },
  "brasil|blumenau": { lat: -26.9194, lng: -49.0661 },
  "brasil|caxias do sul": { lat: -29.1685, lng: -51.1796 },
  "brasil|pelotas": { lat: -31.7654, lng: -52.3376 },
  "brasil|feira de santana": { lat: -12.2664, lng: -38.9663 },
  "brasil|aparecida de goiania": { lat: -16.8203, lng: -49.2469 },
  "brasil|ananindeua": { lat: -1.3656, lng: -48.3725 },
  // Internacional — alguns polos relevantes
  "portugal|lisboa": { lat: 38.7223, lng: -9.1393 },
  "portugal|porto": { lat: 41.1579, lng: -8.6291 },
  "argentina|buenos aires": { lat: -34.6037, lng: -58.3816 },
  "chile|santiago": { lat: -33.4489, lng: -70.6693 },
  "mexico|cidade do mexico": { lat: 19.4326, lng: -99.1332 },
  "mexico|ciudad de mexico": { lat: 19.4326, lng: -99.1332 },
  "espanha|madrid": { lat: 40.4168, lng: -3.7038 },
  "espanha|barcelona": { lat: 41.3851, lng: 2.1734 },
  "spain|madrid": { lat: 40.4168, lng: -3.7038 },
  "spain|barcelona": { lat: 41.3851, lng: 2.1734 },
  "usa|new york": { lat: 40.7128, lng: -74.006 },
  "usa|nova york": { lat: 40.7128, lng: -74.006 },
  "usa|las vegas": { lat: 36.1699, lng: -115.1398 },
  "usa|miami": { lat: 25.7617, lng: -80.1918 },
  "usa|los angeles": { lat: 34.0522, lng: -118.2437 },
  "estados unidos|new york": { lat: 40.7128, lng: -74.006 },
  "estados unidos|las vegas": { lat: 36.1699, lng: -115.1398 },
  "estados unidos|miami": { lat: 25.7617, lng: -80.1918 },
  "united states|new york": { lat: 40.7128, lng: -74.006 },
  "united states|las vegas": { lat: 36.1699, lng: -115.1398 },
  "canada|toronto": { lat: 43.6532, lng: -79.3832 },
  "canada|montreal": { lat: 45.5017, lng: -73.5673 },
  "canada|vancouver": { lat: 49.2827, lng: -123.1207 },
  "franca|paris": { lat: 48.8566, lng: 2.3522 },
  "france|paris": { lat: 48.8566, lng: 2.3522 },
  "alemanha|berlim": { lat: 52.52, lng: 13.405 },
  "germany|berlin": { lat: 52.52, lng: 13.405 },
  "italia|roma": { lat: 41.9028, lng: 12.4964 },
  "italia|milao": { lat: 45.4642, lng: 9.19 },
  "italy|rome": { lat: 41.9028, lng: 12.4964 },
  "italy|milan": { lat: 45.4642, lng: 9.19 },
  "reino unido|londres": { lat: 51.5074, lng: -0.1278 },
  "uk|london": { lat: 51.5074, lng: -0.1278 },
  "japao|toquio": { lat: 35.6762, lng: 139.6503 },
  "japan|tokyo": { lat: 35.6762, lng: 139.6503 },
  "suica|zurique": { lat: 47.3769, lng: 8.5417 },
  "suica|genebra": { lat: 46.2044, lng: 6.1432 },
  "switzerland|zurich": { lat: 47.3769, lng: 8.5417 },
  "switzerland|geneva": { lat: 46.2044, lng: 6.1432 },
};

function resolveCityCentroid(countryToken: string, cityToken: string): { lat: number; lng: number } | null {
  if (!countryToken || !cityToken) return null;
  const direct = CITY_CENTROIDS[`${countryToken}|${cityToken}`];
  if (direct) return direct;
  // Try fallback aliases for Brazil token variants.
  if (countryToken === "brazil" || countryToken === "br") {
    const aliased = CITY_CENTROIDS[`brasil|${cityToken}`];
    if (aliased) return aliased;
  }
  return null;
}

function isBrazilToken(value: unknown): boolean {
  const token = normalizeLeagueToken(value);
  return token === "br" || token === "brasil" || token === "brazil";
}

function parseUserGeoPoint(entry: any): { lat: number; lng: number } | null {
  const rawLat = Number(entry?.locationLatE6);
  const rawLng = Number(entry?.locationLngE6);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return null;
  // Null Island (0,0) is the canonical "unset" marker; reject so we fall back
  // to city/state/country centroids instead of landing in the Atlantic.
  if (rawLat === 0 && rawLng === 0) return null;

  // Detect storage unit: microdegrees (E6) have magnitudes in the thousands or
  // millions; legacy rows sometimes stored raw decimal degrees. Decide per row
  // so both conventions work without polluting the average.
  const looksLikeE6 = Math.abs(rawLat) >= 1000 || Math.abs(rawLng) >= 1000;
  let lat = looksLikeE6 ? rawLat / 1_000_000 : rawLat;
  let lng = looksLikeE6 ? rawLng / 1_000_000 : rawLng;

  // Generic swapped coordinate correction.
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
  }

  // Specific correction for Brazil users if coordinates were saved inverted.
  if (isBrazilToken(entry?.country)) {
    const inBrazilBounds = lat >= -34.5 && lat <= 6 && lng >= -74.5 && lng <= -34;
    const swappedWouldFitBrazil = lng >= -34.5 && lng <= 6 && lat >= -74.5 && lat <= -34;
    if (!inBrazilBounds && swappedWouldFitBrazil) {
      [lat, lng] = [lng, lat];
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Reject suspiciously-near-zero coordinates — almost certainly garbage from
  // a row where the geo fields were never populated correctly. Otherwise this
  // single bad row would pull a city's average straight to the ocean.
  if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return null;
  // For Brazil-tagged users, also reject points that fall clearly outside the
  // country bounding box; same logic as above — they are bogus and would
  // distort the heatmap.
  if (isBrazilToken(entry?.country)) {
    const inBrazilBounds = lat >= -34.5 && lat <= 6 && lng >= -74.5 && lng <= -34;
    if (!inBrazilBounds) return null;
  }
  return { lat, lng };
}

const BRAZIL_STATE_CENTROIDS: Record<string, { lat: number; lng: number; label: string }> = {
  ac: { lat: -8.77, lng: -70.55, label: "Acre" },
  al: { lat: -9.62, lng: -36.82, label: "Alagoas" },
  ap: { lat: 1.41, lng: -51.77, label: "Amapa" },
  am: { lat: -3.1, lng: -60.02, label: "Amazonas" },
  ba: { lat: -12.97, lng: -38.5, label: "Bahia" },
  ce: { lat: -3.72, lng: -38.54, label: "Ceara" },
  df: { lat: -15.78, lng: -47.93, label: "Distrito Federal" },
  es: { lat: -20.31, lng: -40.34, label: "Espirito Santo" },
  go: { lat: -16.67, lng: -49.25, label: "Goias" },
  ma: { lat: -2.55, lng: -44.3, label: "Maranhao" },
  mt: { lat: -15.6, lng: -56.1, label: "Mato Grosso" },
  ms: { lat: -20.45, lng: -54.62, label: "Mato Grosso do Sul" },
  mg: { lat: -19.92, lng: -43.94, label: "Minas Gerais" },
  pa: { lat: -1.45, lng: -48.49, label: "Para" },
  pb: { lat: -7.12, lng: -34.86, label: "Paraiba" },
  pr: { lat: -25.42, lng: -49.27, label: "Parana" },
  pe: { lat: -8.05, lng: -34.9, label: "Pernambuco" },
  pi: { lat: -5.09, lng: -42.8, label: "Piaui" },
  rj: { lat: -22.91, lng: -43.17, label: "Rio de Janeiro" },
  rn: { lat: -5.79, lng: -35.21, label: "Rio Grande do Norte" },
  rs: { lat: -30.03, lng: -51.23, label: "Rio Grande do Sul" },
  ro: { lat: -8.76, lng: -63.9, label: "Rondonia" },
  rr: { lat: 2.82, lng: -60.67, label: "Roraima" },
  sc: { lat: -27.59, lng: -48.55, label: "Santa Catarina" },
  sp: { lat: -23.55, lng: -46.63, label: "Sao Paulo" },
  se: { lat: -10.91, lng: -37.07, label: "Sergipe" },
  to: { lat: -10.25, lng: -48.33, label: "Tocantins" },
};

const BRAZIL_STATE_ALIASES: Record<string, string> = {
  acre: "ac",
  alagoas: "al",
  amapa: "ap",
  amazonas: "am",
  bahia: "ba",
  ceara: "ce",
  "distrito federal": "df",
  "espirito santo": "es",
  goias: "go",
  maranhao: "ma",
  "mato grosso": "mt",
  "mato grosso do sul": "ms",
  "minas gerais": "mg",
  para: "pa",
  paraiba: "pb",
  parana: "pr",
  pernambuco: "pe",
  piaui: "pi",
  "rio de janeiro": "rj",
  "rio grande do norte": "rn",
  "rio grande do sul": "rs",
  rondonia: "ro",
  roraima: "rr",
  "santa catarina": "sc",
  "sao paulo": "sp",
  sergipe: "se",
  tocantins: "to",
};

const BRAZIL_STATE_IBGE_CODE: Record<string, string> = {
  ac: "12",
  al: "27",
  ap: "16",
  am: "13",
  ba: "29",
  ce: "23",
  df: "53",
  es: "32",
  go: "52",
  ma: "21",
  mt: "51",
  ms: "50",
  mg: "31",
  pa: "15",
  pb: "25",
  pr: "41",
  pe: "26",
  pi: "22",
  rj: "33",
  rn: "24",
  rs: "43",
  ro: "11",
  rr: "14",
  sc: "42",
  sp: "35",
  se: "28",
  to: "17",
};

function resolveBrazilStateCode(value: unknown): string | null {
  const token = normalizeLeagueToken(value).replace(/\./g, "");
  if (!token) return null;
  if (token.length === 2 && BRAZIL_STATE_CENTROIDS[token]) return token;
  return BRAZIL_STATE_ALIASES[token] ?? null;
}

function getCanonicalStateToken(country: unknown, stateRegion: unknown): string {
  if (isBrazilToken(country)) {
    const code = resolveBrazilStateCode(stateRegion);
    if (code) return code;
  }
  return normalizeLeagueToken(stateRegion);
}

function getCanonicalStateLabel(country: unknown, stateRegion: unknown): string {
  const raw = String(stateRegion ?? "").trim();
  if (isBrazilToken(country)) {
    const code = resolveBrazilStateCode(raw);
    if (code) return BRAZIL_STATE_CENTROIDS[code]?.label ?? (raw || "Sem estado");
  }
  return raw || "Sem estado";
}

function hashTokenToUnit(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

// ───────────────────────────────────────────────────────────────────────────
// Geocoding de cidades via Nominatim (OpenStreetMap) com cache em localStorage.
// Garante que QUALQUER cidade cadastrada apareça no ponto geográfico real, e
// não no centroide do país/estado. Respeita a política do Nominatim usando uma
// fila com 1 requisição por ~1.1s e cacheando resultados perpetuamente.
// ───────────────────────────────────────────────────────────────────────────
type CityCoord = { lat: number; lng: number };
type CityCoordCacheEntry = CityCoord | null;
type CityCoordCache = Record<string, CityCoordCacheEntry>;

const CITY_COORD_CACHE_KEY = "admin.cityCoordCache.v1";

function loadCityCoordCache(): CityCoordCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CITY_COORD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CityCoordCache;
  } catch {
    return {};
  }
}

function saveCityCoordCache(cache: CityCoordCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_COORD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota errors */
  }
}

function buildCityCacheKey(country: string, stateRegion: string, city: string): string {
  const ct = normalizeLeagueToken(country);
  const st = getCanonicalStateToken(country, stateRegion);
  const ci = normalizeLeagueToken(city);
  if (!ci) return "";
  return `${ct}|${st}|${ci}`;
}

async function geocodeCityViaNominatim(
  country: string,
  stateRegion: string,
  city: string,
  signal: AbortSignal,
): Promise<CityCoord | null> {
  const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "0" });
  // Use structured query for better precision; falls back to "q" if no state.
  if (city) params.set("city", city);
  if (stateRegion) params.set("state", stateRegion);
  if (country) params.set("country", country);
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const resp = await fetch(url, {
    signal,
    headers: { "Accept-Language": "pt-BR,pt;q=0.8,en;q=0.6" },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function useGeocodedCityCoords(
  targets: Array<{ country: string; stateRegion: string; city: string }>,
): CityCoordCache {
  const [cache, setCache] = useState<CityCoordCache>(() => loadCityCoordCache());
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const uniqueTargets = useMemo(() => {
    const map = new Map<string, { key: string; country: string; stateRegion: string; city: string }>();
    for (const t of targets) {
      const key = buildCityCacheKey(t.country, t.stateRegion, t.city);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, ...t });
    }
    return Array.from(map.values());
  }, [targets]);

  const targetsKey = useMemo(() => uniqueTargets.map((t) => t.key).join("\n"), [uniqueTargets]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      for (const t of uniqueTargets) {
        if (cancelled) return;
        if (t.key in cacheRef.current) continue;
        let coords: CityCoord | null = null;
        try {
          coords = await geocodeCityViaNominatim(t.country, t.stateRegion, t.city, controller.signal);
        } catch {
          coords = null;
        }
        if (cancelled) return;
        setCache((prev) => {
          const next = { ...prev, [t.key]: coords };
          saveCityCoordCache(next);
          return next;
        });
        // Respeita o limite de ~1 req/s da Nominatim (uso público).
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey]);

  return cache;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [driveUrl, setDriveUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [resetTargetUserId, setResetTargetUserId] = useState<number | null>(null);
  const [resetConfirmationText, setResetConfirmationText] = useState("");
  const [deleteTargetUserId, setDeleteTargetUserId] = useState<number | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [hoveredBrazilState, setHoveredBrazilState] = useState<{ stateLabel: string; stateCode: string; count: number } | null>(null);
  const [hoveredBrazilCity, setHoveredBrazilCity] = useState<{ cityLabel: string; stateCode: string; count: number } | null>(null);
  const [hoveredWorldPoint, setHoveredWorldPoint] = useState<{ cityLabel: string; stateLabel: string; countryLabel: string; count: number; clusterSize?: number } | null>(null);
  const [worldMapCenter, setWorldMapCenter] = useState<[number, number]>([0, 12]);
  const [worldMapZoom, setWorldMapZoom] = useState(1);
  const [selectedBrazilState, setSelectedBrazilState] = useState<string | null>(null);
  const [brazilMapCenter, setBrazilMapCenter] = useState<[number, number]>([-54, -15]);
  const [brazilMapZoom, setBrazilMapZoom] = useState(1);
  const [selectedStateMunicipalGeo, setSelectedStateMunicipalGeo] = useState<any | null>(null);
  const [loadingMunicipalGeo, setLoadingMunicipalGeo] = useState(false);
  const [worldSelectedStateMunicipalGeo, setWorldSelectedStateMunicipalGeo] = useState<any | null>(null);
  const [loadingWorldMunicipalGeo, setLoadingWorldMunicipalGeo] = useState(false);

  const isBoardAdmin = isBoardAdminUser(user as any);

  const companyOverviewQuery = trpc.admin.companyOverview.useQuery(undefined, {
    enabled: !loading && isBoardAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const onlineUsersQuery = trpc.admin.onlineUsers.useQuery(undefined, {
    enabled: !loading && isBoardAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return (companyOverviewQuery.data?.users ?? []).find((entry: any) => Number(entry.id) === selectedUserId) ?? null;
  }, [companyOverviewQuery.data?.users, selectedUserId]);

  const resetTargetUser = useMemo(() => {
    if (!resetTargetUserId) return null;
    return (companyOverviewQuery.data?.users ?? []).find((entry: any) => Number(entry.id) === resetTargetUserId) ?? null;
  }, [companyOverviewQuery.data?.users, resetTargetUserId]);

  const deleteTargetUser = useMemo(() => {
    if (!deleteTargetUserId) return null;
    return (companyOverviewQuery.data?.users ?? []).find((entry: any) => Number(entry.id) === deleteTargetUserId) ?? null;
  }, [companyOverviewQuery.data?.users, deleteTargetUserId]);

  const resetExpectedPhrase = resetTargetUserId ? `RESETAR ${resetTargetUserId}` : "";
  const deleteExpectedPhrase = deleteTargetUserId ? `EXCLUIR ${deleteTargetUserId}` : "";

  const diagnoseSearchValue = useMemo(() => {
    if (!selectedUser) return "";
    return String(selectedUser.email || selectedUser.name || selectedUser.id || "").trim();
  }, [selectedUser]);

  const diagnoseUserQuery = trpc.admin.diagnoseUser.useQuery(
    { search: diagnoseSearchValue },
    {
      enabled: !loading && isBoardAdmin && diagnoseSearchValue.length >= 2,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const selectedUserHistoryQuery = trpc.memory.playerHistoricalProfileByUserId.useQuery(
    { userId: Number(selectedUserId ?? 0) },
    {
      enabled: !loading && isBoardAdmin && Number(selectedUserId ?? 0) > 0,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const selectedUserPresenceQuery = trpc.admin.userPresenceSummary.useQuery(
    { userId: Number(selectedUserId ?? 0) },
    {
      enabled: !loading && isBoardAdmin && Number(selectedUserId ?? 0) > 0,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const [presenceLoadProgress, setPresenceLoadProgress] = useState(18);
  const [adminLoadProgress, setAdminLoadProgress] = useState(14);

  useEffect(() => {
    if (!selectedUserPresenceQuery.isLoading) {
      setPresenceLoadProgress(18);
      return;
    }

    const intervalId = window.setInterval(() => {
      setPresenceLoadProgress((prev) => (prev >= 90 ? 22 : prev + 8));
    }, 180);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedUserId, selectedUserPresenceQuery.isLoading]);

  const loadingSections = useMemo(() => {
    return [
      { key: "overview", label: "Visao geral da empresa", loading: companyOverviewQuery.isLoading },
      { key: "online", label: "Usuarios online", loading: onlineUsersQuery.isLoading },
      { key: "presence", label: "Presenca do usuario", loading: selectedUserPresenceQuery.isLoading },
      { key: "diagnose", label: "Diagnostico tecnico", loading: diagnoseUserQuery.isLoading },
      { key: "history", label: "Historico por posicao", loading: selectedUserHistoryQuery.isLoading },
      { key: "mapBr", label: "Mapa Brasil", loading: loadingMunicipalGeo },
      { key: "mapWorld", label: "Mapa global", loading: loadingWorldMunicipalGeo },
    ];
  }, [
    companyOverviewQuery.isLoading,
    onlineUsersQuery.isLoading,
    selectedUserPresenceQuery.isLoading,
    diagnoseUserQuery.isLoading,
    selectedUserHistoryQuery.isLoading,
    loadingMunicipalGeo,
    loadingWorldMunicipalGeo,
  ]);

  const activeLoadingSections = loadingSections.filter((section) => section.loading);

  useEffect(() => {
    if (activeLoadingSections.length === 0) {
      setAdminLoadProgress(100);
      const timeoutId = window.setTimeout(() => setAdminLoadProgress(14), 380);
      return () => window.clearTimeout(timeoutId);
    }

    const intervalId = window.setInterval(() => {
      setAdminLoadProgress((prev) => (prev >= 92 ? 38 : prev + 7));
    }, 170);

    return () => window.clearInterval(intervalId);
  }, [activeLoadingSections.length]);

  const resetUserDataMutation = trpc.admin.resetUserData.useMutation({
    onSuccess: async (result) => {
      const totalDeleted = Object.values(result.deleted ?? {}).reduce((sum, current) => sum + Number(current ?? 0), 0);
      await Promise.all([
        utils.admin.companyOverview.invalidate(),
        utils.admin.onlineUsers.invalidate(),
        utils.admin.userPresenceSummary.invalidate(),
        utils.admin.diagnoseUser.invalidate(),
        utils.memory.playerHistoricalProfileByUserId.invalidate(),
      ]);
      toast.success("Conta resetada com sucesso", {
        description: `${totalDeleted} registros limpos. A conta continua ativa para novo uso.`,
      });
      setResetTargetUserId(null);
      setResetConfirmationText("");
    },
    onError: (error) => {
      toast.error("Falha ao resetar conta", { description: error.message });
    },
  });

  const deleteUserAccountMutation = trpc.admin.deleteUserAccount.useMutation({
    onSuccess: async (result) => {
      const totalDeleted = Object.values(result.deleted ?? {}).reduce((sum, current) => sum + Number(current ?? 0), 0);
      await Promise.all([
        utils.admin.companyOverview.invalidate(),
        utils.admin.onlineUsers.invalidate(),
        utils.admin.userPresenceSummary.invalidate(),
        utils.admin.diagnoseUser.invalidate(),
        utils.memory.playerHistoricalProfileByUserId.invalidate(),
      ]);
      if (selectedUserId && Number(selectedUserId) === Number(result.userId)) {
        setSelectedUserId(null);
      }
      toast.success("Usuário excluído com sucesso", {
        description: `${totalDeleted} registros removidos e a conta foi apagada.`,
      });
      setDeleteTargetUserId(null);
      setDeleteConfirmationText("");
    },
    onError: (error) => {
      toast.error("Falha ao excluir usuário", { description: error.message });
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!isBoardAdminUser(user as any)) {
      toast.error("Acesso restrito a diretoria.");
      setLocation("/");
      return;
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    const saved = localStorage.getItem(DRIVE_STORAGE_KEY) || defaultDriveUrl;
    setDriveUrl(saved);
    setDraftUrl(saved);
  }, []);

  const handleSaveDriveUrl = () => {
    const cleaned = draftUrl.trim();
    localStorage.setItem(DRIVE_STORAGE_KEY, cleaned);
    setDriveUrl(cleaned);
    toast.success("Link do Google Drive salvo na aba Administracao.");
  };

  const handleOpenDrive = () => {
    if (!driveUrl) {
      toast.error("Defina o link do Google Drive antes de abrir.");
      return;
    }
    openInNewTab(driveUrl);
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not board admin
  if (!user || !isBoardAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md border-destructive/50">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <Lock className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription className="mt-2 text-base font-semibold text-destructive">
              Acesso restrito a diretoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")} className="w-full">
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = companyOverviewQuery.data;
  const users = overview?.users ?? [];
  const totals = overview?.totals;

  const createdInLast30Days = useMemo(() => {
    const now = Date.now();
    return users.filter((u: any) => {
      if (!u.createdAt) return false;
      const createdAt = new Date(u.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;
      return now - createdAt <= 30 * 24 * 60 * 60 * 1000;
    }).length;
  }, [users]);

  const usersOnline = Number(onlineUsersQuery.data?.onlineNow ?? totals?.onlineNow ?? 0);
  const totalUsers = Number(totals?.totalUsers ?? 0);
  const withEmail = Number(totals?.withEmail ?? 0);
  const withAvatar = Number(totals?.withAvatar ?? 0);

  const filteredUsers = useMemo(() => {
    const token = normalizeLeagueToken(userSearch);
    if (!token) return users;
    return users.filter((entry: any) => {
      const haystack = [
        entry.id,
        entry.name,
        entry.email,
        entry.openId,
        entry.role,
      ]
        .map((value) => normalizeLeagueToken(value))
        .join(" ");
      return haystack.includes(token);
    });
  }, [users, userSearch]);

  useEffect(() => {
    if (filteredUsers.length === 0) {
      setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !filteredUsers.some((entry: any) => Number(entry.id) === selectedUserId)) {
      setSelectedUserId(Number(filteredUsers[0].id));
    }
  }, [filteredUsers, selectedUserId]);

  const latestUsers = useMemo(() => {
    return [...filteredUsers].slice(0, 20);
  }, [filteredUsers]);

  const formatDateOnly = (value: string | Date | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatDurationMinutes = (value: number | null | undefined) => {
    const totalMinutes = Math.max(0, Math.round(Number(value ?? 0)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}min`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}min`;
  };

  const formatPercent = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;

  const activityRows = useMemo(() => {
    return users
      .filter((u: any) => Boolean(u.lastSignedIn))
      .sort((a: any, b: any) => {
        const aTime = a.lastSignedIn ? new Date(a.lastSignedIn).getTime() : 0;
        const bTime = b.lastSignedIn ? new Date(b.lastSignedIn).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [users]);

  const levelCards = useMemo(() => {
    const countByLevel = new Map<string, number>();
    for (const def of LEVEL_DEFINITIONS) {
      countByLevel.set(def.key, 0);
    }

    for (const item of users) {
      const key = inferLevelKey(item);
      countByLevel.set(key, Number(countByLevel.get(key) ?? 0) + 1);
    }

    return LEVEL_DEFINITIONS.map((def) => {
      const count = Number(countByLevel.get(def.key) ?? 0);
      const pct = totalUsers > 0 ? (count / totalUsers) * 100 : 0;
      return {
        ...def,
        count,
        pct,
      };
    });
  }, [users, totalUsers]);

  const levelChartData = useMemo(() => {
    return levelCards
      .filter((item) => item.count > 0)
      .map((item) => ({
        name: `${item.key} ${item.label}`,
        value: item.count,
        fill: item.color,
      }));
  }, [levelCards]);

  const topCountries = useMemo(() => {
    const byCountry = new Map<string, number>();
    for (const entry of users) {
      const country = String((entry as any).country ?? "").trim();
      if (!country) continue;
      byCountry.set(country, Number(byCountry.get(country) ?? 0) + 1);
    }
    return Array.from(byCountry.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [users]);

  // Lista única de cidades cadastradas → consulta lat/lng real via Nominatim (cacheada).
  const geocodeTargets = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ country: string; stateRegion: string; city: string }> = [];
    for (const entry of users as any[]) {
      const country = String(entry?.country ?? "").trim();
      const stateRegion = String(entry?.stateRegion ?? "").trim();
      const city = String(entry?.city ?? "").trim();
      if (!city) continue;
      const key = buildCityCacheKey(country, stateRegion, city);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ country, stateRegion, city });
    }
    return list;
  }, [users]);

  const geocodedCityCoords = useGeocodedCityCoords(geocodeTargets);

  const globalHeatPoints = useMemo(() => {
    const grouped = new Map<string, {
      countryLabel: string;
      stateLabel: string;
      cityLabel: string;
      count: number;
      latSum: number;
      lngSum: number;
      coordCount: number;
      fallbackLat: number;
      fallbackLng: number;
    }>();

    for (const entry of users as any[]) {
      const rawCountryLabel = String(entry?.country ?? "").trim();
      if (!rawCountryLabel) continue;

      // Canonicalize country so "Brasil", "Brazil" e "BR" agrupem como o mesmo polo.
      const countryLabel = isBrazilToken(rawCountryLabel) ? "Brasil" : rawCountryLabel;
      const rawStateLabel = String(entry?.stateRegion ?? "").trim() || "Sem estado";
      const stateLabel = getCanonicalStateLabel(countryLabel, rawStateLabel);
      const cityLabel = String(entry?.city ?? "").trim() || "Sem cidade";
      const countryToken = isBrazilToken(rawCountryLabel) ? "brasil" : normalizeLeagueToken(countryLabel);
      const stateToken = getCanonicalStateToken(countryLabel, rawStateLabel);
      const cityToken = normalizeLeagueToken(cityLabel);
      const key = `${countryToken}|${stateToken}|${cityToken}`;

      // Best-effort fallback when the user has no recorded geo point:
      // 1) Geocoded coordinate from Nominatim (resolved on the client and cached).
      // 2) Known city centroid (matches real coordinates of e.g. Sao Paulo, Betim).
      // 3) Brazilian state centroid (when country is Brazil and stateRegion is known).
      // 4) Country centroid.
      let fallback: { lat: number; lng: number } | null = null;
      const geocodeKey = buildCityCacheKey(countryLabel, String((entry as any).stateRegion ?? ""), cityLabel);
      if (geocodeKey && geocodedCityCoords[geocodeKey]) {
        fallback = geocodedCityCoords[geocodeKey];
      }
      if (!fallback) fallback = resolveCityCentroid(countryToken, cityToken);
      if (!fallback && isBrazilToken(countryLabel)) {
        const stateCode = resolveBrazilStateCode((entry as any).stateRegion);
        if (stateCode) {
          const centroid = BRAZIL_STATE_CENTROIDS[stateCode];
          if (centroid) fallback = { lat: centroid.lat, lng: centroid.lng };
        }
      }
      if (!fallback) fallback = COUNTRY_CENTROIDS[countryToken] ?? null;

      const current = grouped.get(key) ?? {
        countryLabel,
        stateLabel,
        cityLabel,
        count: 0,
        latSum: 0,
        lngSum: 0,
        coordCount: 0,
        fallbackLat: fallback?.lat ?? Number.NaN,
        fallbackLng: fallback?.lng ?? Number.NaN,
      };

      current.count += 1;

      const point = parseUserGeoPoint(entry);
      if (point) {
        current.latSum += point.lat;
        current.lngSum += point.lng;
        current.coordCount += 1;
      }

      grouped.set(key, current);
    }

    const points = Array.from(grouped.values())
      .map((item) => {
        const lat = item.coordCount > 0 ? item.latSum / item.coordCount : item.fallbackLat;
        const lng = item.coordCount > 0 ? item.lngSum / item.coordCount : item.fallbackLng;
        return {
          ...item,
          lat,
          lng,
        };
      })
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    const maxCount = points.reduce((max, item) => Math.max(max, item.count), 1);
    return points
      .map((item) => ({
        ...item,
        densityRatio: item.count / maxCount,
        fill: getDensityColor(item.count / maxCount),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 260);
  }, [users, geocodedCityCoords]);

  const worldHeatPoints = useMemo(() => {
    if (globalHeatPoints.length === 0) return globalHeatPoints;

    // Progressive detail by zoom level, similar to map clustering behavior.
    // Far zoom = larger clusters; near zoom = city-level points.
    const gridStep = (() => {
      if (worldMapZoom < 1.4) return 42;
      if (worldMapZoom < 1.9) return 26;
      if (worldMapZoom < 2.5) return 14;
      if (worldMapZoom < 3.4) return 8;
      if (worldMapZoom < 4.6) return 4;
      if (worldMapZoom < 5.8) return 2;
      return 0;
    })();

    if (gridStep <= 0) {
      const maxCount = globalHeatPoints.reduce((max, item) => Math.max(max, item.count), 1);
      return globalHeatPoints
        .map((item) => ({
          ...item,
          clusterSize: 1,
          densityRatio: item.count / maxCount,
          fill: getDensityColor(item.count / maxCount),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 320);
    }

    const grouped = new Map<string, {
      count: number;
      weightedLatSum: number;
      weightedLngSum: number;
      countries: Set<string>;
      states: Set<string>;
      sampleCity: string;
      sampleState: string;
      sampleCountry: string;
      sourcePoints: number;
    }>();

    for (const point of globalHeatPoints) {
      const cellX = Math.floor((point.lng + 180) / gridStep);
      const cellY = Math.floor((point.lat + 90) / gridStep);
      const key = `${cellX}:${cellY}`;

      const current = grouped.get(key) ?? {
        count: 0,
        weightedLatSum: 0,
        weightedLngSum: 0,
        countries: new Set<string>(),
        states: new Set<string>(),
        sampleCity: point.cityLabel,
        sampleState: point.stateLabel,
        sampleCountry: point.countryLabel,
        sourcePoints: 0,
      };

      current.count += point.count;
      current.weightedLatSum += point.lat * point.count;
      current.weightedLngSum += point.lng * point.count;
      current.countries.add(point.countryLabel);
      current.states.add(point.stateLabel);
      current.sourcePoints += 1;

      if (point.count > 1 || current.sourcePoints === 1) {
        current.sampleCity = point.cityLabel;
        current.sampleState = point.stateLabel;
        current.sampleCountry = point.countryLabel;
      }

      grouped.set(key, current);
    }

    const clustered = Array.from(grouped.values())
      .map((item) => {
        const lat = item.weightedLatSum / Math.max(1, item.count);
        const lng = item.weightedLngSum / Math.max(1, item.count);
        const isMulti = item.sourcePoints > 1;
        const cityLabel = isMulti
          ? item.sourcePoints === 2
            ? `${item.sampleCity} +1 cidade`
            : `${item.sourcePoints} cidades`
          : item.sampleCity;
        const stateLabel = item.states.size === 1
          ? item.sampleState
          : `${item.states.size} estados`;
        const countryLabel = item.countries.size === 1
          ? item.sampleCountry
          : `${item.countries.size} paises`;

        return {
          cityLabel,
          stateLabel,
          countryLabel,
          count: item.count,
          lat,
          lng,
          clusterSize: item.sourcePoints,
        };
      })
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    const maxCount = clustered.reduce((max, item) => Math.max(max, item.count), 1);
    return clustered
      .map((item) => ({
        ...item,
        densityRatio: item.count / maxCount,
        fill: getDensityColor(item.count / maxCount),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 320);
  }, [globalHeatPoints, worldMapZoom]);

  const isWorldMapFocusedOnBrazil = useMemo(() => {
    const [lng, lat] = worldMapCenter;
    if (worldMapZoom < 1.2) return false;
    return lat >= -35.5 && lat <= 7.5 && lng >= -76 && lng <= -28;
  }, [worldMapCenter, worldMapZoom]);

  const worldFocusedBrazilState = useMemo(() => {
    if (!isWorldMapFocusedOnBrazil || worldMapZoom < 2.8) return null;
    const [centerLng, centerLat] = worldMapCenter;
    let nearest: string | null = null;
    let minDist = Infinity;
    for (const [code, centroid] of Object.entries(BRAZIL_STATE_CENTROIDS)) {
      const dist = Math.hypot(centroid.lat - centerLat, centroid.lng - centerLng);
      if (dist < minDist) {
        minDist = dist;
        nearest = code;
      }
    }
    return nearest;
  }, [isWorldMapFocusedOnBrazil, worldMapCenter, worldMapZoom]);

  useEffect(() => {
    if (!worldFocusedBrazilState || worldMapZoom < 4.2) {
      setWorldSelectedStateMunicipalGeo(null);
      setLoadingWorldMunicipalGeo(false);
      return;
    }

    const ibgeCode = BRAZIL_STATE_IBGE_CODE[worldFocusedBrazilState];
    if (!ibgeCode) {
      setWorldSelectedStateMunicipalGeo(null);
      setLoadingWorldMunicipalGeo(false);
      return;
    }

    const controller = new AbortController();
    setLoadingWorldMunicipalGeo(true);
    fetch(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${ibgeCode}-mun.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Falha ao carregar divisas municipais (${response.status})`);
        return response.json();
      })
      .then((geojson) => {
        setWorldSelectedStateMunicipalGeo(geojson);
      })
      .catch((error: any) => {
        if (error?.name === "AbortError") return;
        setWorldSelectedStateMunicipalGeo(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingWorldMunicipalGeo(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [worldFocusedBrazilState, worldMapZoom]);

  const topBrazilStates = useMemo(() => {
    const byState = new Map<string, number>();
    for (const entry of users) {
      if (!isBrazilToken((entry as any).country)) continue;
      const stateCode = resolveBrazilStateCode((entry as any).stateRegion);
      if (!stateCode) continue;
      byState.set(stateCode, Number(byState.get(stateCode) ?? 0) + 1);
    }

    return Array.from(byState.entries())
      .map(([stateCode, count]) => ({
        stateCode,
        stateLabel: BRAZIL_STATE_CENTROIDS[stateCode]?.label ?? stateCode.toUpperCase(),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [users]);

  const brazilStateCountByCode = useMemo(() => {
    return topBrazilStates.reduce<Record<string, number>>((acc, item) => {
      acc[item.stateCode.toUpperCase()] = item.count;
      return acc;
    }, {});
  }, [topBrazilStates]);

  const maxBrazilStateCount = useMemo(() => {
    return topBrazilStates.reduce((max, item) => Math.max(max, item.count), 0);
  }, [topBrazilStates]);

  const brazilCityHeatPoints = useMemo(() => {
    const grouped = new Map<string, { cityLabel: string; stateCode: string; countryRaw: string; stateRaw: string; count: number; latSum: number; lngSum: number; coordCount: number }>();

    for (const entry of users) {
      if (!isBrazilToken((entry as any).country)) continue;
      const cityLabel = String((entry as any).city ?? "").trim();
      if (!cityLabel) continue;

      const stateCode = resolveBrazilStateCode((entry as any).stateRegion);
      if (!stateCode) continue;

      const key = `${stateCode}|${normalizeLeagueToken(cityLabel)}`;
      const current = grouped.get(key) ?? {
        cityLabel,
        stateCode: stateCode.toUpperCase(),
        countryRaw: String((entry as any).country ?? ""),
        stateRaw: String((entry as any).stateRegion ?? ""),
        count: 0,
        latSum: 0,
        lngSum: 0,
        coordCount: 0,
      };

      current.count += 1;

      const point = parseUserGeoPoint(entry);
      if (point) {
        current.latSum += point.lat;
        current.lngSum += point.lng;
        current.coordCount += 1;
      }

      grouped.set(key, current);
    }

    const points = Array.from(grouped.values()).map((item) => {
      let lat = 0;
      let lng = 0;

      if (item.coordCount > 0) {
        lat = item.latSum / item.coordCount;
        lng = item.lngSum / item.coordCount;
      } else {
        const cityToken = normalizeLeagueToken(item.cityLabel);
        const geocodeKey = buildCityCacheKey(item.countryRaw, item.stateRaw, item.cityLabel);
        const geocoded = geocodeKey ? geocodedCityCoords[geocodeKey] : null;
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
        } else {
          const knownCity = resolveCityCentroid("brasil", cityToken);
          if (knownCity) {
            lat = knownCity.lat;
            lng = knownCity.lng;
          } else {
            const centroid = BRAZIL_STATE_CENTROIDS[item.stateCode.toLowerCase()];
            if (centroid) {
              const seed = `${item.stateCode}-${cityToken}`;
              const latOffset = (hashTokenToUnit(seed) - 0.5) * 1.2;
              const lngOffset = (hashTokenToUnit(`${seed}-lng`) - 0.5) * 1.2;
              lat = centroid.lat + latOffset;
              lng = centroid.lng + lngOffset;
            }
          }
        }
      }

      return {
        ...item,
        lat,
        lng,
      };
    }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    const maxCityCount = points.reduce((max, item) => Math.max(max, item.count), 1);
    return points
      .map((item) => ({
        ...item,
        densityRatio: item.count / maxCityCount,
        fill: getDensityColor(item.count / maxCityCount),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 220);
  }, [users, geocodedCityCoords]);

  const visibleBrazilCityPoints = useMemo(() => {
    if (selectedBrazilState) {
      return brazilCityHeatPoints.filter((point) => point.stateCode.toLowerCase() === selectedBrazilState.toLowerCase());
    }
    return brazilCityHeatPoints.slice(0, 120);
  }, [brazilCityHeatPoints, selectedBrazilState]);

  // Recompute fill relative to visible cities max so zoomed-in view has full red→green range
  const normalizedVisibleCityPoints = useMemo(() => {
    if (visibleBrazilCityPoints.length === 0) return visibleBrazilCityPoints;
    const localMax = visibleBrazilCityPoints.reduce((m, p) => Math.max(m, p.count), 1);
    return visibleBrazilCityPoints.map((p) => ({
      ...p,
      densityRatio: p.count / localMax,
      fill: getDensityColor(p.count / localMax),
    }));
  }, [visibleBrazilCityPoints]);

  const topBrazilCities = useMemo(() => {
    return visibleBrazilCityPoints
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [visibleBrazilCityPoints]);

  const selectedStateCityCountByName = useMemo(() => {
    if (!selectedBrazilState) return {} as Record<string, number>;

    const counts: Record<string, number> = {};
    for (const entry of users) {
      if (!isBrazilToken((entry as any).country)) continue;
      const code = resolveBrazilStateCode((entry as any).stateRegion);
      if (!code || code !== selectedBrazilState) continue;
      const cityName = normalizeLeagueToken((entry as any).city);
      if (!cityName) continue;
      counts[cityName] = Number(counts[cityName] ?? 0) + 1;
    }

    return counts;
  }, [users, selectedBrazilState]);

  const selectedStateMaxCityCount = useMemo(() => {
    return Object.values(selectedStateCityCountByName).reduce((max, value) => Math.max(max, Number(value) || 0), 0);
  }, [selectedStateCityCountByName]);

  // Auto-detect focused state from zoom level + map center (no click needed)
  useEffect(() => {
    if (brazilMapZoom < 2.0) {
      setSelectedBrazilState(null);
      return;
    }
    const [centerLng, centerLat] = brazilMapCenter;
    let nearest: string | null = null;
    let minDist = Infinity;
    for (const [code, centroid] of Object.entries(BRAZIL_STATE_CENTROIDS)) {
      const dist = Math.hypot(centroid.lat - centerLat, centroid.lng - centerLng);
      if (dist < minDist) {
        minDist = dist;
        nearest = code;
      }
    }
    if (nearest) {
      setSelectedBrazilState((prev) => (prev === nearest ? prev : nearest));
    }
  }, [brazilMapCenter, brazilMapZoom]);

  useEffect(() => {
    if (!selectedBrazilState || brazilMapZoom < 2.0) {
      setSelectedStateMunicipalGeo(null);
      setLoadingMunicipalGeo(false);
      return;
    }

    const ibgeCode = BRAZIL_STATE_IBGE_CODE[selectedBrazilState];
    if (!ibgeCode) {
      setSelectedStateMunicipalGeo(null);
      setLoadingMunicipalGeo(false);
      return;
    }

    const controller = new AbortController();
    setLoadingMunicipalGeo(true);
    fetch(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${ibgeCode}-mun.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Falha ao carregar divisas municipais (${response.status})`);
        return response.json();
      })
      .then((geojson) => {
        setSelectedStateMunicipalGeo(geojson);
      })
      .catch((error: any) => {
        if (error?.name === "AbortError") return;
        setSelectedStateMunicipalGeo(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingMunicipalGeo(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedBrazilState, brazilMapZoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const brazilCoverage = useMemo(() => {
    const usersInBrazil = users.filter((entry: any) => isBrazilToken(entry.country));
    const usersWithState = usersInBrazil.filter((entry: any) => Boolean(resolveBrazilStateCode(entry.stateRegion))).length;
    const stateCoverageRate = usersInBrazil.length > 0 ? (usersWithState / usersInBrazil.length) * 100 : 0;

    return {
      usersInBrazil: usersInBrazil.length,
      usersWithState,
      stateCoverageRate,
      coveredStates: topBrazilStates.length,
    };
  }, [users, topBrazilStates]);

  const geoCoverage = useMemo(() => {
    const usersWithoutCountry = users.filter((entry: any) => !String(entry.country ?? "").trim()).length;
    const coveredCountries = topCountries.length;
    const coverageRate = totalUsers > 0 ? ((totalUsers - usersWithoutCountry) / totalUsers) * 100 : 0;
    return {
      usersWithoutCountry,
      coveredCountries,
      coverageRate,
    };
  }, [users, topCountries, totalUsers]);

  const cards = [
    {
      title: "Usuarios Totais",
      value: String(totalUsers),
      subtitle: "Base geral ativa",
      icon: Users,
      tone: "from-violet-500/25 to-fuchsia-500/10 border-violet-400/30",
    },
    {
      title: "Novos (30 dias)",
      value: String(createdInLast30Days),
      subtitle: "Cadastros recentes",
      icon: UserPlus,
      tone: "from-emerald-500/25 to-lime-500/10 border-emerald-400/30",
    },
    {
      title: "Online Agora",
      value: String(usersOnline),
      subtitle: "Janela de 15 minutos",
      icon: Activity,
      tone: "from-cyan-500/25 to-blue-500/10 border-cyan-400/30",
    },
    {
      title: "Com Email",
      value: String(withEmail),
      subtitle: "Qualidade de cadastro",
      icon: MessageCircle,
      tone: "from-amber-500/25 to-orange-500/10 border-amber-400/30",
    },
    {
      title: "Com Avatar",
      value: String(withAvatar),
      subtitle: "Perfil completo",
      icon: Sparkles,
      tone: "from-indigo-500/25 to-violet-500/10 border-indigo-400/30",
    },
  ];

  const systemStatus = [
    { label: "Aplicacao", ok: true },
    { label: "Banco de Dados", ok: true },
    { label: "Notificacoes", ok: true },
    { label: "Sessoes", ok: true },
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.22),transparent_45%),radial-gradient(circle_at_top_left,rgba(6,182,212,0.18),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(2,6,23,0.9))] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Painel Executivo</h1>
            <p className="text-sm text-slate-300">
              Panorama geral da empresa com dados reais do banco e visao estrategica da diretoria.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30">
              <ShieldCheck className="h-3.5 w-3.5" />
              Diretoria
            </Badge>
            <Badge className="gap-1.5 border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30">
              <TrendingUp className="h-3.5 w-3.5" />
              Atualizado em tempo real
            </Badge>
          </div>
        </div>

        {activeLoadingSections.length > 0 ? (
          <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">Carregando dados do painel</p>
              <Badge className="border-cyan-300/35 bg-cyan-400/15 text-cyan-100">
                {activeLoadingSections.length} secoes pendentes
              </Badge>
            </div>
            <Progress value={adminLoadProgress} className="h-2 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeLoadingSections.map((section) => (
                <Badge key={section.key} variant="outline" className="border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                  {section.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`rounded-xl border ${item.tone} bg-gradient-to-br p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(2,6,23,0.35)]`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-300">{item.title}</p>
                  <Icon className="h-4 w-4 text-white/80" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-300">{item.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="border-white/10 bg-slate-950/65 backdrop-blur xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Crown className="h-4 w-4 text-amber-300" />
              Distribuicao por Nivel de Acesso
            </CardTitle>
            <CardDescription className="text-slate-400">
              Quantidade por nivel com visual de cards e grafico.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {companyOverviewQuery.isLoading ? (
              <>
                <div className="space-y-2">
                  <Progress value={adminLoadProgress} className="h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    {Array.from({ length: 7 }).map((_, idx) => (
                      <div key={`level-skeleton-${idx}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                        <Skeleton className="mx-auto h-3 w-16 bg-white/15" />
                        <Skeleton className="mx-auto mt-2 h-12 w-12 rounded-full bg-white/10" />
                        <Skeleton className="mx-auto mt-2 h-3 w-20 bg-white/15" />
                        <Skeleton className="mx-auto mt-2 h-5 w-10 bg-white/20" />
                        <Skeleton className="mx-auto mt-1 h-3 w-12 bg-white/15" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <Skeleton className="h-[250px] w-full bg-white/10" />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  {levelCards.map((level) => (
                    <div key={level.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                      <p className="text-xs font-semibold tracking-[0.12em] text-slate-400">{level.key}</p>
                      <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-full border text-sm font-black" style={{ borderColor: `${level.color}66`, color: level.color, backgroundColor: `${level.color}1A` }}>
                        {level.visual}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-200">{level.label}</p>
                      <p className="mt-1 text-lg font-black text-white">{level.count}</p>
                      <p className="text-[11px] text-slate-400">{level.pct.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  {levelChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={levelChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={88}
                          stroke="rgba(15,23,42,0.8)"
                          strokeWidth={2}
                        >
                          {levelChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [String(value), name]}
                          contentStyle={{
                            background: "rgba(2,6,23,0.95)",
                            border: "1px solid rgba(148,163,184,0.3)",
                            color: "#e2e8f0",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">
                      Sem dados para grafico.
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/65 backdrop-blur xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Building2 className="h-4 w-4 text-cyan-300" />
              Mapa Mundi de Calor (Admin)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Intensidade aumenta perto dos polos das cidades cadastradas (ex.: Sao Paulo dentro do Brasil e clusters internacionais como Suica).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-sky-300/20 bg-[radial-gradient(circle_at_50%_18%,rgba(58,134,255,0.25),transparent_35%),linear-gradient(180deg,#051326_0%,#06172c_100%)] p-3 shadow-[0_22px_48px_rgba(0,0,0,0.35)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100/20 bg-[#0d223d]/70 px-3 py-2 text-xs text-slate-200 backdrop-blur-md">
                <span>
                  {hoveredWorldPoint
                    ? `Polo: ${hoveredWorldPoint.cityLabel}, ${hoveredWorldPoint.stateLabel}, ${hoveredWorldPoint.countryLabel} - ${hoveredWorldPoint.count} usuarios${hoveredWorldPoint.clusterSize && hoveredWorldPoint.clusterSize > 1 ? ` (${hoveredWorldPoint.clusterSize} cidades agrupadas)` : ""}`
                    : "Passe o mouse para ver polos do heatmap mundial."}
                </span>
                <span className="text-slate-400">
                  {isWorldMapFocusedOnBrazil
                    ? worldMapZoom >= 4.2
                      ? loadingWorldMunicipalGeo
                        ? "Brasil focado: carregando fronteiras de cidades"
                        : "Brasil focado: fronteiras de estados e cidades"
                      : "Brasil focado: fronteiras de estados"
                    : "Heatmap no estilo incidencia"}
                </span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-sky-200/30 bg-[#132c4d]/80 text-slate-100 hover:bg-[#1a3860]"
                  onClick={() => setWorldMapZoom((prev) => Math.min(12, Number((prev + 0.5).toFixed(2))))}
                >
                  Zoom +
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-sky-200/30 bg-[#132c4d]/80 text-slate-100 hover:bg-[#1a3860]"
                  onClick={() => setWorldMapZoom((prev) => Math.max(1, Number((prev - 0.5).toFixed(2))))}
                >
                  Zoom -
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-sky-200/30 bg-[#132c4d]/80 text-slate-100 hover:bg-[#1a3860]"
                  onClick={() => {
                    setWorldMapCenter([-54, -15]);
                    setWorldMapZoom(4.6);
                  }}
                >
                  Focar Brasil
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-sky-200/30 bg-[#132c4d]/80 text-slate-100 hover:bg-[#1a3860]"
                  onClick={() => {
                    setWorldMapCenter([0, 12]);
                    setWorldMapZoom(1);
                  }}
                >
                  Resetar Mapa
                </Button>
              </div>

              <div className="mb-3 rounded-xl border border-sky-100/15 bg-[#0d223d]/60 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">Incidencia de usuarios</p>
                <div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#ffe066_0%,#ff9f1c_50%,#ef233c_100%)]" />
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-300">
                  <span>Baixa</span>
                  <span>Alta</span>
                </div>
              </div>

              <div className="h-[390px] w-full">
                <ComposableMap
                  projection="geoEqualEarth"
                  projectionConfig={{ scale: 155 }}
                  width={900}
                  height={540}
                  style={{ width: "100%", height: "100%" }}
                >
                  <ZoomableGroup
                    center={worldMapCenter}
                    zoom={worldMapZoom}
                    minZoom={1}
                    maxZoom={12}
                    onMoveEnd={(position: any) => {
                      const nextCenter = position?.coordinates;
                      const nextZoom = Number(position?.zoom);
                      if (Array.isArray(nextCenter) && nextCenter.length === 2) {
                        const lng = Number(nextCenter[0]);
                        const lat = Number(nextCenter[1]);
                        if (Number.isFinite(lng) && Number.isFinite(lat)) {
                          setWorldMapCenter([lng, lat]);
                        }
                      }
                      if (Number.isFinite(nextZoom)) {
                        setWorldMapZoom(Math.max(1, Math.min(12, nextZoom)));
                      }
                    }}
                  >
                    <Geographies geography={WORLD_GEOJSON_URL}>
                      {({ geographies }) => geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          style={{
                            default: { fill: "#122a45", stroke: "rgba(201,214,231,0.25)", strokeWidth: 0.45, outline: "none" },
                            hover: { fill: "#183557", stroke: "rgba(201,214,231,0.4)", strokeWidth: 0.55, outline: "none" },
                            pressed: { fill: "#183557", stroke: "rgba(201,214,231,0.4)", strokeWidth: 0.55, outline: "none" },
                          }}
                        />
                      ))}
                    </Geographies>

                    {isWorldMapFocusedOnBrazil ? (
                      <Geographies geography={BRAZIL_STATES_GEOJSON_URL}>
                        {({ geographies }) => geographies.map((geo) => (
                          <Geography
                            key={`br-state-${geo.rsmKey}`}
                            geography={geo}
                            style={{
                              default: { fill: "transparent", stroke: "rgba(241,245,249,0.92)", strokeWidth: 1.2, outline: "none" },
                              hover: { fill: "rgba(148,163,184,0.1)", stroke: "rgba(186,230,253,0.98)", strokeWidth: 1.35, outline: "none" },
                              pressed: { fill: "rgba(148,163,184,0.1)", stroke: "rgba(186,230,253,0.98)", strokeWidth: 1.35, outline: "none" },
                            }}
                          />
                        ))}
                      </Geographies>
                    ) : null}

                    {isWorldMapFocusedOnBrazil && worldMapZoom >= 4.2 && worldSelectedStateMunicipalGeo ? (
                      <Geographies geography={worldSelectedStateMunicipalGeo}>
                        {({ geographies }) => geographies.map((geo) => (
                          <Geography
                            key={`br-city-${geo.rsmKey}`}
                            geography={geo}
                            style={{
                              default: { fill: "transparent", stroke: "rgba(148,163,184,0.32)", strokeWidth: 0.22, outline: "none" },
                              hover: { fill: "transparent", stroke: "rgba(186,230,253,0.5)", strokeWidth: 0.28, outline: "none" },
                              pressed: { fill: "transparent", stroke: "rgba(186,230,253,0.5)", strokeWidth: 0.28, outline: "none" },
                            }}
                          />
                        ))}
                      </Geographies>
                    ) : null}

                    {worldHeatPoints.map((point) => {
                      const intensity = normalizeHeatRatio(point.densityRatio);
                      const baseRadius = Math.min(12.5, Math.max(1.7, Math.sqrt(point.count) * 1.05 / Math.max(1, worldMapZoom * 0.45)));
                      const heatColor = intensity >= 0.72 ? "#ef233c" : intensity >= 0.42 ? "#ff9f1c" : "#ffe066";
                      return (
                        <Marker
                          key={`${normalizeLeagueToken(point.countryLabel)}-${normalizeLeagueToken(point.stateLabel)}-${normalizeLeagueToken(point.cityLabel)}`}
                          coordinates={[point.lng, point.lat]}
                          onMouseEnter={() => setHoveredWorldPoint({ cityLabel: point.cityLabel, stateLabel: (point as any).stateLabel ?? "Sem estado", countryLabel: point.countryLabel, count: point.count, clusterSize: (point as any).clusterSize })}
                          onMouseLeave={() => setHoveredWorldPoint(null)}
                        >
                          <circle
                            r={baseRadius * 4.1}
                            fill={heatColor}
                            fillOpacity={Math.min(0.18, 0.05 + intensity * 0.12)}
                            stroke="none"
                          />
                          <circle
                            r={baseRadius * 2.5}
                            fill={heatColor}
                            fillOpacity={Math.min(0.34, 0.08 + intensity * 0.22)}
                            stroke="none"
                          />
                          <circle
                            r={baseRadius * 1.15}
                            fill={heatColor}
                            fillOpacity={Math.min(0.95, 0.52 + intensity * 0.38)}
                            stroke="#ffffff"
                            strokeOpacity={0.72}
                            strokeWidth={0.42}
                          />
                        </Marker>
                      );
                    })}
                  </ZoomableGroup>
                </ComposableMap>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-sky-200/20 bg-[#0d223d]/55 p-3 shadow-[0_16px_32px_rgba(0,0,0,0.22)]">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-300">Polos Globais</p>
              {worldHeatPoints.length > 0 ? worldHeatPoints.slice(0, 10).map((point) => (
                <div key={`${point.countryLabel}-${(point as any).stateLabel}-${point.cityLabel}`} className="flex items-center justify-between rounded-lg border border-sky-100/15 bg-[#132c4d]/70 px-2 py-1.5 text-sm">
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-slate-100">{point.cityLabel}</p>
                    <p className="text-[11px] text-slate-300 truncate">{(point as any).stateLabel ?? "Sem estado"}, {point.countryLabel}</p>
                  </div>
                  <Badge variant="outline" className="border-amber-300/40 bg-amber-300/10 text-amber-100">{point.count}</Badge>
                </div>
              )) : (
                <div className="rounded-lg border border-sky-100/15 bg-[#132c4d]/60 px-2 py-1.5 text-xs text-slate-300">
                  Sem dados de geolocalizacao suficientes para o mapa global.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/65 backdrop-blur xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <ChartBar className="h-4 w-4 text-violet-300" />
              Usuarios (Busca e Filtro)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Busca por nome, email, id, openId ou papel para achar qualquer usuario rapido.
            </CardDescription>
            <div className="pt-2">
              <Input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Buscar usuario por nome, email, id, openId..."
                className="border-white/20 bg-white/5 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </CardHeader>
          <CardContent>
            {companyOverviewQuery.isLoading ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-3">
                  <p className="text-xs text-cyan-100">Carregando base de usuarios...</p>
                  <Progress value={adminLoadProgress} className="mt-2 h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={`user-row-skeleton-${idx}`} className="grid grid-cols-12 gap-2 rounded-md border border-white/10 bg-white/5 p-2">
                      <Skeleton className="col-span-3 h-8 bg-white/15" />
                      <Skeleton className="col-span-2 h-8 bg-white/10" />
                      <Skeleton className="col-span-2 h-8 bg-white/10" />
                      <Skeleton className="col-span-1 h-8 bg-white/10" />
                      <Skeleton className="col-span-2 h-8 bg-white/10" />
                      <Skeleton className="col-span-2 h-8 bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            ) : latestUsers.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[1020px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="py-2 font-medium">Usuario</th>
                      <th className="py-2 font-medium">Email</th>
                      <th className="py-2 font-medium">Localizacao</th>
                      <th className="py-2 font-medium">Nivel</th>
                      <th className="py-2 font-medium">Cadastro</th>
                      <th className="py-2 font-medium">Ultimo Acesso</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestUsers.map((entry: any) => {
                      return (
                        <tr
                          key={entry.id}
                          className={`border-b border-white/5 text-slate-200 transition-colors hover:bg-slate-800/40 ${selectedUserId === Number(entry.id) ? "bg-violet-500/10" : ""}`}
                        >
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 border border-white/15">
                                <AvatarImage src={getAvatarSrc(entry)} alt={entry.name || "usuario"} />
                                <AvatarFallback className="text-[10px] font-semibold">{String(entry.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{entry.name}</p>
                                <p className="text-[11px] text-slate-400">ID {entry.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-slate-300">{entry.email || "-"}</td>
                          <td className="py-2.5 text-slate-300">{[entry.city, entry.stateRegion, entry.country].filter(Boolean).join(", ") || "-"}</td>
                          <td className="py-2.5">
                            <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">
                              {inferLevelKey(entry)}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-slate-300">{formatDateOnly(entry.createdAt)}</td>
                          <td className="py-2.5 text-slate-300">{formatDateTime(entry.lastSignedIn)}</td>
                          <td className="py-2.5">
                            <Badge className={entry.isOnline ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" : "bg-slate-500/20 text-slate-300 border-slate-400/30"}>
                              {entry.isOnline ? "Online" : "Offline"}
                            </Badge>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full border-sky-200/30 bg-[#132c4d]/80 text-slate-100 hover:bg-[#1a3860]"
                                onClick={() => setSelectedUserId(Number(entry.id))}
                              >
                                Ver perfil
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="bg-red-600/85 hover:bg-red-600"
                                onClick={() => {
                                  setResetTargetUserId(Number(entry.id));
                                  setResetConfirmationText("");
                                }}
                                disabled={String(entry.role ?? "").toLowerCase() === "admin"}
                              >
                                Resetar dados
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="bg-red-900/85 hover:bg-red-900"
                                onClick={() => {
                                  setDeleteTargetUserId(Number(entry.id));
                                  setDeleteConfirmationText("");
                                }}
                                disabled={String(entry.role ?? "").toLowerCase() === "admin"}
                              >
                                Excluir conta
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhum usuario encontrado.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Building2 className="h-4 w-4 text-cyan-300" />
                Status do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onlineUsersQuery.isLoading ? (
                <div className="space-y-2">
                  <p className="text-xs text-cyan-100">Sincronizando status de servicos...</p>
                  <Progress value={adminLoadProgress} className="h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                </div>
              ) : null}
              {systemStatus.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <span className="text-slate-200">{item.label}</span>
                  <span className="text-emerald-300">{item.ok ? "Online" : "Instavel"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Clock3 className="h-4 w-4 text-amber-300" />
                Atividades Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {companyOverviewQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`activity-skeleton-${idx}`} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <Skeleton className="h-3 w-2/3 bg-white/15" />
                      <Skeleton className="mt-2 h-3 w-1/3 bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : activityRows.length > 0 ? activityRows.map((entry: any) => (
                <div key={`activity-${entry.id}`} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm text-slate-200">Login recente de <span className="font-semibold">{entry.name}</span></p>
                  <p className="text-xs text-slate-400">
                    {entry.lastSignedIn ? new Date(entry.lastSignedIn).toLocaleString("pt-BR") : "-"}
                  </p>
                </div>
              )) : (
                <p className="text-sm text-slate-400">Sem atividades recentes.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Bell className="h-4 w-4 text-fuchsia-300" />
                Acoes Rapidas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <Users className="mr-2 h-4 w-4" /> Ver usuarios
              </Button>
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <Crown className="mr-2 h-4 w-4" /> Revisar niveis
              </Button>
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <MessageCircle className="mr-2 h-4 w-4" /> Enviar comunicacao
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Users className="h-4 w-4 text-violet-300" />
            Perfil Completo do Usuario
          </CardTitle>
          <CardDescription className="text-slate-400">
            Dados de pronta mao para auditoria (sem trocar de aba).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                <Avatar className="h-12 w-12 border border-white/15">
                  <AvatarImage src={getAvatarSrc(selectedUser)} alt={selectedUser.name || "usuario"} />
                  <AvatarFallback className="text-xs font-semibold">{String(selectedUser.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-slate-100">{selectedUser.name}</p>
                  <p className="text-xs text-slate-400">{selectedUser.email || "Sem email"}</p>
                </div>
                <div className="ml-auto">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      className="bg-red-600/85 hover:bg-red-600"
                      onClick={() => {
                        setResetTargetUserId(Number(selectedUser.id));
                        setResetConfirmationText("");
                      }}
                      disabled={String(selectedUser.role ?? "").toLowerCase() === "admin"}
                    >
                      Resetar dados da conta
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="bg-red-900/85 hover:bg-red-900"
                      onClick={() => {
                        setDeleteTargetUserId(Number(selectedUser.id));
                        setDeleteConfirmationText("");
                      }}
                      disabled={String(selectedUser.role ?? "").toLowerCase() === "admin"}
                    >
                      Excluir conta
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">ID</span><p className="text-slate-100">{selectedUser.id}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">OpenID</span><p className="truncate text-slate-100">{selectedUser.openId || "-"}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Papel</span><p className="text-slate-100">{selectedUser.role || "user"}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Metodo de login</span><p className="text-slate-100">{selectedUser.loginMethod || "-"}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Cadastro</span><p className="text-slate-100">{formatDateOnly(selectedUser.createdAt)}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Ultimo acesso</span><p className="text-slate-100">{formatDateTime(selectedUser.lastSignedIn)}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Atualizado em</span><p className="text-slate-100">{formatDateTime(selectedUser.updatedAt)}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Nivel</span><p className="text-slate-100">{inferLevelKey(selectedUser)}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Invite code</span><p className="text-slate-100">{selectedUser.inviteCode || "-"}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Convidado por</span><p className="text-slate-100">{selectedUser.invitedBy ?? "-"}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Convites enviados</span><p className="text-slate-100">{selectedUser.inviteCount ?? 0}</p></div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Play type</span><p className="text-slate-100">{selectedUser.preferredPlayType || "-"}</p></div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs">
                <p className="text-slate-400">Presenca no aplicativo</p>
                {selectedUserPresenceQuery.isLoading ? (
                  <div className="mt-2 space-y-3">
                    <div className="rounded-md border border-cyan-400/20 bg-cyan-500/10 p-2">
                      <p className="text-[11px] text-cyan-100">Carregando presenca...</p>
                      <Progress value={presenceLoadProgress} className="mt-2 h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="h-14 animate-pulse rounded-md border border-white/10 bg-slate-950/40" />
                      <div className="h-14 animate-pulse rounded-md border border-white/10 bg-slate-950/40" />
                      <div className="h-14 animate-pulse rounded-md border border-white/10 bg-slate-950/40" />
                      <div className="h-14 animate-pulse rounded-md border border-white/10 bg-slate-950/40" />
                    </div>
                  </div>
                ) : selectedUserPresenceQuery.error ? (
                  <p className="mt-1 text-amber-200">
                    Falha ao carregar presenca deste usuario: {selectedUserPresenceQuery.error.message}
                  </p>
                ) : selectedUserPresenceQuery.data ? (
                  <>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2"><span className="text-slate-400">Tempo online acumulado</span><p className="text-slate-100">{formatDurationMinutes(selectedUserPresenceQuery.data.totalMinutes)}</p></div>
                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2"><span className="text-slate-400">Sessoes registradas</span><p className="text-slate-100">{selectedUserPresenceQuery.data.totalSessions}</p></div>
                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2"><span className="text-slate-400">Dias com acesso</span><p className="text-slate-100">{selectedUserPresenceQuery.data.totalAccessDays}</p></div>
                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2"><span className="text-slate-400">Ultima presenca</span><p className="text-slate-100">{formatDateTime(selectedUserPresenceQuery.data.lastAccessAt)}</p></div>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                        <p className="text-slate-400">Dias em que acessou o aplicativo</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedUserPresenceQuery.data.accessDays.length > 0 ? (
                            selectedUserPresenceQuery.data.accessDays.map((day: any) => (
                              <div key={day.accessDate} className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                                {formatDateOnly(day.accessDate)}
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-100">Sem dias registrados ainda.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                        <p className="text-slate-400">Ultimas sessoes online</p>
                        <div className="mt-2 space-y-2">
                          {selectedUserPresenceQuery.data.recentSessions.length > 0 ? (
                            selectedUserPresenceQuery.data.recentSessions.map((session: any) => (
                              <div key={session.id} className="rounded-md border border-white/10 bg-white/5 p-2 text-slate-100">
                                <p>Inicio: {formatDateTime(session.startedAt)}</p>
                                <p>Ultimo heartbeat: {formatDateTime(session.lastSeenAt)}</p>
                                <p>Duracao estimada: {formatDurationMinutes(session.durationMinutes)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-100">Sem sessoes registradas ainda.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedUserPresenceQuery.data.totalSessions === 0 && selectedUserPresenceQuery.data.totalAccessDays === 0 ? (
                      <p className="mt-3 text-slate-300">
                        Ainda nao existe historico de presenca para este usuario. O rastreio comeca a contar quando ele abre o app depois da publicacao desta funcionalidade.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-slate-100">Presenca indisponivel no momento para este usuario.</p>
                )}
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                <p className="text-slate-400">Preferencias</p>
                <p className="mt-1 text-slate-100">Platforms: {selectedUser.preferredPlatforms || "-"}</p>
                <p className="text-slate-100">Formats: {selectedUser.preferredFormats || "-"}</p>
                <p className="text-slate-100">Buy-ins: {selectedUser.preferredBuyIns || "-"}</p>
                <p className="text-slate-100">Buy-ins online: {selectedUser.preferredBuyInsOnline || "-"}</p>
                <p className="text-slate-100">Buy-ins live: {selectedUser.preferredBuyInsLive || "-"}</p>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                <p className="text-slate-400">Flags</p>
                <p className="text-slate-100">Multi-plataforma: {selectedUser.playsMultiPlatform ? "Sim" : "Nao"}</p>
                <p className="text-slate-100">Ranking global: {selectedUser.showInGlobalRanking ? "Sim" : "Nao"}</p>
                <p className="text-slate-100">Ranking amigos: {selectedUser.showInFriendsRanking ? "Sim" : "Nao"}</p>
                <p className="text-slate-100">Pais: {selectedUser.country || "-"}</p>
                <p className="text-slate-100">Estado/Regiao: {selectedUser.stateRegion || "-"}</p>
                <p className="text-slate-100">Cidade: {selectedUser.city || "-"}</p>
                <p className="text-slate-100">Endereco: {selectedUser.addressLine || "-"}</p>
                <p className="text-slate-100">CEP: {selectedUser.postalCode || "-"}</p>
                <p className="text-slate-100">Documento fiscal: {selectedUser.taxDocument || "-"}</p>
                <p className="text-slate-100">Consentimento ranking: {formatDateTime(selectedUser.rankingConsentAnsweredAt)}</p>
                <p className="text-slate-100">Consentimento localizacao: {formatDateTime(selectedUser.locationConsentAt)}</p>
                <p className="text-slate-100">Play style respondido: {formatDateTime(selectedUser.playStyleAnsweredAt)}</p>
                <p className="text-slate-100">Onboarding concluido: {formatDateTime(selectedUser.onboardingCompletedAt)}</p>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                <p className="text-slate-400">Diagnostico tecnico</p>
                {diagnoseUserQuery.isLoading ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-slate-100">Carregando diagnostico...</p>
                    <Progress value={adminLoadProgress} className="h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                  </div>
                ) : diagnoseUserQuery.data?.[0] ? (
                  <>
                    <p className="text-slate-100">Mesas recentes: {diagnoseUserQuery.data[0].recentTables?.length ?? 0}</p>
                    <p className="text-slate-100">Mesas orfas: {diagnoseUserQuery.data[0].orphanTables?.length ?? 0}</p>
                    <p className="text-slate-100">Mesas silver: {diagnoseUserQuery.data[0].silverTables?.length ?? 0}</p>
                  </>
                ) : (
                  <p className="text-slate-100">Sem diagnostico para este usuario.</p>
                )}
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                <p className="text-slate-400">Historico por posicao (VPIP/PFR/3-bet)</p>
                {selectedUserHistoryQuery.isLoading ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-slate-100">Carregando historico...</p>
                    <Progress value={adminLoadProgress} className="h-1.5 bg-cyan-200/20 [&_[data-slot=progress-indicator]]:bg-cyan-300" />
                  </div>
                ) : (selectedUserHistoryQuery.data?.positions?.byPosition?.length ?? 0) > 0 ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[460px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="py-1 pr-3 font-medium">Posicao</th>
                          <th className="py-1 pr-3 font-medium">Maos</th>
                          <th className="py-1 pr-3 font-medium">VPIP</th>
                          <th className="py-1 pr-3 font-medium">PFR</th>
                          <th className="py-1 pr-3 font-medium">3-bet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserHistoryQuery.data.positions.byPosition.map((row: any) => (
                          <tr key={`hist-pos-${row.position}`} className="border-b border-white/5 text-slate-100">
                            <td className="py-1 pr-3 font-medium">{row.position}</td>
                            <td className="py-1 pr-3">{Number(row.handsPlayed ?? 0)}</td>
                            <td className="py-1 pr-3">{formatPercent(Number(row.vpip ?? 0))}</td>
                            <td className="py-1 pr-3">{formatPercent(Number(row.pfr ?? 0))}</td>
                            <td className="py-1 pr-3">{formatPercent(Number(row.threeBet ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-100">Sem estatisticas historicas por posicao para este usuario.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Selecione um usuario na tabela para ver o perfil completo.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <ExternalLink className="h-4 w-4 text-emerald-300" />
              Google Drive da Empresa
            </CardTitle>
            <CardDescription className="text-slate-400">
              Defina o link oficial para centralizar documentos da empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="drive-url">Link do Google Drive</Label>
              <Input
                id="drive-url"
                placeholder="https://drive.google.com/drive/folders/..."
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveDriveUrl}>Salvar Link</Button>
              <Button variant="outline" onClick={handleOpenDrive}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir Google Drive
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <FolderOpen className="h-4 w-4 text-violet-300" />
              Estrutura Principal
            </CardTitle>
            <CardDescription className="text-slate-400">
              Pasta raiz ALL IN EDGE com subpastas operacionais para planejamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
              <div className="flex items-center gap-2 text-violet-100">
                <FolderOpen className="h-4 w-4" />
                <p className="font-semibold">ALL IN EDGE</p>
              </div>
              <p className="mt-1 text-xs text-violet-200/80">Pasta raiz operacional da empresa.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {folders.map((folder) => (
                <div key={folder.name} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-violet-300" />
                    <p className="font-semibold text-slate-100">{folder.name}</p>
                  </div>
                  <p className="text-xs text-slate-400">{folder.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(resetTargetUserId)} onOpenChange={(open) => {
        if (!open) {
          setResetTargetUserId(null);
          setResetConfirmationText("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar reset da conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Essa acao limpa os dados de uso do usuario, mas nao apaga a conta.
            </p>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
              <p><strong>Usuario:</strong> {resetTargetUser?.name || "-"}</p>
              <p><strong>Email:</strong> {resetTargetUser?.email || "-"}</p>
              <p><strong>ID:</strong> {resetTargetUser?.id ?? "-"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-input">Digite para confirmar: {resetExpectedPhrase}</Label>
              <Input
                id="reset-confirm-input"
                value={resetConfirmationText}
                onChange={(event) => setResetConfirmationText(event.target.value)}
                placeholder={resetExpectedPhrase}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResetTargetUserId(null);
                setResetConfirmationText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !resetTargetUserId
                || resetConfirmationText !== resetExpectedPhrase
                || resetUserDataMutation.isPending
              }
              onClick={() => {
                if (!resetTargetUserId) return;
                resetUserDataMutation.mutate({
                  userId: resetTargetUserId,
                  confirmationText: resetConfirmationText,
                });
              }}
            >
              {resetUserDataMutation.isPending ? "Resetando..." : "Confirmar reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTargetUserId)} onOpenChange={(open) => {
        if (!open) {
          setDeleteTargetUserId(null);
          setDeleteConfirmationText("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar exclusao permanente da conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Essa acao remove o usuario da sua lista e apaga a conta. Para voltar, ele precisara criar login novamente.
            </p>
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-200">
              <p><strong>Usuario:</strong> {deleteTargetUser?.name || "-"}</p>
              <p><strong>Email:</strong> {deleteTargetUser?.email || "-"}</p>
              <p><strong>ID:</strong> {deleteTargetUser?.id ?? "-"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm-input">Digite para confirmar: {deleteExpectedPhrase}</Label>
              <Input
                id="delete-confirm-input"
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                placeholder={deleteExpectedPhrase}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteTargetUserId(null);
                setDeleteConfirmationText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="bg-red-900/85 hover:bg-red-900"
              disabled={
                !deleteTargetUserId
                || deleteConfirmationText !== deleteExpectedPhrase
                || deleteUserAccountMutation.isPending
              }
              onClick={() => {
                if (!deleteTargetUserId) return;
                deleteUserAccountMutation.mutate({
                  userId: deleteTargetUserId,
                  confirmationText: deleteConfirmationText,
                });
              }}
            >
              {deleteUserAccountMutation.isPending ? "Excluindo..." : "Excluir conta permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {companyOverviewQuery.error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">
              Falha ao carregar painel: {companyOverviewQuery.error.message}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-2">
        <p className="text-xs text-slate-400">Visao de alto nivel restaurada para planejamento da diretoria.</p>
        <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-300">
          <Sparkles className="mr-1 h-3 w-3" />
          Painel executivo ativo
        </Badge>
      </div>
    </div>
  );
}







