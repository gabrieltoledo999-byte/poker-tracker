import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useBehaviorProfile } from "@/hooks/useBehaviorProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Monitor,
  Users,
  Globe,
  MapPin,
  TrendingUp,
  TrendingDown,
  Lock,
  Upload,
  X,
  History,
  Pencil,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
} from "lucide-react";

type Currency = "BRL" | "USD" | "CAD" | "JPY";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BRL: "R$",
  USD: "US$",
  CAD: "CA$",
  JPY: "¥",
};

const CURRENCY_DECIMALS: Record<Currency, number> = {
  BRL: 2,
  USD: 2,
  CAD: 2,
  JPY: 0,
};

function formatInCurrency(centavos: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const value = centavos / 100;
  return `${CURRENCY_SYMBOLS[currency]} ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatBrl(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Balance History Panel ────────────────────────────────────────────────────

function BalanceHistoryPanel({ venueId, currency }: { venueId: number; currency: Currency }) {
  const { data: history, isLoading } = trpc.venues.getBalanceHistory.useQuery({ id: venueId, limit: 30 });

  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground">Carregando histórico...</div>;
  if (!history || history.length === 0)
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        Nenhum ajuste registrado ainda.<br />
        <span className="opacity-60">O histórico é criado automaticamente ao editar o saldo ou registrar sessões.</span>
      </div>
    );

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
      {history.map((entry: any) => {
        const isPositive = entry.delta >= 0;
        const changeLabel =
          entry.changeType === "session" ? "Sessão" :
          entry.changeType === "initial" ? "Saldo inicial" : "Ajuste manual";
        const changeCurrency = (entry.currency || currency) as Currency;
        return (
          <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
            <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
              isPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{changeLabel}</span>
                <span className={`text-xs font-bold shrink-0 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  {isPositive ? "+" : ""}{formatInCurrency(entry.delta, changeCurrency)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {formatInCurrency(entry.balanceBefore, changeCurrency)} → {formatInCurrency(entry.balanceAfter, changeCurrency)}
                </span>
              </div>
              {entry.note && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">"{entry.note}"</p>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatDate(entry.changedAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Balance Editor ───────────────────────────────────────────────────────────

function BalanceEditor({
  venue,
  rates,
  onSave,
  isSaving,
}: {
  venue: any;
  rates: any;
  onSave: (balance: number, currency: Currency, note: string) => void;
  isSaving: boolean;
}) {
  const [balanceInput, setBalanceInput] = useState(String(venue.balance / 100));
  const [currency, setCurrency] = useState<Currency>((venue.currency as Currency) || "BRL");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const rate = currency === "USD" ? rates?.USD?.rate :
               currency === "CAD" ? rates?.CAD?.rate :
               currency === "JPY" ? rates?.JPY?.rate : 1;

  const parsedBalance = parseFloat(balanceInput.replace(",", "."));
  const balanceCents = isNaN(parsedBalance) ? 0 : Math.round(parsedBalance * 100);
  const balanceBrl = rate ? Math.round(balanceCents * rate) : balanceCents;

  const handleSave = () => {
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      toast.error("Valor inválido");
      return;
    }
    onSave(balanceCents, currency, note);
    setNote("");
  };

  return (
    <div className="space-y-4">
      {/* Current balance display */}
      <div className="bg-muted/30 rounded-xl p-4">
        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Saldo atual</p>
        <p className="text-2xl font-bold">{formatInCurrency(venue.balance, venue.currency as Currency)}</p>
        {venue.currency !== "BRL" && rate && (
          <p className="text-xs text-muted-foreground mt-1">
            ≈ {formatBrl(Math.round(venue.balance * rate))} (cotação: {CURRENCY_SYMBOLS[venue.currency as Currency]} 1 = {formatBrl(Math.round(rate * 100))})
          </p>
        )}
      </div>

      {/* Edit section */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Definir novo saldo</Label>
        <div className="flex gap-2">
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger className="w-24 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL (R$)</SelectItem>
              <SelectItem value="USD">USD (US$)</SelectItem>
              <SelectItem value="CAD">CAD (CA$)</SelectItem>
              <SelectItem value="JPY">JPY (¥)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            step={currency === "JPY" ? "1" : "0.01"}
            min="0"
            placeholder="0.00"
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 h-9 text-sm"
          />
        </div>

        {/* Converted value preview */}
        {currency !== "BRL" && rate && balanceCents > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>≈ {formatBrl(balanceBrl)} na cotação de hoje</span>
          </div>
        )}

        {/* Note */}
        <div>
          <Label className="text-xs text-muted-foreground">Nota (opcional)</Label>
          <Input
            placeholder="Ex: Depósito, retirada, correção..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-sm mt-1"
            maxLength={256}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full h-9 gap-2">
          {isSaving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Salvar saldo
        </Button>
      </div>

      {/* History toggle */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 text-muted-foreground"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? "Ocultar histórico" : "Ver histórico de ajustes"}
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {showHistory && (
          <div className="mt-2 border border-border/30 rounded-lg p-3">
            <BalanceHistoryPanel venueId={venue.id} currency={venue.currency as Currency} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Venue Form ───────────────────────────────────────────────────────────────

function VenueForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialData?: {
    id?: number;
    name: string;
    type: "online" | "live";
    logoUrl?: string | null;
    website?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [type, setType] = useState<"online" | "live">(initialData?.type || "online");
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl || "");
  const [website, setWebsite] = useState(initialData?.website || "");
  const [address, setAddress] = useState(initialData?.address || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadLogoMutation = trpc.upload.clubLogo.useMutation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        const result = await uploadLogoMutation.mutateAsync({ base64, mimeType: file.type });
        setLogoUrl(result.url);
        toast.success("Logo enviada com sucesso!");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Erro ao enviar imagem.");
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    onSubmit({ id: initialData?.id, name: name.trim(), type, logoUrl: logoUrl || undefined, website: website || undefined, address: address || undefined, notes: notes || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input placeholder="Ex: PokerStars, H2 Club" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Tipo</Label>
        <Select value={type} onValueChange={(v) => setType(v as "online" | "live")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="online"><span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Online</span></SelectItem>
            <SelectItem value="live"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> Live</span></SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Logo (opcional)</Label>
        <div className="flex gap-2">
          <Input placeholder="Cole uma URL ou clique em 📎" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="flex-1" />
          <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="shrink-0">
            {isUploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Upload className="h-4 w-4" />}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
        {logoUrl && (
          <div className="flex items-center gap-3 mt-2">
            <div className="relative">
              <img src={logoUrl} alt="Preview" className="h-14 w-14 rounded-lg object-contain bg-muted p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <button type="button" onClick={() => setLogoUrl("")} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80"><X className="h-3 w-3" /></button>
            </div>
            <span className="text-sm text-muted-foreground">Preview</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Website (opcional)</Label>
        <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {type === "live" && (
        <div className="space-y-2">
          <Label>Endereço (opcional)</Label>
          <Input placeholder="Rua, número, cidade..." value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      )}
      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Textarea placeholder="Observações..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></DialogClose>
        <Button type="submit" disabled={isLoading}>{isLoading ? "Salvando..." : initialData?.id ? "Atualizar" : "Criar"}</Button>
      </DialogFooter>
    </form>
  );
}

// ─── Venue Card ───────────────────────────────────────────────────────────────

function VenueCard({
  venue,
  stats,
  rates,
  onEdit,
  onDelete,
  onBalanceSave,
  isSavingBalance,
}: {
  venue: any;
  stats?: any;
  rates: any;
  onEdit: () => void;
  onDelete: () => void;
  onBalanceSave: (balance: number, currency: Currency, note: string) => void;
  isSavingBalance: boolean;
}) {
  const [showBalance, setShowBalance] = useState(false);
  const isPreset = venue.isPreset === 1;
  const hasStats = stats && stats.sessions > 0;
  const currency = (venue.currency || "BRL") as Currency;
  const itmCount = stats?.winningTables ?? 0;
  const playedCount = stats?.tables ?? 0;
  const itmRate = playedCount > 0 ? ((itmCount / playedCount) * 100).toFixed(1) : "0.0";

  const rate = currency === "USD" ? rates?.USD?.rate :
               currency === "CAD" ? rates?.CAD?.rate :
               currency === "JPY" ? rates?.JPY?.rate : 1;
  const balanceBrl = rate ? Math.round(venue.balance * rate) : venue.balance;

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt={venue.name} className="h-16 w-16 rounded-lg object-contain bg-muted p-1.5" />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                {venue.type === "online" ? <Monitor className="h-6 w-6 text-muted-foreground" /> : <MapPin className="h-6 w-6 text-muted-foreground" />}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{venue.name}</h3>
                {isPreset && <Lock className="h-3 w-3 text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  {venue.type === "online" ? <Monitor className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {venue.type === "online" ? "Online" : "Live"}
                </span>
                {venue.website && (
                  <a href={venue.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary">
                    <Globe className="h-3 w-3" /> Site
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!isPreset && (
              <>
                <Button variant="ghost" size="icon" onClick={onEdit}><Edit className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir local?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {/* Balance summary row */}
        {venue.type === "online" && (
          <div className="bg-muted/20 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Saldo na plataforma</p>
              <p className="text-lg font-bold">{formatInCurrency(venue.balance, currency)}</p>
              {currency !== "BRL" && rate && (
                <p className="text-xs text-muted-foreground">≈ {formatBrl(balanceBrl)}</p>
              )}
            </div>
            <Button
              size="sm"
              variant={showBalance ? "default" : "outline"}
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setShowBalance(!showBalance)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {showBalance ? "Fechar" : "Editar"}
            </Button>
          </div>
        )}

        {/* Balance editor (expandable) */}
        {venue.type === "online" && showBalance && (
          <div className="border border-border/40 rounded-xl p-4 bg-card/60">
            <BalanceEditor
              venue={venue}
              rates={rates}
              onSave={(balance, cur, note) => {
                onBalanceSave(balance, cur, note);
                setShowBalance(false);
              }}
              isSaving={isSavingBalance}
            />
          </div>
        )}

        {/* Session stats */}
        {hasStats && (
          <div className="grid grid-cols-4 gap-2 text-center border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Sessões</p>
              <p className="font-medium">{stats.sessions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lucro</p>
              <p className={`font-bold text-sm flex items-center justify-center gap-0.5 ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.totalProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatBrl(stats.totalProfit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ITM Rate</p>
              <p className="font-medium">{itmRate}%</p>
              <p className="text-[11px] text-muted-foreground">{itmCount}/{playedCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">R$/h</p>
              <p className={`font-medium ${stats.avgHourlyRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatBrl(stats.avgHourlyRate)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Venues() {
  const { primaryType, playTypeOrder, sortVenues } = useBehaviorProfile();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"online" | "live">(primaryType);

  const utils = trpc.useUtils();

  const { data: venues, isLoading } = trpc.venues.list.useQuery({});
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();
  const { data: rates } = trpc.currency.getRates.useQuery();

  const createMutation = trpc.venues.create.useMutation({
    onSuccess: () => { toast.success("Local criado!"); setIsCreateOpen(false); utils.venues.list.invalidate(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const updateMutation = trpc.venues.update.useMutation({
    onSuccess: () => { toast.success("Local atualizado!"); setEditingVenue(null); utils.venues.list.invalidate(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = trpc.venues.delete.useMutation({
    onSuccess: () => { toast.success("Local excluído!"); utils.venues.list.invalidate(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const updateBalanceMutation = trpc.venues.updateBalance.useMutation({
    onSuccess: () => {
      toast.success("Saldo atualizado!");
      utils.venues.list.invalidate();
      utils.bankroll.getConsolidated.invalidate();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  useEffect(() => {
    setActiveTab(primaryType);
  }, [primaryType]);

  const getVenueStats = (venueId: number) => venueStats?.find((s: any) => s.venueId === venueId);
  const filteredVenues = useMemo(() => {
    const typed = (venues?.filter((v: any) => v.type === activeTab) || []);
    const personalized = sortVenues(typed, (venue) => venue.id);
    return [...personalized].sort((a: any, b: any) => {
      const ai = personalized.findIndex((venue: any) => venue.id === a.id);
      const bi = personalized.findIndex((venue: any) => venue.id === b.id);
      if (ai !== bi) return ai - bi;
      return (b.balance ?? 0) - (a.balance ?? 0);
    });
  }, [activeTab, sortVenues, venues]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Salas & Sites</h1>
          <p className="text-muted-foreground text-sm">Gerencie onde você joga e acompanhe seu saldo em ordem de uso real</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Local</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo Local</DialogTitle></DialogHeader>
            <VenueForm onSubmit={(d) => createMutation.mutate(d)} onCancel={() => setIsCreateOpen(false)} isLoading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "online" | "live")}>
        <TabsList>
          {playTypeOrder.map((type) => (
            <TabsTrigger key={type} value={type} className="flex items-center gap-2">
              {type === "online" ? <Monitor className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              {type === "online" ? "Online" : "Live"} ({venues?.filter((v: any) => v.type === type).length || 0})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="online" className="mt-4">
          {filteredVenues.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredVenues.map((venue: any) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  stats={getVenueStats(venue.id)}
                  rates={rates}
                  onEdit={() => setEditingVenue(venue)}
                  onDelete={() => deleteMutation.mutate({ id: venue.id })}
                  onBalanceSave={(balance, currency, note) =>
                    updateBalanceMutation.mutate({ id: venue.id, balance, currency, note: note || undefined })
                  }
                  isSavingBalance={updateBalanceMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma plataforma online cadastrada.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          {filteredVenues.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredVenues.map((venue: any) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  stats={getVenueStats(venue.id)}
                  rates={rates}
                  onEdit={() => setEditingVenue(venue)}
                  onDelete={() => deleteMutation.mutate({ id: venue.id })}
                  onBalanceSave={(balance, currency, note) =>
                    updateBalanceMutation.mutate({ id: venue.id, balance, currency, note: note || undefined })
                  }
                  isSavingBalance={updateBalanceMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum local live cadastrado.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingVenue} onOpenChange={(open) => !open && setEditingVenue(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Local</DialogTitle></DialogHeader>
          {editingVenue && (
            <VenueForm
              initialData={editingVenue}
              onSubmit={(d) => updateMutation.mutate(d)}
              onCancel={() => setEditingVenue(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
