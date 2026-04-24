import { useState, useEffect, useRef, useMemo, type DragEvent as ReactDragEvent, type ClipboardEvent as ReactClipboardEvent } from "react";
import { createPortal } from "react-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Timer, Trophy, TrendingUp, TrendingDown, Trash2,
  Edit2, CheckCircle, XCircle, Wifi, MapPin, Sparkles,
  ChevronDown, ChevronUp, Clock, DollarSign, BarChart2, Building2, RotateCcw, ImagePlus, Send, CalendarDays
} from "lucide-react";

// ─── Tournament Name Autocomplete ────────────────────────────────────────────
function normalizeTournamentKey(name: string) {
  return name.toLowerCase().replace(/[\d#\-_.()/\\]+/g, "").replace(/\s+/g, " ").trim();
}

function TournamentNameInput({
  value,
  onChange,
  knownNames,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  knownNames: string[];
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const typed = value.trim();
  const suggestions = typed.length >= 1
    ? knownNames.filter((n) => n.toLowerCase().includes(typed.toLowerCase()) && n.toLowerCase() !== typed.toLowerCase())
    : knownNames.slice();

  const similarNames = useMemo(() => {
    if (!typed || typed.length < 3) return [];
    const normTyped = normalizeTournamentKey(typed);
    if (!normTyped) return [];
    return knownNames.filter((n) => {
      const nk = normalizeTournamentKey(n);
      if (!nk || n.toLowerCase() === typed.toLowerCase()) return false;
      return nk === normTyped || nk.includes(normTyped) || normTyped.includes(nk);
    });
  }, [typed, knownNames]);

  function updateDropdownPosition() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dropdown = open && suggestions.length > 0 ? createPortal(
    <div
      style={{ ...dropdownStyle, pointerEvents: "auto" }}
      className="rounded-md border border-border bg-popover shadow-lg overflow-hidden"
    >
      {suggestions.slice(0, 8).map((s) => (
        <button
          key={s}
          type="button"
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate"
          onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
        >
          {s}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef}>
      <Input
        ref={inputRef}
        className={className}
        placeholder={placeholder ?? "Ex: Sunday Million"}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); updateDropdownPosition(); }}
        onFocus={() => { setOpen(true); updateDropdownPosition(); }}
      />
      {dropdown}
      {similarNames.length > 0 && (
        <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-400">
          ⚠️ Você tem um torneio parecido cadastrado. É o mesmo?
          <span className="block mt-0.5 font-semibold">{similarNames.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

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

type GameFormat =
  | "tournament"
  | "cash_game"
  | "turbo"
  | "hyper_turbo"
  | "sit_and_go"
  | "spin_and_go"
  | "bounty"
  | "satellite"
  | "freeroll"
  | "home_game";

const ONBOARDING_FORMAT_OPTIONS = [
  ...GAME_FORMATS.map((f) => ({ value: f.value, label: f.label })),
  { value: "heads_up", label: "Heads-up" },
];

const ONLINE_TO_BRL_RATE = 5.75;
const SIGNIFICANT_FEED_PROFIT_CENTS = 30000; // R$ 300+ abre sugestão de post no feed
const SIGNIFICANT_MIN_PROFIT_CENTS = 15000; // R$ 150 mínimo para considerar sugestão por ROI
const SIGNIFICANT_MIN_ROI = 0.6; // 60% sobre o buy-in

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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valueCents / 100);
}

function formatBrlCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valueCents / 100);
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

function dateToInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFilterDateLabel(dateValue: string, fallback: string): string {
  if (!dateValue) return fallback;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  if (currency === "EUR") return `EUR ${amount.toFixed(2)}`;
  if (currency === "JPY") return `¥${amount.toFixed(2)}`;
  if (currency === "CNY") return `CN¥${amount.toFixed(2)}`;
  return `R$${amount.toFixed(2)}`;
}

function convertToBrlCents(value: number, currency: string, rates?: any) {
  if (currency === "USD") return Math.round(value * (rates?.USD?.rate ?? 5.75));
  if (currency === "CAD") return Math.round(value * (rates?.CAD?.rate ?? 4.20));
  if (currency === "EUR") return Math.round(value * (rates?.EUR?.rate ?? 6.30));
  if (currency === "JPY") return Math.round(value * (rates?.JPY?.rate ?? 0.033));
  if (currency === "CNY") return Math.round(value * (rates?.CNY?.rate ?? 0.80));
  return value;
}

function isSignificantGain(profitBrlCents: number, buyInBrlCents: number): boolean {
  if (profitBrlCents <= 0) return false;
  if (profitBrlCents >= SIGNIFICANT_FEED_PROFIT_CENTS) return true;
  if (buyInBrlCents <= 0) return profitBrlCents >= SIGNIFICANT_MIN_PROFIT_CENTS;

  const roi = profitBrlCents / buyInBrlCents;
  return profitBrlCents >= SIGNIFICANT_MIN_PROFIT_CENTS && roi >= SIGNIFICANT_MIN_ROI;
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

function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function playPositiveCashOutCelebration() {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const ctx = new AudioContextCtor();
    const startAt = ctx.currentTime + 0.03;

    const playTone = (
      frequency: number,
      at: number,
      duration: number,
      type: OscillatorType,
      volume: number,
      glideTo?: number,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, at);
      if (glideTo && glideTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
      }
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration);
    };

    // 1) Aplauso: rajada de ruído curto simulada com frequências altas aleatórias.
    for (let i = 0; i < 18; i++) {
      const at = startAt + i * 0.03;
      const freq = 800 + Math.random() * 2400;
      playTone(freq, at, 0.045, "triangle", 0.055);
    }

    // 2) Dinheiro caindo: tom descendente em passos rápidos.
    for (let i = 0; i < 10; i++) {
      const at = startAt + 0.36 + i * 0.055;
      const from = 1500 - i * 130;
      const to = Math.max(180, from - 450);
      playTone(from, at, 0.1, "square", 0.075, to);
    }

    // 3) Comemoração: mini fanfarra em acordes.
    const fanfare = [
      [523.25, 659.25, 783.99],
      [659.25, 783.99, 987.77],
      [783.99, 987.77, 1174.66],
    ];

    fanfare.forEach((chord, chordIndex) => {
      const at = startAt + 1.02 + chordIndex * 0.18;
      chord.forEach((note) => {
        playTone(note, at, 0.22, "sine", 0.07);
      });
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 2600);

    window.dispatchEvent(new CustomEvent("cashout-positive-celebration"));
  } catch {
    // Silent fallback
  }
}

type RewardDropKind = "bill" | "coin";

type RewardDrop = {
  id: number;
  kind: RewardDropKind;
  left: number;
  delay: number;
  duration: number;
  size: number;
  sway: number;
  rotate: number;
};

function renderRewardDrop(drop: RewardDrop) {
  if (drop.kind === "bill") {
    return <span style={{ fontSize: `${drop.size}px` }}>💵</span>;
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-amber-100/80 text-[10px] font-black text-amber-900 shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
      style={{
        width: `${Math.max(14, drop.size * 0.82)}px`,
        height: `${Math.max(14, drop.size * 0.82)}px`,
        background: "radial-gradient(circle at 30% 30%, #fef3c7 0%, #f59e0b 58%, #92400e 100%)",
      }}
    >
      $
    </span>
  );
}

function MoneyRainOverlay({ onDone }: { onDone: () => void }) {
  const drops = useMemo(
    () => Array.from({ length: 42 }).map((_, index) => {
      const kind: RewardDropKind = Math.random() > 0.45 ? "coin" : "bill";
      return {
        id: index,
        kind,
        left: Math.random() * 100,
        delay: Math.random() * 0.52,
        duration: 1.35 + Math.random() * 1.35,
        size: 16 + Math.random() * 22,
        sway: 14 + Math.random() * 24,
        rotate: -20 + Math.random() * 40,
      };
    }),
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[140] overflow-hidden" aria-hidden>
      <style>{`
        @keyframes cash-rain-fall {
          0% { transform: translateY(-18vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(var(--drop-rotate)); opacity: 0.95; }
        }
        @keyframes cash-rain-sway {
          0% { margin-left: 0; }
          50% { margin-left: var(--drop-sway); }
          100% { margin-left: calc(var(--drop-sway) * -0.7); }
        }
        @keyframes cash-rain-flash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.22),transparent_55%)]"
        style={{ animation: "cash-rain-flash 650ms ease-out" }}
      />

      <div className="absolute top-8 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/90 px-4 py-2 text-sm font-bold text-white shadow-lg">
        Cash-out positivo!
      </div>

      {drops.map((drop) => (
        <span
          key={drop.id}
          className="absolute top-0 inline-flex items-center justify-center"
          style={{
            left: `${drop.left}%`,
            animation: `cash-rain-fall ${drop.duration}s linear ${drop.delay}s forwards, cash-rain-sway ${Math.max(0.9, drop.duration * 0.75)}s ease-in-out ${drop.delay}s 2 alternate`,
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
            transformOrigin: "center",
            ["--drop-sway" as any]: `${drop.sway}px`,
            ["--drop-rotate" as any]: `${drop.rotate}deg`,
          }}
        >
          {renderRewardDrop(drop)}
        </span>
      ))}
    </div>
  );
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
    tournamentName?: string | null;
    gameType?: string | null;
    stakes?: string | null;
    finalPosition?: number | null;
    fieldSize?: number | null;
    notes?: string | null;
    startedAt: string | Date;
    endedAt?: string | Date | null;
  };
  venues: { id: number; name: string; logoUrl?: string | null }[];
  onSave: (data: { venueId?: number; type?: "online" | "live"; gameFormat?: "tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game"; currency?: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR"; buyIn?: number; cashOut?: number | null; clubName?: string; tournamentName?: string; stakes?: string; finalPosition?: number; fieldSize?: number; notes?: string }) => void;
  onClose: () => void;
  isPending: boolean;
}

function EditTableDialog({ table, venues, onSave, onClose, isPending }: EditTableDialogProps) {
  const fmt = GAME_FORMATS.find(f => f.value === table.gameFormat);
  const [type, setType] = useState<"online" | "live">(table.type as "online" | "live");
  const [gameFormat, setGameFormat] = useState<"tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game">(table.gameFormat as any);
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR">(table.currency as any);
  const [venueId, setVenueId] = useState(table.venueId?.toString() ?? "");
  const [clubName, setClubName] = useState(table.clubName ?? "");
  const [tournamentName, setTournamentName] = useState(table.tournamentName ?? "");
  const { data: knownTournamentNames = [] } = trpc.sessions.tournamentNames.useQuery();
  const [buyIn, setBuyIn] = useState((table.buyIn / 100).toFixed(2));
  const [cashOut, setCashOut] = useState(table.cashOut != null ? (table.cashOut / 100).toFixed(2) : "");
  const [stakes, setStakes] = useState(table.stakes ?? "");
  const [finalPosition, setFinalPosition] = useState(
    typeof table.finalPosition === "number" && table.finalPosition > 0 ? String(table.finalPosition) : ""
  );
  const [fieldSize, setFieldSize] = useState(
    typeof table.fieldSize === "number" && table.fieldSize > 0 ? String(table.fieldSize) : ""
  );
  const [notes, setNotes] = useState(table.notes ?? "");

  const duration = calcTableDuration(table.startedAt, table.endedAt);

  function handleSave() {
    const buyInCents = Math.round(parseFloat(buyIn.replace(",", ".")) * 100);
    const cashOutCents = cashOut !== "" ? Math.round(parseFloat(cashOut.replace(",", ".")) * 100) : null;
    const parsedFinalPosition = finalPosition.trim() ? parseInt(finalPosition, 10) : undefined;
    const parsedFieldSize = fieldSize.trim() ? parseInt(fieldSize, 10) : undefined;
    if (isNaN(buyInCents) || buyInCents < 0) {
      toast.error("Buy-in inválido");
      return;
    }
    if (parsedFinalPosition !== undefined && (!Number.isFinite(parsedFinalPosition) || parsedFinalPosition <= 0)) {
      toast.error("Posição final inválida");
      return;
    }
    if (parsedFieldSize !== undefined && (!Number.isFinite(parsedFieldSize) || parsedFieldSize <= 0)) {
      toast.error("Total de jogadores inválido");
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
      tournamentName: tournamentName || undefined,
      stakes: stakes || undefined,
      finalPosition: parsedFinalPosition,
      fieldSize: parsedFieldSize,
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
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
                  <SelectItem value="EUR">EUR (EUR)</SelectItem>
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
          <div>
            <Label className="text-xs">Nome do Torneio (opcional)</Label>
            <TournamentNameInput
              value={tournamentName}
              onChange={setTournamentName}
              knownNames={knownTournamentNames}
              className="h-8 text-sm mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Buy-in ({currency})</Label>
              <Input className="h-8 text-sm mt-1" type="number" inputMode="decimal" step="0.5" min="0" value={buyIn} onChange={e => setBuyIn(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cash-out ({currency})</Label>
              <Input className="h-8 text-sm mt-1" type="number" inputMode="decimal" step="0.5" min="0" value={cashOut} onChange={e => setCashOut(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Posição final (opcional)</Label>
            <Input
              className="h-8 text-sm mt-1"
              type="number"
              min="1"
              placeholder="Ex: 1"
              value={finalPosition}
              onChange={e => setFinalPosition(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Total de jogadores (opcional)</Label>
            <Input
              className="h-8 text-sm mt-1"
              type="number"
              min="1"
              placeholder="Ex: 248"
              value={fieldSize}
              onChange={e => setFieldSize(e.target.value)}
            />
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
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR">(type === "online" ? "USD" : "BRL");
  const [venueId, setVenueId] = useState("");
  const [buyIn, setBuyIn] = useState(defaultBuyIn);
  const [tournamentName, setTournamentName] = useState("");
  const [finalPosition, setFinalPosition] = useState("");
  const [fieldSize, setFieldSize] = useState("");
  const [gameType, setGameType] = useState("");
  const [stakes, setStakes] = useState("");

  const { data: venues } = trpc.venues.list.useQuery({ type });
  const { data: knownTournamentNames = [] } = trpc.sessions.tournamentNames.useQuery();

  const parsedVenueId = venueId ? parseInt(venueId, 10) : null;
  const { data: venueBuyIns } = trpc.sessions.getBuyInsByVenue.useQuery(
    { venueId: parsedVenueId! },
    { enabled: parsedVenueId != null && Number.isFinite(parsedVenueId) },
  );

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
    // If the user has selected a venue and historical data is available, lead with those values
    if (venueBuyIns && venueBuyIns.length > 0) {
      // Return venue-specific buy-ins sorted ascending by value, up to 8
      return venueBuyIns
        .map((entry) => entry.buyIn)
        .filter((v) => Number.isFinite(v) && v > 0)
        .slice(0, 8)
        .sort((a, b) => a - b);
    }

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
  }, [getPreferredBuyIns, prefs, type, venueBuyIns]);

  const minBuyInCents = 0; // Allow 0 for freerolls, credits, and any other format

  const formatBuyInButtonLabel = (valueCents: number, valueCurrency: string) => {
    if (valueCurrency === "JPY") {
      return `¥${Math.round(valueCents / 100)}`;
    }
    const symbol = valueCurrency === "USD" ? "$" : valueCurrency === "CAD" ? "CA$" : valueCurrency === "CNY" ? "CN¥" : valueCurrency === "EUR" ? "EUR" : "R$";
    const decimals = valueCents % 100 === 0 ? 0 : 2;
    return `${symbol}${(valueCents / 100).toFixed(decimals)}`;
  };

  const getVenueDefaultCurrency = (venueIdValue: string, currentType: "online" | "live") => {
    const selectedVenue = sortedVenues.find((venue: any) => String(venue.id) === venueIdValue);
    if (!selectedVenue) return currentType === "online" ? "USD" : "BRL";
    return (selectedVenue.currency as "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR") || (currentType === "online" ? "USD" : "BRL");
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
    const buyInCents = Math.round(parseFloat(buyIn.replace(",", ".")) * 100);
    const parsedFinalPosition = finalPosition.trim() ? parseInt(finalPosition, 10) : undefined;
    const parsedFieldSize = fieldSize.trim() ? parseInt(fieldSize, 10) : undefined;
    if (isNaN(buyInCents) || buyInCents < 0) {
      toast.error("Buy-in inválido");
      return;
    }
    if (parsedFinalPosition !== undefined && (!Number.isFinite(parsedFinalPosition) || parsedFinalPosition <= 0)) {
      toast.error("Posição final inválida");
      return;
    }
    if (parsedFieldSize !== undefined && (!Number.isFinite(parsedFieldSize) || parsedFieldSize <= 0)) {
      toast.error("Total de jogadores inválido");
      return;
    }
    addTableMutation.mutate({
      activeSessionId,
      venueId: venueId ? parseInt(venueId) : undefined,
      type,
      gameFormat: gameFormat as any,
      currency,
      buyIn: buyInCents,
      tournamentName: tournamentName || undefined,
      finalPosition: parsedFinalPosition,
      fieldSize: parsedFieldSize,
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
              <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buy-in ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : currency === "EUR" ? "EUR" : "R$"})</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            placeholder="0.00"
            value={buyIn}
            onChange={(e) => setBuyIn(e.target.value)}
            required
          />
          {suggestedBuyIns.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {venueBuyIns && venueBuyIns.length > 0 && (
                <span className="w-full text-[10px] text-muted-foreground">Mais usados nessa plataforma:</span>
              )}
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
        <Label className="text-xs text-muted-foreground">Nome do Torneio (opcional)</Label>
        <TournamentNameInput
          value={tournamentName}
          onChange={setTournamentName}
          knownNames={knownTournamentNames}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Posição Final (opcional)</Label>
        <Input
          type="number"
          min="1"
          placeholder="Ex: 1"
          value={finalPosition}
          onChange={(e) => setFinalPosition(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Total de jogadores (opcional)</Label>
        <Input
          type="number"
          min="1"
          placeholder="Ex: 248"
          value={fieldSize}
          onChange={(e) => setFieldSize(e.target.value)}
        />
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
  onCashOutSaved?: (payload: {
    tableId: number;
    currency: string;
    buyIn: number;
    cashOut: number;
    profit: number;
  }) => void;
}

function CashOutDialog({ tableId, currency, buyIn, onClose, onCashOutSaved }: CashOutDialogProps) {
  const utils = trpc.useUtils();
  const [cashOut, setCashOut] = useState("0");
  const [finalPosition, setFinalPosition] = useState("");
  const [fieldSize, setFieldSize] = useState("");
  const lastSubmittedProfitRef = useRef<number | null>(null);
  const lastSubmittedCashOutRef = useRef<number | null>(null);

  const updateMutation = trpc.sessions.updateTable.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      if ((lastSubmittedProfitRef.current ?? 0) > 0) {
        playPositiveCashOutCelebration();
      }
      if (typeof lastSubmittedCashOutRef.current === "number" && typeof lastSubmittedProfitRef.current === "number") {
        onCashOutSaved?.({
          tableId,
          currency,
          buyIn,
          cashOut: lastSubmittedCashOutRef.current,
          profit: lastSubmittedProfitRef.current,
        });
      }
      lastSubmittedCashOutRef.current = null;
      lastSubmittedProfitRef.current = null;
      toast("Cash-out registrado!");
      onClose();
    },
    onError: (err) => {
      lastSubmittedCashOutRef.current = null;
      lastSubmittedProfitRef.current = null;
      toast.error("Erro", { description: err.message });
    },
  });

  const profit = Math.round(parseFloat(cashOut.replace(",", ".")) * 100) - buyIn;
  const profitDisplay = formatCurrency(Math.abs(profit), currency);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Cash-out ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : currency === "EUR" ? "EUR" : "R$"})</Label>
        <Input
          type="text"
          inputMode="decimal"
          value={cashOut}
          onChange={(e) => setCashOut(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label>Posição final (opcional)</Label>
        <Input
          type="number"
          min="1"
          placeholder="Ex: 1"
          value={finalPosition}
          onChange={(e) => setFinalPosition(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Total de jogadores (opcional)</Label>
        <Input
          type="number"
          min="1"
          placeholder="Ex: 248"
          value={fieldSize}
          onChange={(e) => setFieldSize(e.target.value)}
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
            const cents = Math.round(parseFloat(cashOut.replace(",", ".")) * 100);
            const parsedFinalPosition = finalPosition.trim() ? parseInt(finalPosition, 10) : undefined;
            const parsedFieldSize = fieldSize.trim() ? parseInt(fieldSize, 10) : undefined;
            if (isNaN(cents) || cents < 0) return;
            if (parsedFinalPosition !== undefined && (!Number.isFinite(parsedFinalPosition) || parsedFinalPosition <= 0)) {
              toast.error("Posição final inválida");
              return;
            }
            if (parsedFieldSize !== undefined && (!Number.isFinite(parsedFieldSize) || parsedFieldSize <= 0)) {
              toast.error("Total de jogadores inválido");
              return;
            }
            lastSubmittedCashOutRef.current = cents;
            lastSubmittedProfitRef.current = cents - buyIn;
            updateMutation.mutate({ id: tableId, cashOut: cents, finalPosition: parsedFinalPosition, fieldSize: parsedFieldSize, endedAt: new Date() });
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

  const rebuyCents = Math.round(parseFloat(rebuy.replace(",", ".")) * 100);
  const nextBuyIn = Number.isFinite(rebuyCents) && rebuyCents > 0 ? currentBuyIn + rebuyCents : currentBuyIn;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Valor do Rebuy ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : currency === "EUR" ? "EUR" : "R$"})</Label>
        <Input
          type="text"
          inputMode="decimal"
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
            updateMutation.mutate({ id: tableId, buyIn: currentBuyIn + rebuyCents, incrementRebuy: true });
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

  const addOnCents = Math.round(parseFloat(addOn.replace(",", ".")) * 100);
  const nextBuyIn = Number.isFinite(addOnCents) && addOnCents > 0 ? currentBuyIn + addOnCents : currentBuyIn;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Valor do Add-on ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : currency === "CNY" ? "CN¥" : currency === "EUR" ? "EUR" : "R$"})</Label>
        <Input
          type="text"
          inputMode="decimal"
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
      type: "online" | "live";
      gameFormat: GameFormat;
      currency: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR";
      buyIn: number;
      cashOut?: number | null;
      venueId?: number | null;
      clubName?: string | null;
      tournamentName?: string | null;
      gameType?: string | null;
      stakes?: string | null;
      startedAt: string | Date;
      endedAt?: string | Date | null;
    }>;
  };
  onFinalized: (payload?: {
    sessionId: number;
    totalProfitCents: number;
    completedTables: number;
    shouldSuggestFeedPost: boolean;
    notes?: string;
  }) => void;
  onSignificantTableCashOut?: (payload: {
    sessionId: number;
    tableId: number;
    profitBrlCents: number;
    platformName?: string;
    profitText: string;
    cashOutText: string;
  }) => void;
}

function ActiveSessionPanel({ session, onFinalized, onSignificantTableCashOut }: ActiveSessionPanelProps) {
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
    aa: { hands: number; wins: number; losses: number };
    ak: { hands: number; wins: number; losses: number };
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
    onSuccess: (finalizedSession) => {
      utils.sessions.getActive.invalidate();
      utils.sessions.list.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      toast("Sessão finalizada!", { description: "Resultado salvo com sucesso." });
      const profitCents = finalizedSession
        ? (finalizedSession.cashOut - finalizedSession.buyIn)
        : (typeof totalProfit === "number" ? totalProfit : 0);
      const completedCount = completedTables.length > 0 ? completedTables.length : session.tables.length;
      const shouldSuggestFeedPost = profitCents >= SIGNIFICANT_FEED_PROFIT_CENTS;
      onFinalized({
        sessionId: session.id,
        totalProfitCents: profitCents,
        completedTables: completedCount,
        shouldSuggestFeedPost,
        notes: finalNotes?.trim() || undefined,
      });
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

  const handleRegisterHandResult = (hand: "kk" | "jj" | "aa" | "ak", outcome: "win" | "loss") => {
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
      aa: {
        hands: handPatternStats.aa?.hands ?? 0,
        wins: handPatternStats.aa?.wins ?? 0,
        losses: handPatternStats.aa?.losses ?? 0,
      },
      ak: {
        hands: handPatternStats.ak?.hands ?? 0,
        wins: handPatternStats.ak?.wins ?? 0,
        losses: handPatternStats.ak?.losses ?? 0,
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
      {/* Session header — poker table visual */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-white/5"
        style={{
          background: "radial-gradient(ellipse at 50% 100%, #0c2214 0%, #080c18 60%, #06080f 100%)",
          minHeight: 200,
        }}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 85%, rgba(16,120,40,0.22) 0%, transparent 62%)" }}
        />

        {/* 3-D perspective table */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: "-8%", width: "92%", perspective: "480px", perspectiveOrigin: "50% 100%" }}
        >
          {/* Outer rail */}
          <div
            style={{
              transform: "rotateX(32deg)",
              transformOrigin: "50% 100%",
              borderRadius: "50%",
              width: "100%",
              paddingBottom: "46%",
              position: "relative",
              background: "radial-gradient(ellipse at 48% 38%, #7a4f1f 0%, #4a2d0a 55%, #2a1805 100%)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.7), inset 0 4px 12px rgba(255,255,255,0.06)",
            }}
          >
            {/* Inner felt */}
            <div
              style={{
                position: "absolute",
                inset: "6%",
                borderRadius: "50%",
                background: "radial-gradient(ellipse at 46% 36%, #1e8c38 0%, #0f5a1f 52%, #073a12 100%)",
                boxShadow: "inset 0 6px 20px rgba(0,0,0,0.5), inset 0 -2px 8px rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ position: "absolute", inset: "10%", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.07)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: "6%" }}>
                <span style={{ color: "rgba(255,255,255,0.10)", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.25em", textTransform: "uppercase" }}>
                  THE RAIL
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live indicator + timer */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-green-300/90 tracking-wide uppercase">Ao vivo</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-white/80">
            <Timer className="h-4 w-4 text-white/50" />
            {elapsed}
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative z-10 mt-auto px-4 pb-4 pt-28 grid grid-cols-3 text-center gap-1">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Buy-in</p>
            <p className="text-sm font-bold text-white/90">R${(totalBuyIn / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Mesas</p>
            <p className="text-sm font-bold text-white/90">{session.tables.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Resultado</p>
            <p className={`text-sm font-bold ${totalProfit === null ? "text-white/40" : totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalProfit === null ? "—" : `${totalProfit >= 0 ? "+" : ""}R$${(totalProfit / 100).toFixed(2)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Premium hand counters */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mãos Premium</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={handleUndoLastHandAction}
            disabled={!lastHandStatsSnapshot || registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Desfazer
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {([
            { key: "kk", wins: handPatternStats?.kk?.wins ?? 0, losses: handPatternStats?.kk?.losses ?? 0 },
            { key: "jj", wins: handPatternStats?.jj?.wins ?? 0, losses: handPatternStats?.jj?.losses ?? 0 },
            { key: "aa", wins: handPatternStats?.aa?.wins ?? 0, losses: handPatternStats?.aa?.losses ?? 0 },
            { key: "ak", wins: handPatternStats?.ak?.wins ?? 0, losses: handPatternStats?.ak?.losses ?? 0 },
          ] as const).map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-center text-sm font-bold tracking-wide text-foreground/80 uppercase">{item.key}</span>
              <button
                className="flex-1 h-12 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-base active:scale-95 transition-transform disabled:opacity-40"
                onClick={() => handleRegisterHandResult(item.key, "win")}
                disabled={registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
              >
                ✅ {item.wins}
              </button>
              <button
                className="flex-1 h-12 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-base active:scale-95 transition-transform disabled:opacity-40"
                onClick={() => handleRegisterHandResult(item.key, "loss")}
                disabled={registerHandResultMutation.isPending || updateHandStatsMutation.isPending}
              >
                ❌ {item.losses}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tables list */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">Mesas ({session.tables.length})</h3>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setShowAddTable(true)}>
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
              <div key={table.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border ${isFinished ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5"}`}>
                {/* Venue logo */}
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {venue?.logoUrl ? (
                    <img src={venue.logoUrl} alt={venue.name} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="text-lg">{fmt?.emoji ?? "🃏"}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium truncate">{venue?.name ?? (table.type === "online" ? "Online" : "Live")}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{fmt?.label ?? table.gameFormat}</Badge>
                    {table.type === "online" ? (
                      <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      Buy-in: {formatCurrency(table.buyIn, table.currency)}
                    </span>
                      {table.clubName && (
                        <span className="text-xs text-muted-foreground">Clube: {table.clubName}</span>
                      )}
                      {table.tournamentName && (
                        <span className="text-xs text-muted-foreground">Torneio: {table.tournamentName}</span>
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
                <div className="w-full sm:w-auto shrink-0 space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                  {isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[13px] h-9 px-3 w-full whitespace-normal sm:w-auto sm:whitespace-nowrap"
                      onClick={() => replayTableMutation.mutate({
                        activeSessionId: session.id,
                        venueId: table.venueId ?? undefined,
                        type: table.type as "online" | "live",
                        gameFormat: table.gameFormat as GameFormat,
                        currency: table.currency as "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR",
                        buyIn: table.buyIn,
                        clubName: table.clubName ?? undefined,
                        tournamentName: table.tournamentName ?? undefined,
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
                      className="text-[13px] h-9 px-3 w-full whitespace-normal sm:w-auto sm:whitespace-nowrap"
                      onClick={() => setRebuyTableId(table.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Rebuy
                    </Button>
                  )}
                  {!isFinished && canUseAddOn && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[13px] h-9 px-3 w-full whitespace-normal sm:w-auto sm:whitespace-nowrap"
                      onClick={() => setAddOnTableId(table.id)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" /> Add-on
                    </Button>
                  )}
                  {!isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[13px] h-9 px-3 w-full whitespace-normal sm:w-auto sm:whitespace-nowrap"
                      onClick={() => setCashOutTableId(table.id)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" /> Cash-out
                    </Button>
                  )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-primary"
                    onClick={() => setEditTableId(table.id)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMutation.mutate({ id: table.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Session actions */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
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
              onCashOutSaved={({ tableId, profit, cashOut, currency }) => {
                const profitBrlCents = convertToBrlCents(profit, currency, fxRates);
                const sourceTable = session.tables.find((t) => t.id === tableId);
                const buyInBrlCents = sourceTable
                  ? convertToBrlCents(sourceTable.buyIn, sourceTable.currency, fxRates)
                  : 0;

                if (isSignificantGain(profitBrlCents, buyInBrlCents)) {
                  const sourceTable = session.tables.find((t) => t.id === tableId);
                  const venueName = sourceTable?.venueId
                    ? venues?.find((v) => v.id === sourceTable.venueId)?.name
                    : undefined;
                  const platformName = venueName || sourceTable?.clubName?.trim();
                  onSignificantTableCashOut?.({
                    sessionId: session.id,
                    tableId,
                    profitBrlCents,
                    platformName,
                    profitText: formatCurrency(profit, currency),
                    cashOutText: formatCurrency(cashOut, currency),
                  });
                }
              }}
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
                  Sem finalizar sessão
                </Button>
                <Button onClick={() => setFinalizeStep("confirm")}>
                  Finalizar sessão
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
function SessionCard({ session, typeFilter }: { session: any; typeFilter?: "all" | "online" | "live" }) {
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
  const [editTournamentName, setEditTournamentName] = useState((session.primaryTournamentName ?? session.tournamentName ?? "").trim());
  const [editSessionDate, setEditSessionDate] = useState(toDateTimeLocalValue(session.sessionDate));
  const [editFinalPosition, setEditFinalPosition] = useState(
    typeof session.finalPosition === "number" && session.finalPosition > 0
      ? String(session.finalPosition)
      : ""
  );
  const [editFieldSize, setEditFieldSize] = useState(
    typeof session.fieldSize === "number" && session.fieldSize > 0 ? String(session.fieldSize) : ""
  );

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

  const deleteTableMutation = trpc.sessions.removeTable.useMutation({
    onSuccess: () => {
      utils.sessions.getTables.invalidate({ sessionId: session.id });
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.getCurrent.invalidate();
      toast.success("Mesa excluída!");
    },
    onError: (err) => toast.error("Erro ao excluir mesa", { description: err.message }),
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
  const tournamentTitle = (session.primaryTournamentName ?? session.tournamentName ?? "").trim();
  const isMultiVenue = (session.uniqueVenueCount ?? 0) > 1;
  const fallbackVenueText = isMultiVenue ? `${session.uniqueVenueCount} plataformas` : venueName;
  const venueBadgeText = tournamentTitle || fallbackVenueText;

  function handleSaveEdit() {
    const parsedSessionDate = editSessionDate ? new Date(editSessionDate) : undefined;
    const parsedFinalPosition = editFinalPosition.trim() ? parseInt(editFinalPosition, 10) : undefined;
    const parsedFieldSize = editFieldSize.trim() ? parseInt(editFieldSize, 10) : undefined;

    if (editSessionDate && (!parsedSessionDate || Number.isNaN(parsedSessionDate.getTime()))) {
      toast.error("Data da sessão inválida.");
      return;
    }

    if (parsedFinalPosition !== undefined && (!Number.isFinite(parsedFinalPosition) || parsedFinalPosition <= 0)) {
      toast.error("Posição final inválida.");
      return;
    }
    if (parsedFieldSize !== undefined && (!Number.isFinite(parsedFieldSize) || parsedFieldSize <= 0)) {
      toast.error("Total de jogadores inválido.");
      return;
    }

    const buyInCents = editBuyIn ? Math.round(parseFloat(editBuyIn.replace(",", ".")) * 100) : undefined;
    const cashOutCents = editCashOut !== "" ? Math.round(parseFloat(editCashOut.replace(",", ".")) * 100) : undefined;
    updateMutation.mutate({
      id: session.id,
      notes: editNotes || undefined,
      type: editType,
      gameFormat: editGameFormat as any,
      currency: editCurrency as any,
      venueId: editVenueId ? parseInt(editVenueId) : undefined,
      buyIn: buyInCents,
      cashOut: cashOutCents,
      tournamentName: editTournamentName.trim() || undefined,
      sessionDate: parsedSessionDate,
      finalPosition: parsedFinalPosition,
      fieldSize: parsedFieldSize,
    });
  }

  return (
    <>
    <Card className="overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
          {venueLogoUrl ? (
            <img src={venueLogoUrl} alt={venueName ?? ""} className="h-8 w-8 rounded object-contain" />
          ) : (
            <div className="relative flex items-center justify-center">
              <span>{fmt?.emoji ?? "🃏"}</span>
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border border-border flex items-center justify-center">
                {session.type === "online" ? (
                  <Wifi className="h-2.5 w-2.5 text-sky-500" />
                ) : (
                  <MapPin className="h-2.5 w-2.5 text-amber-500" />
                )}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{fmt?.emoji ?? "🃏"}</span>
            <span className="font-medium text-sm truncate">{fmt?.label ?? session.gameFormat}</span>
            <Badge variant="outline" className="text-xs shrink-0">{session.type === "online" ? "Online" : "Live"}</Badge>
            {venueBadgeText && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline flex items-center gap-1">
                {venueLogoUrl ? (
                  <img src={venueLogoUrl} alt={venueName ?? ""} className="h-3.5 w-3.5 rounded object-contain" />
                ) : isMultiVenue ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {venueBadgeText}
              </span>
            )}
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
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/40 pt-3 sm:mt-0 sm:border-t-0 sm:pt-0">
          <div className="text-left sm:ml-auto sm:text-right shrink-0">
            <p className={`font-semibold text-sm ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
              {profit >= 0 ? "+" : ""}R${(profit / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{profitPct}% ROI</p>
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
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
            {expanded ? <ChevronUp className="ml-1 h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground shrink-0" />}
          </div>
        </div>
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

          {tables && tables.length > 0 && (() => {
            const visibleTables = typeFilter && typeFilter !== "all"
              ? tables.filter((t) => t.type === typeFilter)
              : tables;
            if (visibleTables.length === 0) return null;
            return (
            <div className="space-y-1">
              {(() => {
                const venueNames = Array.from(new Set(
                  visibleTables
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
              <p className="text-xs text-muted-foreground font-medium">Mesas ({visibleTables.length}{visibleTables.length !== tables.length ? ` de ${tables.length}` : ""})</p>
              {visibleTables.map((t) => {
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
                      {t.tournamentName ? ` · Torneio: ${t.tournamentName}` : ""}
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
          ); })()}

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
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle>Editar Sessão</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="session" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 grid w-auto grid-cols-2">
            <TabsTrigger value="session">Sessão</TabsTrigger>
            <TabsTrigger value="tables" disabled={isLegacySession}>
              Mesas {tables && tables.length > 0 ? `(${tables.length})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab Sessão ── */}
          <TabsContent value="session" className="flex-1 overflow-y-auto px-4 pb-2 mt-2">
            <div className="space-y-3">
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
                      <SelectItem value="EUR">EUR (EUR)</SelectItem>
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
                    type="text"
                    inputMode="decimal"
                    value={editBuyIn}
                    onChange={e => setEditBuyIn(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cash-out</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="text"
                    inputMode="decimal"
                    value={editCashOut}
                    onChange={e => setEditCashOut(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Nome do Torneio</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  value={editTournamentName}
                  onChange={e => setEditTournamentName(e.target.value)}
                  placeholder="Ex: Sunday Million"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="datetime-local"
                    value={editSessionDate}
                    onChange={e => setEditSessionDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Posição</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="number"
                    min="1"
                    placeholder="Ex: 1"
                    value={editFinalPosition}
                    onChange={e => setEditFinalPosition(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Jogadores</Label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="number"
                    min="1"
                    placeholder="Ex: 248"
                    value={editFieldSize}
                    onChange={e => setEditFieldSize(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Textarea className="text-sm mt-1 resize-none" rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          {/* ── Tab Mesas ── */}
          <TabsContent value="tables" className="flex-1 overflow-y-auto px-4 pb-2 mt-2">
            {tables && tables.length > 0 ? (
              <div className="space-y-2">
                {tables.map((t) => {
                  const tfmt = GAME_FORMATS.find(f => f.value === t.gameFormat);
                  const tp = (t.cashOut ?? 0) - t.buyIn;
                  const tableVenue = venues?.find(v => v.id === t.venueId);
                  return (
                    <div key={t.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{tfmt?.emoji} {tfmt?.label}</span>
                          <span className="text-xs text-muted-foreground">{tableVenue?.name ?? "Sem plataforma"}{t.clubName ? ` · ${t.clubName}` : ""}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${tp >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {tp >= 0 ? "+" : ""}{formatCurrency(Math.abs(tp), t.currency)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-xs"
                          onClick={() => { setEditing(false); setEditTableId(t.id); }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Editar mesa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm("Excluir esta mesa?")) deleteTableMutation.mutate({ id: t.id });
                          }}
                          disabled={deleteTableMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nenhuma mesa registrada nesta sessão.
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-4 pb-4 pt-2 border-t">
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
const FALLING_CHIP_PALETTE = [
  { value: "25", color: "#c81e1e" },
  { value: "100", color: "#1653d1" },
  { value: "500", color: "#111827" },
  { value: "5", color: "#16a34a" },
  { value: "1", color: "#e5e7eb" },
  { value: "1000", color: "#7c3aed" },
  { value: "50", color: "#f59e0b" },
] as const;

function FallingChip({ left, size, delay, duration, value, color, sway, rotateFrom, rotateTo }: {
  left: number; size: number; delay: number; duration: number; value: string; color: string; sway: number; rotateFrom: number; rotateTo: number;
}) {
  return (
    <div
      className="absolute top-0 rounded-full opacity-[0.22] shadow-[0_18px_32px_rgba(0,0,0,0.3)]"
      style={{
        left: `${left}%`,
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.26) 0%, ${color} 52%, rgba(8,8,10,0.84) 100%)`,
        border: "1px solid rgba(255,255,255,0.48)",
        animation: `chipFall ${duration}s linear ${delay}s infinite, chipSway ${(duration / 2).toFixed(2)}s ease-in-out ${delay}s infinite alternate`,
        // custom props consumed by keyframes
        ["--chip-sway" as any]: `${sway}px`,
        ["--chip-rot-from" as any]: `${rotateFrom}deg`,
        ["--chip-rot-to" as any]: `${rotateTo}deg`,
      }}
    >
      <div className="absolute inset-[9%] rounded-full border-2 border-dashed border-white/80" />
      <div className="absolute inset-[26%] rounded-full border border-white/55" />
      <div className="absolute inset-0 flex items-center justify-center font-black tracking-tight text-white/85" style={{ fontSize: `${Math.max(10, size * 0.18)}px` }}>{value}</div>
      <span className="absolute left-[18%] top-[21%] h-1.5 w-1.5 rounded-full bg-white/90" />
      <span className="absolute left-[22%] top-[73%] h-1.5 w-1.5 rounded-full bg-white/90" />
      <span className="absolute right-[17%] top-[26%] h-1.5 w-1.5 rounded-full bg-white/90" />
      <span className="absolute right-[21%] top-[69%] h-1.5 w-1.5 rounded-full bg-white/90" />
    </div>
  );
}

function SessionsPageBackdropChips() {
  const chips = useMemo(() => {
    const count = 18;
    return Array.from({ length: count }).map((_, i) => {
      const palette = FALLING_CHIP_PALETTE[i % FALLING_CHIP_PALETTE.length];
      return {
        id: i,
        left: Math.random() * 96,
        size: 48 + Math.random() * 80,
        delay: -Math.random() * 14,
        duration: 10 + Math.random() * 10,
        value: palette.value,
        color: palette.color,
        sway: 20 + Math.random() * 60,
        rotateFrom: -180 + Math.random() * 180,
        rotateTo: 180 + Math.random() * 360,
      };
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <style>{`
        @keyframes chipFall {
          0% { transform: translate3d(0, -20vh, 0) rotate(var(--chip-rot-from)); }
          100% { transform: translate3d(0, 120vh, 0) rotate(var(--chip-rot-to)); }
        }
        @keyframes chipSway {
          0% { margin-left: calc(var(--chip-sway) * -1); }
          100% { margin-left: var(--chip-sway); }
        }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.05),_transparent_46%),radial-gradient(circle_at_bottom,_rgba(34,197,94,0.04),_transparent_44%)]" />
      {chips.map((c) => (
        <FallingChip key={c.id} {...c} />
      ))}
    </div>
  );
}

export default function Sessions() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { preferences: prefs, playTypeOrder, sortFormats, sortVenues, primaryType } = useBehaviorProfile();
  const [activeSection, setActiveSection] = useState<"history" | "import">("history");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"all" | "online" | "live">("all");
  const [historyVenueFilter, setHistoryVenueFilter] = useState<string>("all");
  const [historyDateFromFilter, setHistoryDateFromFilter] = useState("");
  const [historyDateToFilter, setHistoryDateToFilter] = useState("");
  const [historyTournamentFilter, setHistoryTournamentFilter] = useState("");
  const [importRawText, setImportRawText] = useState("");
  const [importCurrencyMode, setImportCurrencyMode] = useState<"auto" | "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR">("auto");
  const [importTypeMode, setImportTypeMode] = useState<"auto" | "online" | "live">("auto");
  const [importResult, setImportResult] = useState<{ imported: number; failures: string[] } | null>(null);
  const [showDeleteHistoryConfirm, setShowDeleteHistoryConfirm] = useState(false);
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
  const [moneyRainVisible, setMoneyRainVisible] = useState(false);
  const [showFeedPublishDialog, setShowFeedPublishDialog] = useState(false);
  const [feedPublishContent, setFeedPublishContent] = useState("");
  const [feedPublishVisibility, setFeedPublishVisibility] = useState<"public" | "friends">("public");
  const [feedPublishSessionId, setFeedPublishSessionId] = useState<number | null>(null);
  const [feedImagePreview, setFeedImagePreview] = useState<string | null>(null);
  const [feedImageBase64, setFeedImageBase64] = useState<string | null>(null);
  const [feedImageMime, setFeedImageMime] = useState("image/jpeg");
  const [isFeedImageDragActive, setIsFeedImageDragActive] = useState(false);
  const [optimisticSessionStartedAt, setOptimisticSessionStartedAt] = useState<Date | null>(null);
  const [optimisticElapsed, setOptimisticElapsed] = useState("00:00:00");
  const feedImageInputRef = useRef<HTMLInputElement>(null);

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
    onMutate: () => {
      // Start counting immediately on click, without waiting for network round-trip.
      setOptimisticSessionStartedAt(new Date());
    },
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Sessão iniciada!", { description: "Timer rodando. Adicione suas mesas." });
    },
    onError: (err) => {
      setOptimisticSessionStartedAt(null);
      setOptimisticElapsed("00:00:00");
      toast.error("Erro", { description: err.message });
    },
  });

  useEffect(() => {
    if (!optimisticSessionStartedAt) return;
    setOptimisticElapsed(formatDuration(optimisticSessionStartedAt));
    const interval = window.setInterval(() => {
      setOptimisticElapsed(formatDuration(optimisticSessionStartedAt));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [optimisticSessionStartedAt]);

  useEffect(() => {
    if (!activeSession) return;
    setOptimisticSessionStartedAt(null);
    setOptimisticElapsed("00:00:00");
  }, [activeSession]);

  const importPreviewMutation = trpc.sessions.importPreview.useMutation({
    onError: (err) => toast.error("Falha ao analisar texto", { description: err.message }),
  });

  const uploadFeedImageMutation = trpc.upload.postImage.useMutation();
  const createFeedPostMutation = trpc.feed.create.useMutation({
    onSuccess: () => {
      utils.feed.list.invalidate();
      toast.success("Post publicado no feed!");
      setShowFeedPublishDialog(false);
      setFeedPublishContent("");
      setFeedPublishSessionId(null);
      setFeedImagePreview(null);
      setFeedImageBase64(null);
      setFeedImageMime("image/jpeg");
    },
    onError: (err) => {
      toast.error("Erro ao publicar no feed", { description: err.message });
    },
  });

  const importFromTextMutation = trpc.sessions.importFromText.useMutation({
    onSuccess: (result) => {
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.recentTables.invalidate();
      utils.venues.statsByVenue.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.getCurrent.invalidate();
      setImportResult({ imported: result.imported, failures: result.failures ?? [] });
      if ((result.failures ?? []).length === 0) {
        toast.success("Importação concluída", { description: result.message });
        setImportRawText("");
        importPreviewMutation.reset();
        setActiveSection("history");
      } else {
        toast.warning("Importação parcial", { description: result.message });
        setImportRawText("");
        importPreviewMutation.reset();
      }
    },
    onError: (err) => toast.error("Falha ao importar", { description: err.message }),
  });

  const clearHistoryMutation = trpc.sessions.clearHistory.useMutation({
    onSuccess: (result) => {
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.recentTables.invalidate();
      utils.venues.statsByVenue.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      setShowDeleteHistoryConfirm(false);
      toast.success("Histórico excluído", {
        description: `${result.sessionsDeleted} sessões e ${result.tablesDeleted} mesas removidas.`,
      });
    },
    onError: (err) => toast.error("Falha ao excluir histórico", { description: err.message }),
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

  useEffect(() => {
    const handler = () => {
      setMoneyRainVisible(false);
      window.setTimeout(() => setMoneyRainVisible(true), 0);
    };
    window.addEventListener("cashout-positive-celebration", handler as EventListener);
    return () => {
      window.removeEventListener("cashout-positive-celebration", handler as EventListener);
    };
  }, []);

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

  const processFeedImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Somente imagens são suportadas.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB).");
      return;
    }
    setFeedImageMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setFeedImagePreview(result);
      setFeedImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const getFirstImageFile = (files?: FileList | null, items?: DataTransferItemList | null) => {
    const directFile = files?.[0];
    if (directFile?.type?.startsWith("image/")) return directFile;
    if (!items) return null;
    for (const item of Array.from(items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) return file;
    }
    return null;
  };

  const handleFeedImageDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFeedImageDragActive(false);
    const file = getFirstImageFile(event.dataTransfer.files, event.dataTransfer.items);
    if (file) processFeedImageFile(file);
  };

  const handleFeedImagePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const file = getFirstImageFile(undefined, event.clipboardData.items);
    if (!file) return;
    event.preventDefault();
    processFeedImageFile(file);
    toast.success("Imagem colada com sucesso.");
  };

  useEffect(() => {
    if (!showFeedPublishDialog) return;

    const handleWindowPaste = (event: globalThis.ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const file = getFirstImageFile(undefined, event.clipboardData?.items ?? null);
      if (!file) return;
      event.preventDefault();
      processFeedImageFile(file);
      toast.success("Imagem colada com sucesso.");
    };

    const handleWindowDragOver = (event: globalThis.DragEvent) => {
      const file = getFirstImageFile(event.dataTransfer?.files, event.dataTransfer?.items);
      if (!file) return;
      event.preventDefault();
      setIsFeedImageDragActive(true);
    };

    const handleWindowDrop = (event: globalThis.DragEvent) => {
      const file = getFirstImageFile(event.dataTransfer?.files, event.dataTransfer?.items);
      if (!file) return;
      event.preventDefault();
      setIsFeedImageDragActive(false);
      processFeedImageFile(file);
      toast.success("Imagem adicionada com sucesso.");
    };

    const handleWindowDragLeave = (event: globalThis.DragEvent) => {
      if (event.clientX <= 0 || event.clientY <= 0) {
        setIsFeedImageDragActive(false);
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("dragleave", handleWindowDragLeave);

    return () => {
      window.removeEventListener("paste", handleWindowPaste);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      setIsFeedImageDragActive(false);
    };
  }, [showFeedPublishDialog]);

  const openFeedPromptFromWin = (payload: {
    sessionId: number;
    totalProfitCents: number;
    completedTables: number;
    notes?: string;
  }) => {
    const gainText = formatCurrency(payload.totalProfitCents, "BRL");
    const tableText = `${payload.completedTables} mesa${payload.completedTables === 1 ? "" : "s"}`;
    const base = `Acabei de fechar uma sessão com lucro de +${gainText} em ${tableText}! 🔥`;
    const notes = payload.notes?.trim();
    const draft = notes ? `${base}\n\n${notes}` : base;

    setFeedPublishSessionId(payload.sessionId);
    setFeedPublishContent(draft);
    setFeedPublishVisibility("public");
    setFeedImagePreview(null);
    setFeedImageBase64(null);
    setFeedImageMime("image/jpeg");
    setShowFeedPublishDialog(true);
  };

  const openFeedPromptFromTableCashOut = (payload: {
    sessionId: number;
    tableId: number;
    profitBrlCents: number;
    platformName?: string;
    profitText: string;
    cashOutText: string;
  }) => {
    const platform = payload.platformName?.trim() || "plataforma não identificada";
    const draft = `Acabei de fechar uma mesa na ${platform} com lucro de +${payload.profitText}. Cash-out: ${payload.cashOutText}.`;

    setFeedPublishSessionId(payload.sessionId);
    setFeedPublishContent(draft);
    setFeedPublishVisibility("public");
    setFeedImagePreview(null);
    setFeedImageBase64(null);
    setFeedImageMime("image/jpeg");
    setShowFeedPublishDialog(true);
  };

  const handlePublishWinToFeed = async () => {
    const trimmedContent = feedPublishContent.trim();
    if (!trimmedContent && !feedImageBase64) {
      toast.error("Escreva algo ou anexe uma foto para publicar.");
      return;
    }

    let imageUrl: string | undefined;
    let imageKey: string | undefined;

    if (feedImageBase64) {
      try {
        const uploaded = await uploadFeedImageMutation.mutateAsync({
          base64: feedImageBase64,
          mimeType: feedImageMime,
        });
        imageUrl = uploaded.url;
        imageKey = uploaded.key;
      } catch (error: any) {
        const message = error?.message || "Falha ao enviar imagem.";
        if (trimmedContent) {
          toast.warning(`${message} Publicando somente o texto.`);
          setFeedImagePreview(null);
          setFeedImageBase64(null);
          if (feedImageInputRef.current) feedImageInputRef.current.value = "";
        } else {
          toast.error(message);
          return;
        }
      }
    }

    createFeedPostMutation.mutate({
      content: trimmedContent,
      visibility: feedPublishVisibility,
      imageUrl,
      imageKey,
      sessionId: feedPublishSessionId ?? undefined,
    });
  };

  const historyVenueOptions = useMemo(() => {
    if (!sessions) return [] as Array<{ id: string; name: string }>;
    const map = new Map<string, string>();
    for (const session of sessions as any[]) {
      const venueName = String(session.venueName ?? "").trim();
      if (!venueName) continue;
      const id = session.venueId != null ? String(session.venueId) : `name:${venueName.toLowerCase()}`;
      if (!map.has(id)) map.set(id, venueName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter((s) => {
      if (historyTypeFilter !== "all") {
        const hasOnline = (s as any).hasOnlineTables ?? (s.type === "online");
        const hasLive = (s as any).hasLiveTables ?? (s.type === "live");
        if (historyTypeFilter === "online" && !hasOnline) return false;
        if (historyTypeFilter === "live" && !hasLive) return false;
      }

      if (historyVenueFilter !== "all") {
        const currentVenueId = s.venueId != null ? String(s.venueId) : "";
        const currentVenueName = String((s as any).venueName ?? "").trim().toLowerCase();
        const filterByName = historyVenueFilter.startsWith("name:");
        if (filterByName) {
          const expectedName = historyVenueFilter.slice(5);
          if (currentVenueName !== expectedName) return false;
        } else if (currentVenueId !== historyVenueFilter) {
          return false;
        }
      }

      const rawDate = (s as any).sessionDate ?? (s as any).startedAt ?? (s as any).createdAt;
      const sessionDate = new Date(rawDate);
      if (!Number.isNaN(sessionDate.getTime())) {
        if (historyDateFromFilter) {
          const fromDate = new Date(`${historyDateFromFilter}T00:00:00`);
          if (sessionDate < fromDate) return false;
        }
        if (historyDateToFilter) {
          const toDate = new Date(`${historyDateToFilter}T23:59:59.999`);
          if (sessionDate > toDate) return false;
        }
      }

      if (historyTournamentFilter.trim()) {
        const q = historyTournamentFilter.trim().toLowerCase();
        const sessionName = ((s as any).primaryTournamentName || s.tournamentName || "").toLowerCase();
        const allNames: string[] = (s as any).allTournamentNames ?? [];
        const inAll = allNames.some((n: string) => n.includes(q));
        if (!sessionName.includes(q) && !inAll) return false;
      }
      return true;
    });
  }, [sessions, historyTypeFilter, historyVenueFilter, historyDateFromFilter, historyDateToFilter, historyTournamentFilter]);

  const totalProfit = filteredSessions.reduce((s, sess) => {
    const tableProfit = (sess as any).totalTableProfit;
    return s + (typeof tableProfit === "number" ? tableProfit : (sess.cashOut - sess.buyIn));
  }, 0) ?? 0;
  const totalSessions = filteredSessions.length;
  const winRate = totalSessions > 0
    ? ((filteredSessions.filter((s) => {
        const tableProfit = (s as any).totalTableProfit;
        const profit = typeof tableProfit === "number" ? tableProfit : (s.cashOut - s.buyIn);
        return profit > 0;
      }).length ?? 0) / totalSessions * 100).toFixed(0)
    : "0";
  const requiresRankingConsentChoice = needsRankingConsentOnboarding && !rankingConsentTouched;
  const shouldBlockSessionStart = needsPlayStyleOnboarding || needsRankingConsentOnboarding;

  return (
    <div className="relative p-3 sm:p-6 space-y-6 max-w-2xl mx-auto [&>*:not(:first-child)]:relative [&>*:not(:first-child)]:z-10">
      <SessionsPageBackdropChips />
      {moneyRainVisible && <MoneyRainOverlay onDone={() => setMoneyRainVisible(false)} />}

      {/* Header */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,_rgba(10,10,10,0.96),_rgba(20,22,34,0.94))] p-5 text-white shadow-2xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Sessões</h1>
            <p className="mt-1 text-sm text-zinc-300">Gerencie suas sessões de poker com foco e clareza.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300/70 bg-rose-500/40 text-[10px] font-black text-white shadow-[0_0_20px_rgba(244,63,94,0.35)]">25</span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-500/40 text-[10px] font-black text-white shadow-[0_0_24px_rgba(34,211,238,0.35)]">100</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/70 bg-amber-500/40 text-[10px] font-black text-white shadow-[0_0_28px_rgba(245,158,11,0.35)]">500</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => setShowPlayStyleOnboarding(true)}>
              Configurar ABI
            </Button>
            {!activeSession && (
              <Button
                onClick={() => startMutation.mutate({})}
                disabled={startMutation.isPending || !!optimisticSessionStartedAt}
                className="gap-2 w-full sm:w-auto bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              >
                <Timer className="h-4 w-4" />
                {startMutation.isPending || optimisticSessionStartedAt ? "Iniciando..." : "Nova Sessão"}
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
        <Button
          type="button"
          variant={activeSection === "history" ? "default" : "outline"}
          onClick={() => setActiveSection("history")}
          className="gap-2 w-full sm:w-auto"
        >
          <BarChart2 className="h-4 w-4" /> Histórico
        </Button>
        <Button
          type="button"
          variant={activeSection === "import" ? "default" : "outline"}
          onClick={() => setActiveSection("import")}
          className="gap-2 w-full sm:w-auto"
        >
          <Sparkles className="h-4 w-4" /> Importação IA
        </Button>
      </div>

      {/* Stats bar */}
      {totalSessions > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      {activeSession ? (
        <Card className="relative z-10 border-primary/30 bg-background shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Sessão Ativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActiveSessionPanel
              session={activeSession as any}
              onFinalized={(payload) => {
                utils.sessions.list.invalidate();
              }}
              onSignificantTableCashOut={openFeedPromptFromTableCashOut}
            />
          </CardContent>
        </Card>
      ) : optimisticSessionStartedAt ? (
        <Card className="relative z-10 border-primary/30 bg-background shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Iniciando Sessão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/20 to-primary/5 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold">Cronômetro</span>
                <div className="flex items-center gap-2 font-mono text-base font-bold text-primary sm:text-lg">
                  <Timer className="h-5 w-5" />
                  {optimisticElapsed}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Conectando sessão no servidor...</p>
            </div>
          </CardContent>
        </Card>
      ) : loadingActive ? (
        <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
      ) : (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <Timer className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nenhuma sessão ativa</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Clique em "Nova Sessão" para iniciar o timer e adicionar suas mesas.
          </p>
          <Button onClick={() => startMutation.mutate({})} disabled={startMutation.isPending || !!optimisticSessionStartedAt}>
            <Timer className="h-4 w-4 mr-2" />
            {startMutation.isPending || optimisticSessionStartedAt ? "Iniciando..." : "Iniciar Sessão"}
          </Button>
        </div>
      )}

      <Dialog open={showFeedPublishDialog} onOpenChange={setShowFeedPublishDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" /> Ganho significativo! Publicar no feed?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Seu lucro foi considerado relevante com base no valor ganho e no ROI da mesa. Você pode postar agora para alimentar o feed.
            </p>

            <Textarea
              value={feedPublishContent}
              onChange={(e) => setFeedPublishContent(e.target.value)}
              onPaste={handleFeedImagePaste}
              placeholder="Conte como foi a sessão..."
              rows={4}
              className="text-sm"
              maxLength={1000}
            />

            {feedImagePreview && (
              <div className="relative inline-block">
                <img src={feedImagePreview} alt="Pré-visualização" className="max-h-48 rounded-lg object-cover" />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={() => {
                    setFeedImagePreview(null);
                    setFeedImageBase64(null);
                    if (feedImageInputRef.current) feedImageInputRef.current.value = "";
                  }}
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div
              className={`rounded-lg border border-dashed p-3 transition-colors ${isFeedImageDragActive ? "border-primary bg-primary/5" : "border-border/60"}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsFeedImageDragActive(true);
              }}
              onDragLeave={() => setIsFeedImageDragActive(false)}
              onDrop={handleFeedImageDrop}
            >
              <input
                ref={feedImageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processFeedImageFile(file);
                }}
              />
              <div className="mb-2 text-[11px] text-muted-foreground">
                Arraste e solte uma imagem aqui, ou use Ctrl+V no texto para colar print.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => feedImageInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" /> Tirar/Anexar foto
                </Button>

                <Select value={feedPublishVisibility} onValueChange={(v) => setFeedPublishVisibility(v as "public" | "friends") }>
                  <SelectTrigger className="h-9 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Público</SelectItem>
                    <SelectItem value="friends">Amigos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setShowFeedPublishDialog(false)}>Agora não</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowFeedPublishDialog(false); setLocation("/feed"); }}>
                Ir para Feed
              </Button>
              <Button
                onClick={handlePublishWinToFeed}
                disabled={createFeedPostMutation.isPending || uploadFeedImageMutation.isPending || (!feedPublishContent.trim() && !feedImageBase64)}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                {createFeedPostMutation.isPending || uploadFeedImageMutation.isPending ? "Publicando..." : "Publicar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={showDeleteHistoryConfirm} onOpenChange={setShowDeleteHistoryConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza que deseja excluir todo o seu histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as sessões finalizadas e mesas do histórico serão removidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
            >
              {clearHistoryMutation.isPending ? "Excluindo..." : "Excluir todo o histórico"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeSection === "history" ? (
        <>
          {/* Session history */}
          {loadingSessions ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["all", "online", "live"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={historyTypeFilter === t ? "default" : "outline"}
                      className="h-7 px-2.5 text-xs gap-1"
                      onClick={() => setHistoryTypeFilter(t)}
                    >
                      {t === "online" ? <Wifi className="h-3 w-3" /> : t === "live" ? <MapPin className="h-3 w-3" /> : null}
                      {t === "all" ? "Todos" : t === "online" ? "Online" : "Live"}
                    </Button>
                  ))}
                  <div className="relative flex-1 min-w-[160px]">
                    <Input
                      type="text"
                      placeholder="Filtrar por torneio..."
                      value={historyTournamentFilter}
                      onChange={(e) => setHistoryTournamentFilter(e.target.value)}
                      className="h-7 text-xs pl-2 pr-7"
                    />
                    {historyTournamentFilter && (
                      <button
                        type="button"
                        onClick={() => setHistoryTournamentFilter("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-4">
                  <Select value={historyVenueFilter} onValueChange={setHistoryVenueFilter}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Plataforma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as plataformas</SelectItem>
                      {historyVenueOptions.map((venue) => (
                        <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="h-7 justify-start gap-1.5 text-xs">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatFilterDateLabel(historyDateFromFilter, "Data inicial")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={historyDateFromFilter ? new Date(`${historyDateFromFilter}T00:00:00`) : undefined}
                        onSelect={(date) => setHistoryDateFromFilter(date ? dateToInputValue(date) : "")}
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="h-7 justify-start gap-1.5 text-xs">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatFilterDateLabel(historyDateToFilter, "Data final")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={historyDateToFilter ? new Date(`${historyDateToFilter}T00:00:00`) : undefined}
                        onSelect={(date) => setHistoryDateToFilter(date ? dateToInputValue(date) : "")}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setHistoryVenueFilter("all");
                      setHistoryDateFromFilter("");
                      setHistoryDateToFilter("");
                      setHistoryTournamentFilter("");
                      setHistoryTypeFilter("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </div>
                {(historyTypeFilter !== "all" || historyVenueFilter !== "all" || historyDateFromFilter || historyDateToFilter || historyTournamentFilter) && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando {filteredSessions.length} de {sessions.length} sessão(ões)
                    {historyVenueFilter !== "all"
                      ? ` • plataforma: "${historyVenueOptions.find((v) => v.id === historyVenueFilter)?.name ?? "selecionada"}"`
                      : ""}
                    {historyDateFromFilter || historyDateToFilter
                      ? ` • período: ${historyDateFromFilter || "início"} até ${historyDateToFilter || "hoje"}`
                      : ""}
                    {historyTournamentFilter ? ` • torneio: "${historyTournamentFilter}"` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico</h2>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowDeleteHistoryConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir tudo
                </Button>
              </div>
              {filteredSessions.length > 0 ? (
                filteredSessions.map((session) => (
                  <SessionCard key={session.id} session={session} typeFilter={historyTypeFilter} />
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Nenhuma sessão encontrada para este filtro.</p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-primary underline"
                    onClick={() => { setHistoryTypeFilter("all"); setHistoryTournamentFilter(""); }}
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
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
              <p>5. Você pode fixar a moeda por clique (Auto, BRL, USD, CAD, JPY, CNY, EUR).</p>
              <p>6. Você pode fixar o tipo por clique (Auto, Online, Live).</p>
              <p>7. A IA usa apenas casas/plataformas já cadastradas no app; se não existir, a importação avisa erro.</p>
            </div>

            <div className="space-y-1">
              <Label>Moeda da importação</Label>
              <Select value={importCurrencyMode} onValueChange={(v) => setImportCurrencyMode(v as any)}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (detectar do texto)</SelectItem>
                  <SelectItem value="BRL">BRL (R$)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="CAD">CAD (CA$)</SelectItem>
                  <SelectItem value="JPY">JPY (¥)</SelectItem>
                  <SelectItem value="CNY">CNY (CN¥)</SelectItem>
                  <SelectItem value="EUR">EUR (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Tipo da sessão na importação</Label>
              <Select value={importTypeMode} onValueChange={(v) => setImportTypeMode(v as any)}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (detectar do texto)</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
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
                onClick={() => {
                  setImportResult(null);
                  importPreviewMutation.mutate({
                    rawText: importRawText,
                    currencyMode: importCurrencyMode,
                    typeMode: importTypeMode,
                  });
                }}
              >
                {importPreviewMutation.isPending ? "Analisando..." : "Analisar"}
              </Button>
              <Button
                type="button"
                disabled={!importPreviewMutation.data || importFromTextMutation.isPending || (importPreviewMutation.data as any)?.readyToImport === 0}
                onClick={() => importFromTextMutation.mutate({
                  rawText: importRawText,
                  currencyMode: importCurrencyMode,
                  typeMode: importTypeMode,
                })}
              >
                {importFromTextMutation.isPending ? "Importando..." : `Importar${importPreviewMutation.data ? ` (${(importPreviewMutation.data as any).readyToImport} ok)` : ""}`}
              </Button>
            </div>

            {/* Post-import failure report */}
            {importResult && importResult.failures.length > 0 && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-sm font-semibold text-red-400">
                    {importResult.imported} importado(s) · {importResult.failures.length} não salvos
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">As entradas abaixo não foram salvas. Corrija e reimporte se necessário.</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {importResult.failures.map((f, i) => (
                    <p key={i} className="text-xs text-red-300 font-mono bg-red-500/10 rounded px-2 py-1">• {f}</p>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs h-6"
                  onClick={() => setImportResult(null)}
                >
                  Dispensar
                </Button>
              </div>
            )}

            {importPreviewMutation.data && (
              <div className="space-y-3">
                {/* Summary counts */}
                <div className="flex gap-3 flex-wrap text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="font-medium text-emerald-400">{(importPreviewMutation.data as any).readyToImport}</span>
                    <span className="text-muted-foreground">prontos</span>
                  </span>
                  {(importPreviewMutation.data as any).willFailCount > 0 && (
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                      <span className="font-medium text-red-400">{(importPreviewMutation.data as any).willFailCount}</span>
                      <span className="text-muted-foreground">com erro (não serão importados)</span>
                    </span>
                  )}
                </div>

                {/* Critical errors (venue not found etc.) */}
                {(importPreviewMutation.data as any).errors?.length > 0 && (
                  <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <p className="text-xs font-semibold text-red-400">Erros — entradas que NÃO serão importadas</p>
                    </div>
                    {(importPreviewMutation.data as any).errors.map((e: string, idx: number) => (
                      <p key={idx} className="text-xs text-red-300">• {e}</p>
                    ))}
                  </div>
                )}

                {/* Non-critical warnings */}
                {(importPreviewMutation.data as any).warnings?.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50/10 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Avisos (serão importados mesmo assim)</p>
                    {(importPreviewMutation.data as any).warnings.slice(0, 8).map((w: string, idx: number) => (
                      <p key={idx} className="text-xs text-amber-300">• {w}</p>
                    ))}
                  </div>
                )}

                {/* Item list */}
                <div className="space-y-1.5">
                  {importPreviewMutation.data.items.slice(0, 12).map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className={`text-xs rounded-md border p-2 space-y-0.5 ${item.willFail ? "border-red-500/40 bg-red-500/10" : "border-border bg-muted/20"}`}
                    >
                      <div className="flex items-center gap-2">
                        {item.willFail
                          ? <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                          : <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                        }
                        <p className={`font-medium truncate ${item.willFail ? "text-red-300 line-through" : ""}`}>
                          {new Date(item.sessionDate).toLocaleDateString("pt-BR")} · {item.venueName}
                        </p>
                      </div>
                      <p className="text-muted-foreground pl-5">
                        {item.type === "online" ? "Online" : "Live"} · {item.gameFormat} · {formatCurrency(item.buyIn, item.currency)} / {formatCurrency(item.cashOut, item.currency)} · {formatMinutes(item.durationMinutes)}
                      </p>
                      {item.errors?.map((e: string, i: number) => (
                        <p key={i} className="text-red-300 pl-5">⚠ {e}</p>
                      ))}
                    </div>
                  ))}
                  {importPreviewMutation.data.items.length > 12 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{importPreviewMutation.data.items.length - 12} entradas não exibidas
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

