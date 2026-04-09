import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useBehaviorProfile } from "@/hooks/useBehaviorProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus, Timer, Trophy, TrendingUp, TrendingDown, Trash2,
  Edit2, CheckCircle, XCircle, Wifi, MapPin, Sparkles,
  ChevronDown, ChevronUp, Clock, DollarSign, BarChart2, Building2, RotateCcw
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const GAME_FORMATS = [
  { value: "tournament", label: "Torneio", emoji: "🏆" },
  { value: "cash_game", label: "Cash Game", emoji: "💵" },
  { value: "turbo", label: "Turbo", emoji: "⚡" },
  { value: "hyper_turbo", label: "Hyper Turbo", emoji: "🚀" },
  { value: "sit_and_go", label: "Sit & Go", emoji: "🎯" },
  { value: "spin_and_go", label: "Spin & Go", emoji: "🎰" },
  { value: "bounty", label: "Bounty/PKO", emoji: "🎯" },
  { value: "satellite", label: "Satélite", emoji: "🛰️" },
  { value: "freeroll", label: "Freeroll", emoji: "🆓" },
  { value: "home_game", label: "Home Game", emoji: "🏠" },
];

type GameFormat = typeof GAME_FORMATS[number]["value"];

const ONBOARDING_FORMAT_OPTIONS = [
  ...GAME_FORMATS.map((f) => ({ value: f.value, label: f.label })),
  { value: "heads_up", label: "Heads-up" },
];

const ONLINE_TO_BRL_RATE = 5.75;

const ONBOARDING_BUY_IN_RANGES = [
  { key: "r1", minUsdCents: 50, maxUsdCents: 200, valueUsdCents: 100 },
  { key: "r2", minUsdCents: 220, maxUsdCents: 550, valueUsdCents: 330 },
  { key: "r3", minUsdCents: 750, maxUsdCents: 1100, valueUsdCents: 930 },
  { key: "r4", minUsdCents: 1650, maxUsdCents: 2200, valueUsdCents: 1925 },
  { key: "r5", minUsdCents: 3300, maxUsdCents: 5500, valueUsdCents: 4400 },
  { key: "r6", minUsdCents: 8200, maxUsdCents: 10900, valueUsdCents: 9550 },
  { key: "r7", minUsdCents: 16200, maxUsdCents: 21500, valueUsdCents: 18850 },
  { key: "r8", minUsdCents: 32000, maxUsdCents: 53000, valueUsdCents: 42500 },
  { key: "r9", minUsdCents: 105000, maxUsdCents: 210000, valueUsdCents: 157500 },
  { key: "r10", minUsdCents: 210000, maxUsdCents: 520000, valueUsdCents: 365000 },
] as const;

function formatUsdCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: valueCents < 100 ? 2 : 0 }).format(valueCents / 100);
}

function formatBrlCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valueCents / 100);
}

function getRangeValueByType(rangeKey: string, playType: "online" | "live"): number {
  const range = ONBOARDING_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return 0;
  if (playType === "online") return range.valueUsdCents;
  return Math.round(range.valueUsdCents * ONLINE_TO_BRL_RATE);
}

function getRangeLabelByType(rangeKey: string, playType: "online" | "live"): string {
  const range = ONBOARDING_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return "";
  if (playType === "online") {
    return `${formatUsdCents(range.minUsdCents)} - ${formatUsdCents(range.maxUsdCents)}`;
  }
  const brlMin = Math.round(range.minUsdCents * ONLINE_TO_BRL_RATE);
  const brlMax = Math.round(range.maxUsdCents * ONLINE_TO_BRL_RATE);
  return `${formatBrlCents(brlMin)} - ${formatBrlCents(brlMax)}`;
}

function getRangeApproxLabel(rangeKey: string): string {
  const range = ONBOARDING_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return "";
  const brlMin = Math.round(range.minUsdCents * ONLINE_TO_BRL_RATE);
  const brlMax = Math.round(range.maxUsdCents * ONLINE_TO_BRL_RATE);
  return `Aproximacao em BRL: ${formatBrlCents(brlMin)} - ${formatBrlCents(brlMax)}`;
}

function mapBuyInsToRangeKeys(values: number[], playType: "online" | "live"): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    let closest: { key: string; distance: number } | null = null;
    for (const range of ONBOARDING_BUY_IN_RANGES) {
      const candidate = getRangeValueByType(range.key, playType);
      const distance = Math.abs(candidate - value);
      if (!closest || distance < closest.distance) {
        closest = { key: range.key, distance };
      }
    }
    if (closest) keys.add(closest.key);
  }
  return Array.from(keys);
}

function formatCurrency(value: number, currency: string) {
  const amount = value / 100;
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  if (currency === "CAD") return `CA$${amount.toFixed(2)}`;
  if (currency === "JPY") return `¥${Math.round(amount)}`;
  if (currency === "CNY") return `CN¥${amount.toFixed(2)}`;
  return `R$${amount.toFixed(2)}`;
}

function convertToBrlCents(value: number, currency: string, rates?: any) {
  if (currency === "USD") return Math.round(value * (rates?.USD?.rate ?? 5.75));
  if (currency === "CAD") return Math.round(value * (rates?.CAD?.rate ?? 4.20));
  if (currency === "JPY") return Math.round(value * (rates?.JPY?.rate ?? 0.033));
  if (currency === "CNY") return Math.round(value * (rates?.CNY?.rate ?? 0.80));
  return value;
}

/** Format minutes as "Xh Ym" */
function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Calculate duration in minutes between two timestamps */
function calcTableDuration(startedAt: string | Date, endedAt?: string | Date | null): number {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 60000));
}

function formatDuration(startedAt: string | Date) {
  // Parse startedAt as UTC (MySQL timestamps come without timezone info)
  const raw = startedAt instanceof Date ? startedAt : new Date(startedAt);
  // If the string has no timezone suffix, treat it as UTC
  const startMs = typeof startedAt === "string" && !startedAt.endsWith("Z") && !startedAt.includes("+")
    ? Date.UTC(
        raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(),
        raw.getUTCHours(), raw.getUTCMinutes(), raw.getUTCSeconds()
      )
    : raw.getTime();
  const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Edit Table Dialog ────────────────────────────────────────────────────────
interface EditTableDialogProps {
  table: {
    id: number;
    type: string;
    gameFormat: string;
    currency: string;
    buyIn: number;
    cashOut?: number | null;
    venueId?: number | null;
    clubName?: string | null;
    gameType?: string | null;
    stakes?: string | null;
    notes?: string | null;
    startedAt: string | Date;
    endedAt?: string | Date | null;
  };
  venues: { id: number; name: string; logoUrl?: string | null }[];
  onSave: (data: { venueId?: number; type?: "online" | "live"; gameFormat?: "tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game"; currency?: "BRL" | "USD" | "CAD" | "JPY" | "CNY"; buyIn?: number; cashOut?: number | null; clubName?: string; stakes?: string; notes?: string }) => void;
  onClose: () => void;
  isPending: boolean;
}

function EditTableDialog({ table, venues, onSave, onClose, isPending }: EditTableDialogProps) {
  const fmt = GAME_FORMATS.find(f => f.value === table.gameFormat);
  const [type, setType] = useState<"online" | "live">(table.type as "online" | "live");
  const [gameFormat, setGameFormat] = useState<"tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game">(table.gameFormat as any);
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY" | "CNY">(table.currency as any);
  const [venueId, setVenueId] = useState(table.venueId?.toString() ?? "");
  const [clubName, setClubName] = useState(table.clubName ?? "");
  const [buyIn, setBuyIn] = useState((table.buyIn / 100).toFixed(2));
  const [cashOut, setCashOut] = useState(table.cashOut != null ? (table.cashOut / 100).toFixed(2) : "");
  const [stakes, setStakes] = useState(table.stakes ?? "");
  const [notes, setNotes] = useState(table.notes ?? "");

  const duration = calcTableDuration(table.startedAt, table.endedAt);

  function handleSave() {
    const buyInCents = Math.round(parseFloat(buyIn) * 100);
    const cashOutCents = cashOut !== "" ? Math.round(parseFloat(cashOut) * 100) : null;
    const minBuyInCents = gameFormat === "freeroll" ? 0 : type === "online" ? 50 : 1;
    if (isNaN(buyInCents) || buyInCents < minBuyInCents) {
      toast.error(gameFormat === "freeroll" ? "Buy-in inválido" : type === "online" ? "Buy-in mínimo para online é $0,50" : "Buy-in precisa ser maior que zero");
      return;
    }
    onSave({
      venueId: venueId ? parseInt(venueId) : undefined,
      type,
      gameFormat,
      currency,
      buyIn: buyInCents,
      cashOut: cashOutCents,
      clubName: clubName || undefined,
      stakes: stakes || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-4 w-4" /> Editar Mesa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {duration > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
              <Clock className="h-3.5 w-3.5" />
              Duração: <span className="font-medium text-foreground">{formatMinutes(duration)}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "online" | "live")}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Moeda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL (R$)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="CAD">CAD (CA$)</SelectItem>
                  <SelectItem value="JPY">JPY (¥)</SelectItem>
                  <SelectItem value="CNY">CNY (CN¥)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Plataforma / Local</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {(() => {
                  const seen = new Set<string>();
                  return venues.filter(v => {
                    if (seen.has(v.name)) return false;
                    seen.add(v.name);
                    return true;
                  }).map(v => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      <div className="flex items-center gap-2">
                        {v.logoUrl && <img src={v.logoUrl} alt={v.name} className="h-4 w-4 object-contain" />}
                        {v.name}
                      </div>
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Formato</Label>
            <Select value={gameFormat} onValueChange={(v) => setGameFormat(v as any)}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAME_FORMATS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.emoji} {f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Clube (opcional)</Label>
            <Input className="h-8 text-sm mt-1" placeholder="Ex: Alpha Club" value={clubName} onChange={e => setClubName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Buy-in ({currency})</Label>
              <Input className="h-8 text-sm mt-1" type="number" step="0.01" min={gameFormat === "freeroll" ? "0" : type === "online" ? "0.5" : "0.01"} value={buyIn} onChange={e => setBuyIn(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cash-out ({currency})</Label>
              <Input className="h-8 text-sm mt-1" type="number" step="0.01" value={cashOut} onChange={e => setCashOut(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Stakes (ex: 1/2)</Label>
            <Input className="h-8 text-sm mt-1" placeholder="1/2" value={stakes} onChange={e => setStakes(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea className="text-sm mt-1 resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Table Form ────────────────────────────────────────────────────────────
interface AddTableFormProps {
  activeSessionId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

function AddTableForm({ activeSessionId, onSuccess, onCancel }: AddTableFormProps) {
  const utils = trpc.useUtils();
  const {
    preferences: prefs,
    playTypeOrder,
    sortVenues,
    sortFormats,
    getPreferredBuyIns,
  } = useBehaviorProfile();

  // Determine smart defaults
  const defaultType = (prefs?.preferredType as "online" | "live") ?? "online";
  const defaultFormat = (prefs?.preferredGameFormats?.[0] as GameFormat) ?? "tournament";
  const defaultBuyInValue = getPreferredBuyIns(defaultType)[0] ?? prefs?.preferredBuyIns?.[0] ?? 0;
  const defaultBuyIn = defaultBuyInValue > 0 ? String(defaultBuyInValue / 100) : "";

  const [type, setType] = useState<"online" | "live">(defaultType);
  const [gameFormat, setGameFormat] = useState<GameFormat>(defaultFormat);
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY" | "CNY">(type === "online" ? "USD" : "BRL");
  const [venueId, setVenueId] = useState("");
  const [buyIn, setBuyIn] = useState(defaultBuyIn);
  const [clubName, setClubName] = useState("");
  const [gameType, setGameType] = useState("");
  const [stakes, setStakes] = useState("");

  const { data: venues } = trpc.venues.list.useQuery({ type });

  // Sort venues by preference and remove duplicates by name
  const sortedVenues = useMemo(() => {
    if (!venues) return [];
    const sorted = sortVenues(venues, (venue) => venue.id);
    // Remove duplicates by name (keep first occurrence)
    const seen = new Set<string>();
    return sorted.filter(venue => {
      if (seen.has(venue.name)) return false;
      seen.add(venue.name);
      return true;
    });
  }, [venues, sortVenues]);

  // Sort game formats by preference
  const sortedFormats = useMemo(() => {
    return sortFormats(GAME_FORMATS, (format) => format.value);
  }, [sortFormats]);

  const suggestedBuyIns = useMemo(() => {
    const values = new Set<number>();

    const normalizeByType = (value: number) => {
      if (type === "online") {
        return Math.max(50, Math.round(value / 50) * 50);
      }
      return Math.max(100, Math.round(value / 100) * 100);
    };

    const addValue = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) return;
      values.add(normalizeByType(Math.round(value)));
    };

    for (const value of getPreferredBuyIns(type).slice(0, 8)) {
      addValue(value);
    }

    const onboardingAbiByType = type === "online"
      ? (prefs?.onboardingPreferredBuyInsOnline ?? prefs?.onboardingPreferredBuyIns ?? [])
      : (prefs?.onboardingPreferredBuyInsLive ?? prefs?.onboardingPreferredBuyIns ?? []);

    for (const value of onboardingAbiByType) {
      const matchingRange = ONBOARDING_BUY_IN_RANGES.find((range) => {
        if (type === "online") return Math.abs(range.valueUsdCents - value) <= 1;
        const liveMid = Math.round(range.valueUsdCents * ONLINE_TO_BRL_RATE);
        return Math.abs(liveMid - value) <= Math.max(100, Math.round(liveMid * 0.08));
      });
      if (!matchingRange) continue;

      if (type === "online") {
        addValue(matchingRange.minUsdCents);
        addValue(matchingRange.valueUsdCents);
        addValue(matchingRange.maxUsdCents);
      } else {
        addValue(Math.round(matchingRange.minUsdCents * ONLINE_TO_BRL_RATE));
        addValue(Math.round(matchingRange.valueUsdCents * ONLINE_TO_BRL_RATE));
        addValue(Math.round(matchingRange.maxUsdCents * ONLINE_TO_BRL_RATE));
      }
    }

    if (type === "online" && values.size === 0) {
      addValue(50);
      addValue(100);
      addValue(200);
    }

    if (type === "live" && values.size === 0) {
      addValue(2500);
      addValue(5000);
      addValue(10000);
    }

    const abiAvg = type === "online" ? (prefs?.abiOnlineAvgBuyIn ?? 0) : (prefs?.abiLiveAvgBuyIn ?? 0);
    if (abiAvg > 0) {
      const abiCandidates = [0.5, 1, 2].map((factor) => Math.round(abiAvg * factor));
      for (const candidate of abiCandidates) {
        addValue(candidate);
      }
    }

    return Array.from(values).sort((a, b) => a - b).slice(0, 10);
  }, [getPreferredBuyIns, prefs, type]);

  const minBuyInCents = gameFormat === "freeroll" ? 0 : type === "online" ? 50 : 1;

  const formatBuyInButtonLabel = (valueCents: number, valueCurrency: string) => {
    if (valueCurrency === "JPY") {
      return `¥${Math.round(valueCents / 100)}`;
    }
    const symbol = valueCurrency === "USD" ? "$" : valueCurrency === "CAD" ? "CA$" : valueCurrency === "CNY" ? "CN¥" : "R$";
    const decimals = valueCents % 100 === 0 ? 0 : 2;
    return `${symbol}${(valueCents / 100).toFixed(decimals)}`;
  };

  const getVenueDefaultCurrency = (venueIdValue: string, currentType: "online" | "live") => {
    const selectedVenue = sortedVenues.find((venue: any) => String(venue.id) === venueIdValue);
    if (!selectedVenue) return currentType === "online" ? "USD" : "BRL";
    return (selectedVenue.currency as "BRL" | "USD" | "CAD" | "JPY" | "CNY") || (currentType === "online" ? "USD" : "BRL");
  };

  const handleVenueChange = (nextVenueId: string) => {
    setVenueId(nextVenueId);
    setCurrency(getVenueDefaultCurrency(nextVenueId, type));
  };

  // Auto-update currency when type changes
  useEffect(() => {
    setCurrency(type === "online" ? "USD" : "BRL");
    setVenueId("");
  }, [type]);

  const addTableMutation = trpc.sessions.addTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Mesa adicionada!", { description: "Mesa incluída na sessão." });
      onSuccess();
    },
    onError: (err) => {
      toast.error("Erro", { description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const buyInCents = Math.round(parseFloat(buyIn) * 100);
    if (isNaN(buyInCents) || buyInCents < minBuyInCents) {
      toast.error(gameFormat === "freeroll" ? "Buy-in inválido" : type === "online" ? "Buy-in mínimo para online é $0,50" : "Buy-in precisa ser maior que zero");
      return;
    }
    addTableMutation.mutate({
      activeSessionId,
      venueId: venueId ? parseInt(venueId) : undefined,
      type,
      gameFormat: gameFormat as any,
      currency,
      buyIn: buyInCents,
      clubName: clubName || undefined,
      gameType: gameType || undefined,
      stakes: stakes || undefined,
    });
  };

  // Quick-fill from recent combo
  const fillFromCombo = (combo: NonNullable<typeof prefs>["recentCombos"][0]) => {
    setType(combo.type as "online" | "live");
    setGameFormat(combo.gameFormat as GameFormat);
    if (combo.venueId) setVenueId(combo.venueId.toString());
    setBuyIn(String(combo.buyIn / 100));
    if (combo.gameType) setGameType(combo.gameType);
    setCurrency(combo.currency as any);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quick combos */}
      {prefs && prefs.recentCombos.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Repetir sessão recente
          </p>
          <div className="flex flex-wrap gap-2">
            {prefs.recentCombos.slice(0, 3).map((combo, i) => {
              const venueName = venues?.find(v => v.id === combo.venueId)?.name;
              const fmtLabel = GAME_FORMATS.find(f => f.value === combo.gameFormat)?.label ?? combo.gameFormat;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => fillFromCombo(combo)}
                  className="text-xs px-2 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors"
                >
                  {venueName ? `${venueName} · ` : ""}{fmtLabel} · {formatBuyInButtonLabel(combo.buyIn, combo.currency ?? (combo.type === "online" ? "USD" : "BRL"))}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Type toggle */}
      <div className="flex gap-2">
        {playTypeOrder.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${type === option ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted/30 hover:bg-muted"}`}
          >
            {option === "online" ? <Wifi className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            {option === "online" ? "Online" : "Live"}
          </button>
        ))}
      </div>

      {/* Game Format */}
      <div className="space-y-1">
        <Label>Tipo de Jogo</Label>
        <Select value={gameFormat} onValueChange={(v) => setGameFormat(v as GameFormat)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortedFormats.map((fmt, i) => (
              <SelectItem key={fmt.value} value={fmt.value}>
                <span className="flex items-center gap-2">
                  {fmt.emoji} {fmt.label}
                  {i === 0 && prefs?.preferredGameFormats?.[0] === fmt.value && (
                    <span className="text-xs text-muted-foreground">(mais usado)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Venue */}
      <div className="space-y-1">
        <Label>{type === "online" ? "Plataforma" : "Local"}</Label>
        <Select value={venueId} onValueChange={handleVenueChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Selecione ${type === "online" ? "a plataforma" : "o local"}`} />
          </SelectTrigger>
          <SelectContent>
            {sortedVenues.map((venue, i) => (
              <SelectItem key={venue.id} value={venue.id.toString()}>
                <span className="flex items-center gap-2">
                  {venue.logoUrl && (
                    <img src={venue.logoUrl} alt={venue.name} className="h-5 w-5 rounded object-contain" />
                  )}
                  {venue.name}
                  {i === 0 && prefs?.preferredVenueIds?.[0] === venue.id && (
                    <span className="text-xs text-muted-foreground">(favorita)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Currency + Buy-in */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Moeda</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">🇧🇷 BRL</SelectItem>
              <SelectItem value="USD">🇺🇸 USD</SelectItem>
              <SelectItem value="CAD">🇨🇦 CAD</SelectItem>
              <SelectItem value="JPY">🇯🇵 JPY</SelectItem>
              <SelectItem value="CNY">🇨🇳 CNY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buy-in ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : "R$"})</Label>
          <Input
            type="number"
            step="0.01"
            min={gameFormat === "freeroll" ? "0" : type === "online" ? "0.5" : "0.01"}
            placeholder="0,00"
            value={buyIn}
            onChange={(e) => setBuyIn(e.target.value)}
            required
          />
          {suggestedBuyIns.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {suggestedBuyIns.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBuyIn(String(val / 100))}
                  className="text-xs px-2 py-0.5 rounded border border-border bg-muted/30 hover:bg-muted transition-colors"
                >
                  {formatBuyInButtonLabel(val, currency)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optional: game type + stakes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Variante (opcional)</Label>
          <Input placeholder="NL Hold'em, PLO..." value={gameType} onChange={(e) => setGameType(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Stakes (opcional)</Label>
          <Input placeholder="1/2, 2/5..." value={stakes} onChange={(e) => setStakes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Clube (opcional)</Label>
        <Input placeholder="Ex: Alpha Club" value={clubName} onChange={(e) => setClubName(e.target.value)} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={addTableMutation.isPending}>
          {addTableMutation.isPending ? "Adicionando..." : "Adicionar Mesa"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Cash-out Dialog ───────────────────────────────────────────────────────────
interface CashOutDialogProps {
  tableId: number;
  currency: string;
  buyIn: number;
  onClose: () => void;
}

function CashOutDialog({ tableId, currency, buyIn, onClose }: CashOutDialogProps) {
  const utils = trpc.useUtils();
  const [cashOut, setCashOut] = useState("0");

  const updateMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Cash-out registrado!");
      onClose();
    },
    onError: (err) => toast.error("Erro", { description: err.message }),
  });

  const profit = Math.round(parseFloat(cashOut) * 100) - buyIn;
  const profitDisplay = formatCurrency(Math.abs(profit), currency);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Cash-out ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : "R$"})</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={cashOut}
          onChange={(e) => setCashOut(e.target.value)}
          autoFocus
        />
      </div>
      {!isNaN(profit) && (
        <div className={`text-sm font-medium flex items-center gap-1 ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
          {profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {profit >= 0 ? "+" : "-"}{profitDisplay}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => {
            const cents = Math.round(parseFloat(cashOut) * 100);
            if (isNaN(cents) || cents < 0) return;
            updateMutation.mutate({ id: tableId, cashOut: cents, endedAt: new Date() });
          }}
          disabled={updateMutation.isPending}
        >
          Confirmar
        </Button>
      </DialogFooter>
    </div>
  );
}

interface RebuyDialogProps {
  tableId: number;
  currency: string;
  currentBuyIn: number;
  suggestedRebuy: number;
  onClose: () => void;
}

function RebuyDialog({ tableId, currency, currentBuyIn, suggestedRebuy, onClose }: RebuyDialogProps) {
  const utils = trpc.useUtils();
  const [rebuy, setRebuy] = useState(String(Math.max(1, suggestedRebuy) / 100));

  const updateMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast.success("Rebuy adicionado!");
      onClose();
    },
    onError: (err) => toast.error("Erro", { description: err.message }),
  });

  const rebuyCents = Math.round(parseFloat(rebuy) * 100);
  const nextBuyIn = Number.isFinite(rebuyCents) && rebuyCents > 0 ? currentBuyIn + rebuyCents : currentBuyIn;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Valor do Rebuy ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : "R$"})</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={rebuy}
          onChange={(e) => setRebuy(e.target.value)}
          autoFocus
        />
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRebuy(String(suggestedRebuy / 100))}>
            Rebuy simples (1x)
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRebuy(String((suggestedRebuy * 2) / 100))}>
            Rebuy duplo (2x)
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Novo buy-in total da mesa: <span className="font-medium text-foreground">{formatCurrency(nextBuyIn, currency)}</span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => {
            if (!Number.isFinite(rebuyCents) || rebuyCents <= 0) {
              toast.error("Informe um valor válido para o rebuy.");
              return;
            }
            updateMutation.mutate({ id: tableId, buyIn: currentBuyIn + rebuyCents });
          }}
          disabled={updateMutation.isPending}
        >
          Confirmar Rebuy
        </Button>
      </DialogFooter>
    </div>
  );
}

interface AddOnDialogProps {
  tableId: number;
  currency: string;
  currentBuyIn: number;
  onClose: () => void;
}

function AddOnDialog({ tableId, currency, currentBuyIn, onClose }: AddOnDialogProps) {
  const utils = trpc.useUtils();
  const [addOn, setAddOn] = useState(String(Math.max(1, currentBuyIn) / 100));

  const updateMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast.success("Add-on adicionado!");
      onClose();
    },
    onError: (err) => toast.error("Erro", { description: err.message }),
  });

  const addOnCents = Math.round(parseFloat(addOn) * 100);
  const nextBuyIn = Number.isFinite(addOnCents) && addOnCents > 0 ? currentBuyIn + addOnCents : currentBuyIn;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Valor do Add-on ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : "R$"})</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={addOn}
          onChange={(e) => setAddOn(e.target.value)}
          autoFocus
        />
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAddOn(String(currentBuyIn / 100))}>
            Add-on simples (1x)
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAddOn(String((currentBuyIn * 2) / 100))}>
            Add-on duplo (2x)
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Novo buy-in total da mesa: <span className="font-medium text-foreground">{formatCurrency(nextBuyIn, currency)}</span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => {
            if (!Number.isFinite(addOnCents) || addOnCents <= 0) {
              toast.error("Informe um valor válido para o add-on.");
              return;
            }
            updateMutation.mutate({ id: tableId, buyIn: currentBuyIn + addOnCents });
          }}
          disabled={updateMutation.isPending}
        >
          Confirmar Add-on
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Active Session Panel ──────────────────────────────────────────────────────
interface ActiveSessionPanelProps {
  session: {
    id: number;
    startedAt: string | Date;
    notes?: string | null;
    tables: Array<{
      id: number;
      type: string;
      gameFormat: string;
      currency: string;
      buyIn: number;
      cashOut?: number | null;
      venueId?: number | null;
      clubName?: string | null;
      gameType?: string | null;
      stakes?: string | null;
      startedAt: string | Date;
      endedAt?: string | Date | null;
    }>;
  };
  onFinalized: () => void;
}

function ActiveSessionPanel({ session, onFinalized }: ActiveSessionPanelProps) {
  const utils = trpc.useUtils();
  const [elapsed, setElapsed] = useState(formatDuration(session.startedAt));
  const [showAddTable, setShowAddTable] = useState(false);
  const [cashOutTableId, setCashOutTableId] = useState<number | null>(null);
  const [rebuyTableId, setRebuyTableId] = useState<number | null>(null);
  const [addOnTableId, setAddOnTableId] = useState<number | null>(null);
  const [editTableId, setEditTableId] = useState<number | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizeStep, setFinalizeStep] = useState<"ask-more" | "confirm">("ask-more");
  const [finalNotes, setFinalNotes] = useState("");
  const [lastHandStatsSnapshot, setLastHandStatsSnapshot] = useState<{
    kk: { hands: number; wins: number; losses: number };
    jj: { hands: number; wins: number; losses: number };
  } | null>(null);

  const { data: venues } = trpc.venues.list.useQuery({});
  const { data: fxRates } = trpc.currency.getRates.useQuery();

  // Live timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatDuration(session.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  const removeMutation = trpc.sessions.removeTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Mesa removida.");
    },
  });

  const updateTableMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast.success("Mesa atualizada!");
      setEditTableId(null);
    },
    onError: (err) => toast.error("Erro ao atualizar mesa", { description: err.message }),
  });

  const replayTableMutation = trpc.sessions.addTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast.success("Nova mesa criada com os mesmos dados!");
    },
    onError: (err) => toast.error("Erro ao jogar de novo", { description: err.message }),
  });

  const finalizeMutation = trpc.sessions.finalize.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      utils.sessions.list.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      toast("Sessão finalizada!", { description: "Resultado salvo com sucesso." });
      onFinalized();
    },
    onError: (err) => toast.error("Erro ao finalizar", { description: err.message }),
  });

  const discardMutation = trpc.sessions.discard.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Sessão descartada.");
      onFinalized();
    },
  });

  const { data: handPatternStats } = trpc.sessions.handPatternStats.useQuery();

  const registerHandResultMutation = trpc.sessions.registerHandResult.useMutation({
    onSuccess: () => {
      utils.sessions.handPatternStats.invalidate();
      utils.feed.handPatternStats.invalidate();
    },
    onError: (err) => toast.error("Erro ao registrar mão", { description: err.message }),
  });

  const updateHandStatsMutation = trpc.sessions.updateHandStats.useMutation({
    onSuccess: () => {
      utils.sessions.handPatternStats.invalidate();
      utils.feed.handPatternStats.invalidate();
      toast.success("Última ação desfeita!");
      setLastHandStatsSnapshot(null);
    },
    onError: (err) => toast.error("Erro ao desfazer ação", { description: err.message }),
  });

  const handleRegisterHandResult = (hand: "kk" | "jj", outcome: "win" | "loss") => {
    if (!handPatternStats) return;
    setLastHandStatsSnapshot({
      kk: {
        hands: handPatternStats.kk?.hands ?? 0,
        wins: handPatternStats.kk?.wins ?? 0,
        losses: handPatternStats.kk?.losses ?? 0,
      },
      jj: {
        hands: handPatternStats.jj?.hands ?? 0,
        wins: handPatternStats.jj?.wins ?? 0,
        losses: handPatternStats.jj?.losses ?? 0,
      },
    });
    registerHandResultMutation.mutate({ hand, outcome });
  };

  const handleUndoLastHandAction = () => {
    if (!lastHandStatsSnapshot) return;
    updateHandStatsMutation.mutate(lastHandStatsSnapshot);
  };

  // Calculate totals in BRL for display consistency.
  const totalBuyIn = session.tables.reduce((s, t) => s + convertToBrlCents(t.buyIn, t.currency, fxRates), 0);
  const completedTables = session.tables.filter(t => t.endedAt !== null && t.endedAt !== undefined);
  const totalCashOut = completedTables.reduce((s, t) => s + convertToBrlCents(t.cashOut ?? 0, t.currency, fxRates), 0);
  const totalProfit = completedTables.length > 0
    ? totalCashOut - completedTables.reduce((s, t) => s + convertToBrlCents(t.buyIn, t.currency, fxRates), 0)
    : null;

  const cashOutTable = session.tables.find(t => t.id === cashOutTableId);
  const rebuyTable = session.tables.find(t => t.id === rebuyTableId);
  const addOnTable = session.tables.find(t => t.id === addOnTableId);

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-sm">Sessão em andamento</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-lg font-bold text-primary">
            <Timer className="h-5 w-5" />
            {elapsed}
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Buy-in total</p>
            <p className="font-semibold text-sm">R${(totalBuyIn / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mesas</p>
            <p className="font-semibold text-sm">{session.tables.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resultado</p>
            <p className={`font-semibold text-sm ${totalProfit === null ? "text-muted-foreground" : totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalProfit === null ? "—" : `${totalProfit >= 0 ? "+" : ""}R$${(totalProfit / 100).toFixed(2)}`}
            </p>
          </div>
        </div>
      </div>

      {/* KK/JJ counters */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Contador KK e Vala Vala</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Marque direto na sessão</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={handleUndoLastHandAction}
              disabled={!lastHandStatsSnapshot || registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Desfazer última ação
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { key: "kk", label: "KK (Rei Rei)", wins: handPatternStats?.kk?.wins ?? 0, losses: handPatternStats?.kk?.losses ?? 0, hands: handPatternStats?.kk?.hands ?? 0 },
            { key: "jj", label: "JJ (Vala Vala)", wins: handPatternStats?.jj?.wins ?? 0, losses: handPatternStats?.jj?.losses ?? 0, hands: handPatternStats?.jj?.hands ?? 0 },
          ] as const).map((item) => (
            <div key={item.key} className="rounded-lg border border-border/60 bg-background/60 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">Total: {item.hands}</p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10"
                  onClick={() => handleRegisterHandResult(item.key, "win")}
                  disabled={registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
                >
                  + Vitória ({item.wins})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs text-red-600 border-red-500/40 hover:bg-red-500/10"
                  onClick={() => handleRegisterHandResult(item.key, "loss")}
                  disabled={registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
                >
                  + Derrota ({item.losses})
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tables list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mesas ({session.tables.length})</h3>
          <Button size="sm" variant="outline" onClick={() => setShowAddTable(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Mesa
          </Button>
        </div>

        {session.tables.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            <p>Nenhuma mesa adicionada ainda.</p>
            <p className="text-xs mt-1">Clique em "Adicionar Mesa" para começar.</p>
          </div>
        ) : (
          session.tables.map((table) => {
            const venue = venues?.find(v => v.id === table.venueId);
            const fmt = GAME_FORMATS.find(f => f.value === table.gameFormat);
            const isFinished = table.endedAt !== null && table.endedAt !== undefined;
            const canUseAddOn = table.gameFormat !== "cash_game";
            const profit = isFinished ? (table.cashOut ?? 0) - table.buyIn : null;

            return (
              <div key={table.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isFinished ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5"}`}>
                {/* Venue logo */}
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {venue?.logoUrl ? (
                    <img src={venue.logoUrl} alt={venue.name} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="text-lg">{fmt?.emoji ?? "🃏"}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{venue?.name ?? (table.type === "online" ? "Online" : "Live")}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{fmt?.label ?? table.gameFormat}</Badge>
                    {table.type === "online" ? (
                      <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      Buy-in: {formatCurrency(table.buyIn, table.currency)}
                    </span>
                      {table.clubName && (
                        <span className="text-xs text-muted-foreground">Clube: {table.clubName}</span>
                      )}
                    {isFinished && profit !== null && (
                      <span className={`text-xs font-medium ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {profit >= 0 ? "+" : ""}{formatCurrency(Math.abs(profit), table.currency)}
                      </span>
                    )}
                    {!isFinished && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        Em jogo
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => replayTableMutation.mutate({
                        activeSessionId: session.id,
                        venueId: table.venueId ?? undefined,
                        type: table.type as "online" | "live",
                        gameFormat: table.gameFormat as GameFormat,
                        currency: table.currency as "BRL" | "USD" | "CAD" | "JPY" | "CNY",
                        buyIn: table.buyIn,
                        clubName: table.clubName ?? undefined,
                        gameType: table.gameType ?? undefined,
                        stakes: table.stakes ?? undefined,
                        notes: undefined,
                      })}
                      disabled={replayTableMutation.isPending}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Jogar de novo
                    </Button>
                  )}
                  {!isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setRebuyTableId(table.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Rebuy
                    </Button>
                  )}
                  {!isFinished && canUseAddOn && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setAddOnTableId(table.id)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" /> Add-on
                    </Button>
                  )}
                  {!isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => setCashOutTableId(table.id)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" /> Cash-out
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                    onClick={() => setEditTableId(table.id)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMutation.mutate({ id: table.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Session actions */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => setShowDiscard(true)}
        >
          <XCircle className="h-4 w-4 mr-2" /> Descartar
        </Button>
        <Button
          className="flex-1"
          onClick={() => { setFinalizeStep("ask-more"); setShowFinalize(true); }}
          disabled={session.tables.length === 0}
        >
          <CheckCircle className="h-4 w-4 mr-2" /> Finalizar Sessão
        </Button>
      </div>

      {/* Edit table dialog */}
      {editTableId !== null && (() => {
        const et = session.tables.find(t => t.id === editTableId);
        if (!et) return null;
        return (
          <EditTableDialog
            table={et}
            venues={venues ?? []}
            onSave={(data) => updateTableMutation.mutate({ id: et.id, ...data })}
            onClose={() => setEditTableId(null)}
            isPending={updateTableMutation.isPending}
          />
        );
      })()}

      {/* Add table dialog */}
      <Dialog open={showAddTable} onOpenChange={setShowAddTable}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Mesa</DialogTitle>
          </DialogHeader>
          <AddTableForm
            activeSessionId={session.id}
            onSuccess={() => setShowAddTable(false)}
            onCancel={() => setShowAddTable(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add-on dialog */}
      <Dialog open={addOnTableId !== null} onOpenChange={(open) => !open && setAddOnTableId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Add-on</DialogTitle>
          </DialogHeader>
          {addOnTable && (
            <AddOnDialog
              tableId={addOnTable.id}
              currency={addOnTable.currency}
              currentBuyIn={addOnTable.buyIn}
              onClose={() => setAddOnTableId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Rebuy dialog */}
      <Dialog open={rebuyTableId !== null} onOpenChange={(open) => !open && setRebuyTableId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Rebuy</DialogTitle>
          </DialogHeader>
          {rebuyTable && (
            <RebuyDialog
              tableId={rebuyTable.id}
              currency={rebuyTable.currency}
              currentBuyIn={rebuyTable.buyIn}
              suggestedRebuy={Math.max(100, rebuyTable.buyIn)}
              onClose={() => setRebuyTableId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Cash-out dialog */}
      <Dialog open={cashOutTableId !== null} onOpenChange={(open) => !open && setCashOutTableId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Cash-out</DialogTitle>
          </DialogHeader>
          {cashOutTable && (
            <CashOutDialog
              tableId={cashOutTable.id}
              currency={cashOutTable.currency}
              buyIn={cashOutTable.buyIn}
              onClose={() => setCashOutTableId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Finalize dialog — two-step */}
      <Dialog open={showFinalize} onOpenChange={(open) => { if (!open) setShowFinalize(false); }}>
        <DialogContent className="max-w-sm">
          {finalizeStep === "ask-more" ? (
            <>
              <DialogHeader>
                <DialogTitle>Deseja adicionar mais alguma mesa?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Você tem <strong>{session.tables.length}</strong> {session.tables.length === 1 ? "mesa" : "mesas"} registrada{session.tables.length === 1 ? "" : "s"} nesta sessão.
                Deseja adicionar mais antes de finalizar?
              </p>
              <DialogFooter className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowFinalize(false); setShowAddTable(true); }}>
                  Sim, adicionar mesa
                </Button>
                <Button onClick={() => setFinalizeStep("confirm")}>
                  Não, finalizar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Tem certeza que deseja finalizar a sessão?</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duração</span>
                    <span className="font-mono font-medium">{elapsed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mesas</span>
                    <span className="font-medium">{session.tables.length}</span>
                  </div>
                  {totalProfit !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resultado estimado</span>
                      <span className={`font-semibold ${totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {totalProfit >= 0 ? "+" : ""}R${(totalProfit / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Notas (opcional)</Label>
                  <Textarea
                    placeholder="Como foi a sessão?"
                    value={finalNotes}
                    onChange={(e) => setFinalNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFinalizeStep("ask-more")}>Voltar</Button>
                  <Button
                    onClick={() => finalizeMutation.mutate({ activeSessionId: session.id, notes: finalNotes || undefined })}
                    disabled={finalizeMutation.isPending}
                  >
                    {finalizeMutation.isPending ? "Salvando..." : "Confirmar Finalização"}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mesas desta sessão serão perdidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => discardMutation.mutate({ activeSessionId: session.id })}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Session History Card ──────────────────────────────────────────────────────
function SessionCard({ session }: { session: any }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTableId, setEditTableId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const utils = trpc.useUtils();
  const { data: tables } = trpc.sessions.getTables.useQuery(
    { sessionId: session.id },
    { enabled: expanded || editing || editTableId !== null }
  );
  const { data: venues } = trpc.venues.list.useQuery({});

  // Session-level edit state
  const [editNotes, setEditNotes] = useState(session.notes ?? "");
  const [editType, setEditType] = useState<"online" | "live">(session.type ?? "online");
  const [editGameFormat, setEditGameFormat] = useState(session.gameFormat ?? "tournament");
  const [editCurrency, setEditCurrency] = useState(session.currency ?? "BRL");
  const [editVenueId, setEditVenueId] = useState(session.venueId?.toString() ?? "");
  const [editBuyIn, setEditBuyIn] = useState(session.buyIn != null ? (session.buyIn / 100).toFixed(2) : "");
  const [editCashOut, setEditCashOut] = useState(session.cashOut != null ? (session.cashOut / 100).toFixed(2) : "");

  const isLegacySession = (session.tableCount ?? 0) === 0;

  const updateMutation = trpc.sessions.update.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.venues.statsByVenue.invalidate();
      utils.sessions.recentTables.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.getCurrent.invalidate();
      toast.success("Sessão atualizada!");
      setEditing(false);
    },
    onError: (err) => toast.error("Erro ao atualizar", { description: err.message }),
  });

  const deleteMutation = trpc.sessions.delete.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.recentTables.invalidate();
      utils.venues.statsByVenue.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      utils.bankroll.getCurrent.invalidate();
      toast.success("Sessão excluída!");
      setShowDeleteConfirm(false);
    },
    onError: (err) => toast.error("Erro ao excluir sessão", { description: err.message }),
  });

  const updateTableMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getTables.invalidate({ sessionId: session.id });
      utils.sessions.list.invalidate();
      toast.success("Mesa atualizada!");
      setEditTableId(null);
    },
    onError: (err) => toast.error("Erro ao atualizar mesa", { description: err.message }),
  });

  const sessionBuyIn = session.totalTableBuyIn ?? session.buyIn;
  const sessionCashOut = session.totalTableCashOut ?? session.cashOut;
  const profit = session.totalTableProfit ?? (sessionCashOut - sessionBuyIn);
  const profitPct = typeof session.roi === "number" ? session.roi.toFixed(1) : (sessionBuyIn > 0 ? ((profit / sessionBuyIn) * 100).toFixed(1) : "0");
  const tableCount = session.tableCount ?? (tables?.length ?? 0);
  const fmt = GAME_FORMATS.find(f => f.value === session.gameFormat);
  const date = new Date(session.sessionDate);
  const venueName = session.venueName;
  const venueLogoUrl = session.venueLogoUrl;
  const isMultiVenue = (session.uniqueVenueCount ?? 0) > 1;
  const venueBadgeText = isMultiVenue ? `${session.uniqueVenueCount} plataformas` : venueName;

  function handleSaveEdit() {
    if (isLegacySession) {
      const buyInCents = editBuyIn ? Math.round(parseFloat(editBuyIn) * 100) : undefined;
      const cashOutCents = editCashOut !== "" ? Math.round(parseFloat(editCashOut) * 100) : undefined;
      updateMutation.mutate({
        id: session.id,
        notes: editNotes || undefined,
        type: editType,
        gameFormat: editGameFormat as any,
        currency: editCurrency as any,
        venueId: editVenueId ? parseInt(editVenueId) : undefined,
        buyIn: buyInCents,
        cashOut: cashOutCents,
      });
    } else {
      updateMutation.mutate({
        id: session.id,
        notes: editNotes || undefined,
      });
    }
  }

  return (
    <>
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
          {isMultiVenue ? (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          ) : venueLogoUrl ? (
            <img src={venueLogoUrl} alt={venueName ?? ""} className="h-8 w-8 rounded object-contain" />
          ) : (
            fmt?.emoji ?? "🃏"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{fmt?.label ?? session.gameFormat}</span>
            <Badge variant="outline" className="text-xs shrink-0">{session.type === "online" ? "Online" : "Live"}</Badge>
            {venueBadgeText && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{venueBadgeText}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{date.toLocaleDateString("pt-BR")}</span>
            <span>{Math.floor(session.durationMinutes / 60)}h{session.durationMinutes % 60}m</span>
            <span>{tableCount} mesa{tableCount === 1 ? "" : "s"}</span>
            {venueBadgeText && (
              <span className="sm:hidden flex items-center gap-0.5">
                {isMultiVenue ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                {venueBadgeText}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-semibold text-sm ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
            {profit >= 0 ? "+" : ""}R${(profit / 100).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">{profitPct}% ROI</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Editar sessão"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            disabled={deleteMutation.isPending}
            title="Excluir sessão"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Buy-in</p>
              <p className="font-medium">R${(sessionBuyIn / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash-out</p>
              <p className="font-medium">R${(sessionCashOut / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">R$/hora</p>
              <p className={`font-medium ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                {typeof session.hourlyRate === "number"
                  ? `${session.hourlyRate >= 0 ? "+" : ""}R$${(session.hourlyRate / 100).toFixed(2)}`
                  : (session.durationMinutes > 0 ? `${profit >= 0 ? "+" : ""}R${((profit / session.durationMinutes) * 60 / 100).toFixed(2)}` : "—")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <p className="text-xs text-muted-foreground">ROI</p>
              <p className={`font-medium ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>{profitPct}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Melhor mesa</p>
              <p className={`font-medium ${(session.bestTableProfit ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {session.bestTableProfit == null ? "—" : `${session.bestTableProfit >= 0 ? "+" : ""}R$${(session.bestTableProfit / 100).toFixed(2)}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pior mesa</p>
              <p className={`font-medium ${(session.worstTableProfit ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {session.worstTableProfit == null ? "—" : `${session.worstTableProfit >= 0 ? "+" : ""}R$${(session.worstTableProfit / 100).toFixed(2)}`}
              </p>
            </div>
          </div>

          {tables && tables.length > 0 && (
            <div className="space-y-1">
              {(() => {
                const venueNames = Array.from(new Set(
                  tables
                    .map((t) => venues?.find(v => v.id === t.venueId)?.name)
                    .filter((name): name is string => Boolean(name))
                ));
                if (venueNames.length === 0) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    Plataformas: <span className="text-foreground">{venueNames.join(", ")}</span>
                  </p>
                );
              })()}
              <p className="text-xs text-muted-foreground font-medium">Mesas ({tables.length})</p>
              {tables.map((t) => {
                const tfmt = GAME_FORMATS.find(f => f.value === t.gameFormat);
                const tp = (t.cashOut ?? 0) - t.buyIn;
                const tDuration = calcTableDuration(t.startedAt, t.endedAt);
                const tableVenue = venues?.find(v => v.id === t.venueId);
                return (
                  <div key={t.id} className="text-xs py-1.5 px-2 rounded bg-muted/30 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{tfmt?.emoji} {tfmt?.label} · {t.type === "online" ? "Online" : "Live"}</span>
                      <span className={tp >= 0 ? "text-green-500" : "text-red-500"}>
                        {tp >= 0 ? "+" : ""}{formatCurrency(Math.abs(tp), t.currency)}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {tableVenue?.name ?? "Plataforma não informada"}
                      {t.clubName ? ` · Clube: ${t.clubName}` : ""}
                    </div>
                    {tDuration > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatMinutes(tDuration)}</span>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setEditTableId(t.id)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> Editar mesa
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {session.notes && (
            <p className="text-xs text-muted-foreground italic">"{session.notes}"</p>
          )}

          {/* Ações da sessão */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
              <Edit2 className="h-3 w-3" /> Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" /> Excluir
            </Button>
          </div>
        </div>
      )}
    </Card>

    {editTableId !== null && tables && venues && (() => {
      const table = tables.find((t) => t.id === editTableId);
      if (!table) return null;
      return (
        <EditTableDialog
          table={table as any}
          venues={venues}
          onSave={(data) => updateTableMutation.mutate({ id: table.id, ...data })}
          onClose={() => setEditTableId(null)}
          isPending={updateTableMutation.isPending}
        />
      );
    })()}

    {/* Modal de edição */}
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Sessão</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Sessões com mesas: lista de mesas editáveis */}
          {!isLegacySession && tables && tables.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Mesas ({tables.length})</p>
              {tables.map((t) => {
                const tfmt = GAME_FORMATS.find(f => f.value === t.gameFormat);
                const tp = (t.cashOut ?? 0) - t.buyIn;
                const tableVenue = venues?.find(v => v.id === t.venueId);
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{tfmt?.emoji} {tfmt?.label}</span>
                      <span className="text-muted-foreground">{tableVenue?.name ?? "Sem plataforma"}{t.clubName ? ` · ${t.clubName}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={tp >= 0 ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
                        {tp >= 0 ? "+" : ""}{formatCurrency(Math.abs(tp), t.currency)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => { setEditing(false); setEditTableId(t.id); }}
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> Editar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sessões legadas (sem mesas): edição completa dos campos da sessão */}
          {isLegacySession && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={editType} onValueChange={(v) => setEditType(v as "online" | "live")}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Moeda</Label>
                  <Select value={editCurrency} onValueChange={setEditCurrency}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL (R$)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="CAD">CAD (CA$)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                      <SelectItem value="CNY">CNY (CN¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Formato</Label>
                <Select value={editGameFormat} onValueChange={setEditGameFormat}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GAME_FORMATS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.emoji} {f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Plataforma / Local</Label>
                <Select value={editVenueId} onValueChange={setEditVenueId}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {venues && venues.length > 0 ? (
                      (() => {
                        const seen = new Set<string>();
                        return venues.filter(v => {
                          if (seen.has(v.name)) return false;
                          seen.add(v.name);
                          return true;
                        }).map(v => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            <div className="flex items-center gap-2">
                              {v.logoUrl && <img src={v.logoUrl} alt={v.name} className="h-4 w-4 object-contain" />}
                              {v.name}
                            </div>
                          </SelectItem>
                        ));
                      })()
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground text-center">Nenhuma plataforma</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Buy-in</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editBuyIn}
                    onChange={e => setEditBuyIn(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cash-out</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editCashOut}
                    onChange={e => setEditCashOut(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea className="text-sm mt-1 resize-none" rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir sessão?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação remove a sessão e as mesas vinculadas do histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate({ id: session.id })}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Main Sessions Page ────────────────────────────────────────────────────────
export default function Sessions() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { preferences: prefs, playTypeOrder, sortFormats, sortVenues, primaryType } = useBehaviorProfile();
  const [activeSection, setActiveSection] = useState<"history" | "import">("history");
  const [importRawText, setImportRawText] = useState("");
  const [showPlayStyleOnboarding, setShowPlayStyleOnboarding] = useState(false);
  const [selectedPlayStyle, setSelectedPlayStyle] = useState<"online" | "live">(primaryType);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["tournament"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedBuyInRangesOnline, setSelectedBuyInRangesOnline] = useState<string[]>([]);
  const [selectedBuyInRangesLive, setSelectedBuyInRangesLive] = useState<string[]>([]);
  const [playsMultiPlatform, setPlaysMultiPlatform] = useState<boolean>(false);
  const [showInGlobalRanking, setShowInGlobalRanking] = useState<boolean>(false);
  const [showInFriendsRanking, setShowInFriendsRanking] = useState<boolean>(false);
  const [rankingConsentTouched, setRankingConsentTouched] = useState<boolean>(false);

  const { data: activeSession, isLoading: loadingActive } = trpc.sessions.getActive.useQuery(undefined, {
    refetchInterval: 5000, // poll every 5s to keep timer in sync
  });

  const { data: sessions, isLoading: loadingSessions } = trpc.sessions.list.useQuery({});
  const { data: onboardingVenues } = trpc.venues.list.useQuery({});
  const { data: onboardingProfile } = trpc.sessions.getOnboardingProfile.useQuery();

  const saveOnboardingProfileMutation = trpc.sessions.saveOnboardingProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.sessions.getUserPreferences.invalidate();
      utils.sessions.getOnboardingProfile.invalidate();
      toast.success("Preferência salva!", {
        description: "Vamos priorizar suas opções favoritas desde o começo.",
      });
      setShowPlayStyleOnboarding(false);
    },
    onError: (err) => toast.error("Erro ao salvar preferência", { description: err.message }),
  });

  const startMutation = trpc.sessions.startActive.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Sessão iniciada!", { description: "Timer rodando. Adicione suas mesas." });
    },
    onError: (err) => toast.error("Erro", { description: err.message }),
  });

  const importPreviewMutation = trpc.sessions.importPreview.useMutation({
    onError: (err) => toast.error("Falha ao analisar texto", { description: err.message }),
  });

  const importFromTextMutation = trpc.sessions.importFromText.useMutation({
    onSuccess: (result) => {
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.recentTables.invalidate();
      utils.venues.statsByVenue.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.getCurrent.invalidate();
      toast.success("Importação concluída", { description: result.message });
      setImportRawText("");
      importPreviewMutation.reset();
      setActiveSection("history");
    },
    onError: (err) => toast.error("Falha ao importar", { description: err.message }),
  });

  useEffect(() => {
    if (!user || onboardingProfile === undefined) return;
  }, [user, onboardingProfile]);

  useEffect(() => {
    if (!onboardingProfile) return;
    if (onboardingProfile.preferredPlayType === "online" || onboardingProfile.preferredPlayType === "live") {
      setSelectedPlayStyle(onboardingProfile.preferredPlayType);
    }
    const onlineValues = onboardingProfile.preferredBuyInsOnline ?? [];
    const liveValues = onboardingProfile.preferredBuyInsLive ?? [];
    setSelectedBuyInRangesOnline(mapBuyInsToRangeKeys(onlineValues, "online"));
    setSelectedBuyInRangesLive(mapBuyInsToRangeKeys(liveValues, "live"));
    setShowInGlobalRanking(Boolean(onboardingProfile.showInGlobalRanking));
    setShowInFriendsRanking(Boolean(onboardingProfile.showInFriendsRanking));
    setRankingConsentTouched(Boolean(onboardingProfile.rankingConsentAnsweredAt));
  }, [onboardingProfile]);

  useEffect(() => {
    if (!onboardingProfile?.preferredPlayType) {
      setSelectedPlayStyle(primaryType);
    }
  }, [onboardingProfile?.preferredPlayType, primaryType]);

  if (!user) return null;
  const needsPlayStyleOnboarding = !user.onboardingCompletedAt;
  const needsRankingConsentOnboarding = !onboardingProfile?.rankingConsentAnsweredAt;

  const toggleOnboardingFormat = (format: string) => {
    setSelectedFormats((prev) => {
      if (prev.includes(format)) {
        return prev.filter((f) => f !== format);
      }
      return [...prev, format];
    });
  };

  const toggleOnboardingPlatform = (platformName: string) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformName)) {
        return prev.filter((name) => name !== platformName);
      }
      return [...prev, platformName];
    });
  };

  const toggleOnboardingBuyIn = (rangeKey: string, playType: "online" | "live") => {
    const setter = playType === "online" ? setSelectedBuyInRangesOnline : setSelectedBuyInRangesLive;
    setter((prev) => {
      if (prev.includes(rangeKey)) {
        return prev.filter((value) => value !== rangeKey);
      }
      return [...prev, rangeKey];
    });
  };

  const handleSaveOnboarding = () => {
    saveOnboardingProfileMutation.mutate({
      preferredPlayType: selectedPlayStyle,
      preferredPlatforms: selectedPlatforms,
      preferredFormats: selectedFormats,
      preferredBuyIns: (selectedPlayStyle === "online" ? selectedBuyInRangesOnline : selectedBuyInRangesLive)
        .map((rangeKey) => getRangeValueByType(rangeKey, selectedPlayStyle))
        .filter((value) => value > 0),
      preferredBuyInsOnline: selectedBuyInRangesOnline
        .map((rangeKey) => getRangeValueByType(rangeKey, "online"))
        .filter((value) => value > 0),
      preferredBuyInsLive: selectedBuyInRangesLive
        .map((rangeKey) => getRangeValueByType(rangeKey, "live"))
        .filter((value) => value > 0),
      playsMultiPlatform,
      showInGlobalRanking,
      showInFriendsRanking,
    });
  };

  const onboardingPlatformOptions = useMemo(() => {
    const filtered = (onboardingVenues ?? []).filter((venue) => venue.type === selectedPlayStyle);
    return sortVenues(filtered, (venue) => venue.id);
  }, [onboardingVenues, selectedPlayStyle, sortVenues]);

  const sortedOnboardingFormatOptions = useMemo(() => {
    const personalized = sortFormats(ONBOARDING_FORMAT_OPTIONS, (option) => option.value);
    return [...personalized].sort((a, b) => {
      const ai = selectedFormats.indexOf(a.value);
      const bi = selectedFormats.indexOf(b.value);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [selectedFormats, sortFormats]);

  const totalProfit = sessions?.reduce((s, sess) => {
    const tableProfit = (sess as any).totalTableProfit;
    return s + (typeof tableProfit === "number" ? tableProfit : (sess.cashOut - sess.buyIn));
  }, 0) ?? 0;
  const totalSessions = sessions?.length ?? 0;
  const winRate = totalSessions > 0
    ? ((sessions?.filter((s) => {
        const tableProfit = (s as any).totalTableProfit;
        const profit = typeof tableProfit === "number" ? tableProfit : (s.cashOut - s.buyIn);
        return profit > 0;
      }).length ?? 0) / totalSessions * 100).toFixed(0)
    : "0";
  const requiresRankingConsentChoice = needsRankingConsentOnboarding && !rankingConsentTouched;
  const shouldBlockSessionStart = needsPlayStyleOnboarding || needsRankingConsentOnboarding;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessões</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas sessões de poker</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setShowPlayStyleOnboarding(true)}>
            Configurar ABI
          </Button>
          {!activeSession && (
            <Button
              onClick={() => startMutation.mutate({})}
              disabled={startMutation.isPending}
              className="gap-2"
            >
              <Timer className="h-4 w-4" />
              {startMutation.isPending ? "Iniciando..." : "Nova Sessão"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={activeSection === "history" ? "default" : "outline"}
          onClick={() => setActiveSection("history")}
          className="gap-2"
        >
          <BarChart2 className="h-4 w-4" /> Histórico
        </Button>
        <Button
          type="button"
          variant={activeSection === "import" ? "default" : "outline"}
          onClick={() => setActiveSection("import")}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" /> Importação IA
        </Button>
      </div>

      {/* Stats bar */}
      {totalSessions > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Resultado Total</p>
              <p className={`font-bold text-base ${totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                {totalProfit >= 0 ? "+" : ""}R${(totalProfit / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Sessões</p>
              <p className="font-bold text-base">{totalSessions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">ITM Rate</p>
              <p className="font-bold text-base">{winRate}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active session */}
      {loadingActive ? (
        <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
      ) : activeSession ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Sessão Ativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActiveSessionPanel
              session={activeSession as any}
              onFinalized={() => utils.sessions.list.invalidate()}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <Timer className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nenhuma sessão ativa</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Clique em "Nova Sessão" para iniciar o timer e adicionar suas mesas.
          </p>
          <Button onClick={() => startMutation.mutate({})} disabled={startMutation.isPending}>
            <Timer className="h-4 w-4 mr-2" />
            Iniciar Sessão
          </Button>
        </div>
      )}

      <Dialog open={showPlayStyleOnboarding} onOpenChange={setShowPlayStyleOnboarding}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Configure seu perfil de jogo inicial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">
              Essas respostas servem para ordenar plataformas, formatos e buy-ins antes de voce ter historico suficiente.
            </p>

            <div className="space-y-2">
              <Label>Voce joga mais online ou presencial?</Label>
              <div className="grid grid-cols-2 gap-2">
                  {playTypeOrder.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={selectedPlayStyle === option ? "default" : "outline"}
                      onClick={() => setSelectedPlayStyle(option)}
                      className="gap-2"
                    >
                      {option === "online" ? <Wifi className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                      {option === "online" ? "Online" : "Presencial"}
                    </Button>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quais plataformas/locais voce mais usa?</Label>
              <div className="flex flex-wrap gap-2">
                {onboardingPlatformOptions.map((venue) => (
                  <Button
                    key={venue.id}
                    type="button"
                    variant={selectedPlatforms.includes(venue.name) ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => toggleOnboardingPlatform(venue.name)}
                  >
                    {venue.logoUrl ? (
                      <img src={venue.logoUrl} alt={venue.name} className="h-4 w-4 object-contain" />
                    ) : null}
                    {venue.name}
                  </Button>
                ))}
              </div>
              {onboardingPlatformOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">Cadastre plataformas em Configuracoes para selecionar aqui.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Quais formatos voce joga com mais frequencia?</Label>
              <div className="flex flex-wrap gap-2">
                {sortedOnboardingFormatOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={selectedFormats.includes(option.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleOnboardingFormat(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ficha ABI Online (sera usada quando a mesa for online)</Label>
              <div className="flex flex-wrap gap-2">
                {ONBOARDING_BUY_IN_RANGES.map((range) => (
                  <Tooltip key={range.key}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedBuyInRangesOnline.includes(range.key) ? "default" : "outline"}
                        onClick={() => toggleOnboardingBuyIn(range.key, "online")}
                      >
                        {getRangeLabelByType(range.key, "online")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{getRangeApproxLabel(range.key)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ficha ABI Live (sera usada quando a mesa for presencial)</Label>
              <div className="flex flex-wrap gap-2">
                {ONBOARDING_BUY_IN_RANGES.map((range) => (
                  <Button
                    key={`live-${range.key}`}
                    type="button"
                    size="sm"
                    variant={selectedBuyInRangesLive.includes(range.key) ? "default" : "outline"}
                    onClick={() => toggleOnboardingBuyIn(range.key, "live")}
                  >
                    {getRangeLabelByType(range.key, "live")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Voce costuma jogar em mais de uma plataforma na mesma sessao?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={playsMultiPlatform ? "default" : "outline"}
                  onClick={() => setPlaysMultiPlatform(true)}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  variant={!playsMultiPlatform ? "default" : "outline"}
                  onClick={() => setPlaysMultiPlatform(false)}
                >
                  Nao
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Consentimento de ranking (obrigatorio)</Label>
              <p className="text-xs text-muted-foreground">
                Ninguem entra automaticamente. Escolha onde seu desempenho pode aparecer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={showInGlobalRanking ? "default" : "outline"}
                  onClick={() => {
                    setShowInGlobalRanking((prev) => !prev);
                    setRankingConsentTouched(true);
                  }}
                >
                  Ranking Global {showInGlobalRanking ? "Ativo" : "Desativado"}
                </Button>
                <Button
                  type="button"
                  variant={showInFriendsRanking ? "default" : "outline"}
                  onClick={() => {
                    setShowInFriendsRanking((prev) => !prev);
                    setRankingConsentTouched(true);
                  }}
                >
                  Ranking de Amigos {showInFriendsRanking ? "Ativo" : "Desativado"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Combinacoes suportadas: global, amigos, ambos ou nenhum.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlayStyleOnboarding(false)}>
              Fechar
            </Button>
            <Button
              onClick={handleSaveOnboarding}
              disabled={saveOnboardingProfileMutation.isPending}
            >
              {saveOnboardingProfileMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeSection === "history" ? (
        <>
          {/* Session history */}
          {loadingSessions ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico</h2>
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : !activeSession ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma sessão registrada ainda.</p>
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Importação IA (texto livre)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Instruções para não bugar a importação</p>
              <p>1. Cole uma sessão por linha ou por bloco separado por linha em branco.</p>
              <p>2. Inclua data e valores, ex.: 08/04/2026 | PokerStars | torneio | buy-in 11 | cash-out 27.</p>
              <p>3. Se possível informe plataforma/local com "plataforma:" para aumentar precisão.</p>
              <p>4. Clique em "Analisar" antes de importar para revisar avisos.</p>
            </div>

            <div className="space-y-1">
              <Label>Texto para importar</Label>
              <Textarea
                rows={8}
                placeholder="Exemplo: 08/04/2026 | plataforma: PokerStars | torneio | buy-in 11 | cash-out 27 | 2h10"
                value={importRawText}
                onChange={(e) => setImportRawText(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={importRawText.trim().length < 10 || importPreviewMutation.isPending}
                onClick={() => importPreviewMutation.mutate({ rawText: importRawText })}
              >
                {importPreviewMutation.isPending ? "Analisando..." : "Analisar"}
              </Button>
              <Button
                type="button"
                disabled={!importPreviewMutation.data || importFromTextMutation.isPending}
                onClick={() => importFromTextMutation.mutate({ rawText: importRawText })}
              >
                {importFromTextMutation.isPending ? "Importando..." : "Importar para DB"}
              </Button>
            </div>

            {importPreviewMutation.data && (
              <div className="space-y-3">
                <div className="text-sm">
                  <p><span className="font-medium">Detectados:</span> {importPreviewMutation.data.totalDetected}</p>
                  <p><span className="font-medium">Prontos para importar:</span> {importPreviewMutation.data.readyToImport}</p>
                </div>

                {importPreviewMutation.data.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50/40 p-3 text-xs space-y-1">
                    <p className="font-medium text-amber-900">Avisos de validação</p>
                    {importPreviewMutation.data.warnings.slice(0, 8).map((warning, idx) => (
                      <p key={idx} className="text-amber-900">• {warning}</p>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {importPreviewMutation.data.items.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="text-xs rounded-md border bg-muted/20 p-2 space-y-0.5">
                      <p className="font-medium">{new Date(item.sessionDate).toLocaleDateString("pt-BR")} · {item.venueName}</p>
                      <p className="text-muted-foreground">
                        {item.type === "online" ? "Online" : "Live"} · {item.gameFormat} · {formatCurrency(item.buyIn, item.currency)} / {formatCurrency(item.cashOut, item.currency)} · {formatMinutes(item.durationMinutes)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
