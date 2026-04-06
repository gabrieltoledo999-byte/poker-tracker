import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Timer, Trophy, TrendingUp, TrendingDown, Trash2,
  Edit2, CheckCircle, XCircle, Wifi, MapPin, Sparkles,
  ChevronDown, ChevronUp, Clock, DollarSign, BarChart2
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
    gameType?: string | null;
    stakes?: string | null;
    notes?: string | null;
    startedAt: string | Date;
    endedAt?: string | Date | null;
  };
  venues: { id: number; name: string; logoUrl?: string | null }[];
  onSave: (data: { venueId?: number; type?: "online" | "live"; gameFormat?: "tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game"; currency?: "BRL" | "USD" | "CAD" | "JPY"; buyIn?: number; cashOut?: number | null; stakes?: string; notes?: string }) => void;
  onClose: () => void;
  isPending: boolean;
}

function EditTableDialog({ table, venues, onSave, onClose, isPending }: EditTableDialogProps) {
  const fmt = GAME_FORMATS.find(f => f.value === table.gameFormat);
  const [type, setType] = useState<"online" | "live">(table.type as "online" | "live");
  const [gameFormat, setGameFormat] = useState<"tournament" | "cash_game" | "turbo" | "hyper_turbo" | "sit_and_go" | "spin_and_go" | "bounty" | "satellite" | "freeroll" | "home_game">(table.gameFormat as any);
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY">(table.currency as any);
  const [venueId, setVenueId] = useState(table.venueId?.toString() ?? "");
  const [buyIn, setBuyIn] = useState((table.buyIn / 100).toFixed(2));
  const [cashOut, setCashOut] = useState(table.cashOut != null ? (table.cashOut / 100).toFixed(2) : "");
  const [stakes, setStakes] = useState(table.stakes ?? "");
  const [notes, setNotes] = useState(table.notes ?? "");

  const duration = calcTableDuration(table.startedAt, table.endedAt);

  function handleSave() {
    const buyInCents = Math.round(parseFloat(buyIn) * 100);
    const cashOutCents = cashOut !== "" ? Math.round(parseFloat(cashOut) * 100) : null;
    onSave({
      venueId: venueId ? parseInt(venueId) : undefined,
      type,
      gameFormat,
      currency,
      buyIn: buyInCents,
      cashOut: cashOutCents,
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
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Plataforma / Local</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {venues.map(v => (
                  <SelectItem key={v.id} value={v.id.toString()}>
                    <div className="flex items-center gap-2">
                      {v.logoUrl && <img src={v.logoUrl} alt={v.name} className="h-4 w-4 object-contain" />}
                      {v.name}
                    </div>
                  </SelectItem>
                ))}
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Buy-in ({currency})</Label>
              <Input className="h-8 text-sm mt-1" type="number" step="0.01" value={buyIn} onChange={e => setBuyIn(e.target.value)} />
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

  // Fetch preferences for smart defaults
  const { data: prefs } = trpc.sessions.getUserPreferences.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Determine smart defaults
  const defaultType = (prefs?.preferredType as "online" | "live") ?? "online";
  const defaultFormat = (prefs?.preferredGameFormats?.[0] as GameFormat) ?? "tournament";
  const defaultBuyIn = prefs?.preferredBuyIns?.[0] ? String(prefs.preferredBuyIns[0] / 100) : "";

  const [type, setType] = useState<"online" | "live">(defaultType);
  const [gameFormat, setGameFormat] = useState<GameFormat>(defaultFormat);
  const [currency, setCurrency] = useState<"BRL" | "USD" | "CAD" | "JPY">(type === "online" ? "USD" : "BRL");
  const [venueId, setVenueId] = useState("");
  const [buyIn, setBuyIn] = useState(defaultBuyIn);
  const [gameType, setGameType] = useState("");
  const [stakes, setStakes] = useState("");

  const { data: venues } = trpc.venues.list.useQuery({ type });

  // Sort venues by preference
  const sortedVenues = useMemo(() => {
    if (!venues) return [];
    if (!prefs?.preferredVenueIds?.length) return venues;
    return [...venues].sort((a, b) => {
      const ai = prefs.preferredVenueIds.indexOf(a.id);
      const bi = prefs.preferredVenueIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [venues, prefs]);

  // Sort game formats by preference
  const sortedFormats = useMemo(() => {
    if (!prefs?.preferredGameFormats?.length) return GAME_FORMATS;
    return [...GAME_FORMATS].sort((a, b) => {
      const ai = prefs.preferredGameFormats.indexOf(a.value);
      const bi = prefs.preferredGameFormats.indexOf(b.value);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [prefs]);

  const suggestedBuyIns = prefs?.preferredBuyIns?.slice(0, 4) ?? [];

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
    if (isNaN(buyInCents) || buyInCents < 0) {
      toast.error("Buy-in inválido");
      return;
    }
    addTableMutation.mutate({
      activeSessionId,
      venueId: venueId ? parseInt(venueId) : undefined,
      type,
      gameFormat: gameFormat as any,
      currency,
      buyIn: buyInCents,
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
                  {venueName ? `${venueName} · ` : ""}{fmtLabel} · {combo.currency === "USD" ? "$" : "R$"}{(combo.buyIn / 100).toFixed(0)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType("online")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${type === "online" ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted/30 hover:bg-muted"}`}
        >
          <Wifi className="h-4 w-4" /> Online
        </button>
        <button
          type="button"
          onClick={() => setType("live")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${type === "live" ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted/30 hover:bg-muted"}`}
        >
          <MapPin className="h-4 w-4" /> Live
        </button>
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
        <Select value={venueId} onValueChange={setVenueId}>
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
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buy-in ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : "R$"})</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
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
                  {currency === "USD" ? "$" : "R$"}{(val / 100).toFixed(0)}
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
  const [cashOut, setCashOut] = useState(String(buyIn / 100));

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
        <Label>Cash-out ({currency === "USD" ? "$" : currency === "CAD" ? "CA$" : currency === "JPY" ? "¥" : "R$"})</Label>
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
  const [editTableId, setEditTableId] = useState<number | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizeStep, setFinalizeStep] = useState<"ask-more" | "confirm">("ask-more");
  const [finalNotes, setFinalNotes] = useState("");

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

  // Calculate totals in BRL for display consistency.
  const totalBuyIn = session.tables.reduce((s, t) => s + convertToBrlCents(t.buyIn, t.currency, fxRates), 0);
  const completedTables = session.tables.filter(t => t.cashOut !== null && t.cashOut !== undefined);
  const totalCashOut = completedTables.reduce((s, t) => s + convertToBrlCents(t.cashOut ?? 0, t.currency, fxRates), 0);
  const totalProfit = completedTables.length > 0
    ? totalCashOut - completedTables.reduce((s, t) => s + convertToBrlCents(t.buyIn, t.currency, fxRates), 0)
    : null;

  const cashOutTable = session.tables.find(t => t.id === cashOutTableId);

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
            const isFinished = table.cashOut !== null && table.cashOut !== undefined;
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
  const utils = trpc.useUtils();
  const { data: tables } = trpc.sessions.getTables.useQuery(
    { sessionId: session.id },
    { enabled: expanded }
  );

  // Session-level edit state (notes only)
  const [editNotes, setEditNotes] = useState(session.notes ?? "");

  const updateMutation = trpc.sessions.update.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      toast.success("Sessão atualizada!");
      setEditing(false);
    },
    onError: (err) => toast.error("Erro ao atualizar", { description: err.message }),
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

  function handleSaveEdit() {
    updateMutation.mutate({
      id: session.id,
      notes: editNotes || undefined,
    });
  }

  return (
    <>
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
          {venueLogoUrl ? (
            <img src={venueLogoUrl} alt={venueName ?? ""} className="h-8 w-8 rounded object-contain" />
          ) : (
            fmt?.emoji ?? "🃏"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{fmt?.label ?? session.gameFormat}</span>
            <Badge variant="outline" className="text-xs shrink-0">{session.type === "online" ? "Online" : "Live"}</Badge>
            {venueName && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{venueName}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{date.toLocaleDateString("pt-BR")}</span>
            <span>{Math.floor(session.durationMinutes / 60)}h{session.durationMinutes % 60}m</span>
            <span>{tableCount} mesa{tableCount === 1 ? "" : "s"}</span>
            {venueName && <span className="sm:hidden flex items-center gap-0.5"><MapPin className="h-3 w-3" />{venueName}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-semibold text-sm ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
            {profit >= 0 ? "+" : ""}R${(profit / 100).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">{profitPct}% ROI</p>
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
              <p className="text-xs text-muted-foreground font-medium">Mesas ({tables.length})</p>
              {tables.map((t) => {
                const tfmt = GAME_FORMATS.find(f => f.value === t.gameFormat);
                const tp = (t.cashOut ?? 0) - t.buyIn;
                const tDuration = calcTableDuration(t.startedAt, t.endedAt);
                return (
                  <div key={t.id} className="text-xs py-1.5 px-2 rounded bg-muted/30 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{tfmt?.emoji} {tfmt?.label} · {t.type === "online" ? "Online" : "Live"}</span>
                      <span className={tp >= 0 ? "text-green-500" : "text-red-500"}>
                        {tp >= 0 ? "+" : ""}{formatCurrency(Math.abs(tp), t.currency)}
                      </span>
                    </div>
                    {tDuration > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatMinutes(tDuration)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {session.notes && (
            <p className="text-xs text-muted-foreground italic">"{session.notes}"</p>
          )}

          {/* Botão de edição */}
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
              <Edit2 className="h-3 w-3" /> Editar notas da sessão
            </Button>
          </div>
        </div>
      )}
    </Card>

    {/* Modal de edição */}
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Notas da Sessão</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea className="text-sm mt-1 resize-none" rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Os dados de plataforma, buy-in e resultado pertencem a cada mesa. Para alterar esses valores, edite as mesas dentro da sessão.
          </p>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Main Sessions Page ────────────────────────────────────────────────────────
export default function Sessions() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: activeSession, isLoading: loadingActive } = trpc.sessions.getActive.useQuery(undefined, {
    refetchInterval: 5000, // poll every 5s to keep timer in sync
  });

  const { data: sessions, isLoading: loadingSessions } = trpc.sessions.list.useQuery({});

  const startMutation = trpc.sessions.startActive.useMutation({
    onSuccess: () => {
      utils.sessions.getActive.invalidate();
      toast("Sessão iniciada!", { description: "Timer rodando. Adicione suas mesas." });
    },
    onError: (err) => toast.error("Erro", { description: err.message }),
  });

  if (!user) return null;

  const totalProfit = sessions?.reduce((s, sess) => s + (sess.totalTableProfit ?? (sess.cashOut - sess.buyIn)), 0) ?? 0;
  const totalSessions = sessions?.length ?? 0;
  const winRate = totalSessions > 0
    ? ((sessions?.filter(s => (s.totalTableProfit ?? (s.cashOut - s.buyIn)) > 0).length ?? 0) / totalSessions * 100).toFixed(0)
    : "0";

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessões</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas sessões de poker</p>
        </div>
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
              <p className="text-xs text-muted-foreground">Win Rate</p>
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
    </div>
  );
}
