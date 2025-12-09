import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Filter,
  Monitor,
  Users,
} from "lucide-react";
import { GAME_FORMATS, GameFormat, getGameFormatLabel, getGameFormatEmoji } from "@shared/gameFormats";

// Helper to format currency
function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

// Helper to format duration
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  return `${hours}h ${mins}min`;
}

// Helper to calculate ROI
function calculateROI(buyIn: number, cashOut: number): number {
  if (buyIn === 0) return 0;
  return ((cashOut - buyIn) / buyIn) * 100;
}

// Helper to calculate hourly rate
function calculateHourlyRate(profit: number, minutes: number): number {
  if (minutes === 0) return 0;
  return (profit / minutes) * 60;
}

// Session form component
function SessionForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialData?: {
    id?: number;
    type: "online" | "live";
    gameFormat: GameFormat;
    buyIn: number;
    cashOut: number;
    sessionDate: Date;
    durationMinutes: number;
    notes?: string | null;
    gameType?: string | null;
    stakes?: string | null;
    location?: string | null;
  };
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [type, setType] = useState<"online" | "live">(initialData?.type || "live");
  const [gameFormat, setGameFormat] = useState<GameFormat>(initialData?.gameFormat || "cash_game");
  const [buyIn, setBuyIn] = useState(
    initialData ? String(initialData.buyIn / 100) : ""
  );
  const [cashOut, setCashOut] = useState(
    initialData ? String(initialData.cashOut / 100) : ""
  );
  const [sessionDate, setSessionDate] = useState(
    initialData
      ? new Date(initialData.sessionDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [hours, setHours] = useState(
    initialData ? String(Math.floor(initialData.durationMinutes / 60)) : ""
  );
  const [minutes, setMinutes] = useState(
    initialData ? String(initialData.durationMinutes % 60) : ""
  );
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [gameType, setGameType] = useState(initialData?.gameType || "");
  const [stakes, setStakes] = useState(initialData?.stakes || "");
  const [location, setLocation] = useState(initialData?.location || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const buyInCentavos = Math.round(parseFloat(buyIn) * 100);
    const cashOutCentavos = Math.round(parseFloat(cashOut) * 100);
    const durationMinutes =
      (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);

    if (isNaN(buyInCentavos) || buyInCentavos <= 0) {
      toast.error("Buy-in deve ser um valor positivo");
      return;
    }
    if (isNaN(cashOutCentavos) || cashOutCentavos < 0) {
      toast.error("Cash-out deve ser um valor válido");
      return;
    }
    if (durationMinutes <= 0) {
      toast.error("Duração deve ser maior que zero");
      return;
    }

    onSubmit({
      id: initialData?.id,
      type,
      gameFormat,
      buyIn: buyInCentavos,
      cashOut: cashOutCentavos,
      sessionDate: new Date(sessionDate),
      durationMinutes,
      notes: notes || undefined,
      gameType: gameType || undefined,
      stakes: stakes || undefined,
      location: location || undefined,
    });
  };

  // Preview calculations
  const buyInNum = parseFloat(buyIn) * 100 || 0;
  const cashOutNum = parseFloat(cashOut) * 100 || 0;
  const profit = cashOutNum - buyInNum;
  const roi = calculateROI(buyInNum, cashOutNum);
  const durationMins = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
  const hourlyRate = calculateHourlyRate(profit, durationMins);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Modalidade</Label>
          <Select value={type} onValueChange={(v) => setType(v as "online" | "live")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">
                <span className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> Online
                </span>
              </SelectItem>
              <SelectItem value="live">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Live
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Data</Label>
          <Input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tipo de Jogo</Label>
        <Select value={gameFormat} onValueChange={(v) => setGameFormat(v as GameFormat)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAME_FORMATS.map((format) => (
              <SelectItem key={format.value} value={format.value}>
                <span className="flex items-center gap-2">
                  <span>{format.emoji}</span> {format.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Buy-in (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={buyIn}
            onChange={(e) => setBuyIn(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Cash-out (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={cashOut}
            onChange={(e) => setCashOut(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Duração (horas)</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Duração (minutos)</Label>
          <Input
            type="number"
            min="0"
            max="59"
            placeholder="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>

      {/* Preview */}
      {buyIn && cashOut && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p
                  className={`text-lg font-bold ${
                    profit >= 0
                      ? "text-[oklch(0.6_0.2_145)]"
                      : "text-[oklch(0.55_0.22_25)]"
                  }`}
                >
                  {profit >= 0 ? "+" : ""}
                  {formatCurrency(profit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ROI</p>
                <p
                  className={`text-lg font-bold ${
                    roi >= 0
                      ? "text-[oklch(0.6_0.2_145)]"
                      : "text-[oklch(0.55_0.22_25)]"
                  }`}
                >
                  {roi >= 0 ? "+" : ""}
                  {roi.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">R$/hora</p>
                <p
                  className={`text-lg font-bold ${
                    hourlyRate >= 0
                      ? "text-[oklch(0.6_0.2_145)]"
                      : "text-[oklch(0.55_0.22_25)]"
                  }`}
                >
                  {hourlyRate >= 0 ? "+" : ""}
                  {formatCurrency(hourlyRate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Variante (opcional)</Label>
          <Input
            placeholder="Ex: NL Hold'em, PLO"
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Stakes (opcional)</Label>
          <Input
            placeholder="Ex: 1/2, 2/5"
            value={stakes}
            onChange={(e) => setStakes(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Local (opcional)</Label>
        <Input
          placeholder="Ex: PokerStars, Cassino XYZ"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Textarea
          placeholder="Observações sobre a sessão..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Salvando..." : initialData?.id ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Session card component
function SessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: {
    id: number;
    type: "online" | "live";
    gameFormat: GameFormat;
    buyIn: number;
    cashOut: number;
    sessionDate: Date;
    durationMinutes: number;
    notes?: string | null;
    gameType?: string | null;
    stakes?: string | null;
    location?: string | null;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const profit = session.cashOut - session.buyIn;
  const roi = calculateROI(session.buyIn, session.cashOut);
  const hourlyRate = calculateHourlyRate(profit, session.durationMinutes);
  const isPositive = profit >= 0;

  return (
    <Card className="overflow-hidden">
      <div
        className={`h-1 ${
          isPositive
            ? "bg-[oklch(0.6_0.2_145)]"
            : "bg-[oklch(0.55_0.22_25)]"
        }`}
      />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {session.type === "online" ? (
                <Monitor className="h-4 w-4 text-[oklch(0.5_0.15_250)]" />
              ) : (
                <Users className="h-4 w-4 text-[oklch(0.55_0.18_145)]" />
              )}
              <span className="font-medium">
                {session.type === "online" ? "Online" : "Live"}
              </span>
              <span className="text-sm bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                {getGameFormatEmoji(session.gameFormat)} {getGameFormatLabel(session.gameFormat)}
              </span>
              {session.stakes && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  {session.stakes}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(session.sessionDate).toLocaleDateString("pt-BR")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(session.durationMinutes)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir sessão?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A sessão será permanentemente
                    removida.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Buy-in</p>
            <p className="font-medium">{formatCurrency(session.buyIn)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash-out</p>
            <p className="font-medium">{formatCurrency(session.cashOut)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resultado</p>
            <p
              className={`font-bold flex items-center gap-1 ${
                isPositive
                  ? "text-[oklch(0.6_0.2_145)]"
                  : "text-[oklch(0.55_0.22_25)]"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isPositive ? "+" : ""}
              {formatCurrency(profit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ROI</p>
            <p
              className={`font-bold ${
                isPositive
                  ? "text-[oklch(0.6_0.2_145)]"
                  : "text-[oklch(0.55_0.22_25)]"
              }`}
            >
              {isPositive ? "+" : ""}
              {roi.toFixed(1)}%
            </p>
          </div>
        </div>

        {(session.location || session.gameType || session.notes) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {session.location && (
              <p className="text-sm text-muted-foreground">📍 {session.location}</p>
            )}
            {session.gameType && (
              <p className="text-sm text-muted-foreground">🎴 {session.gameType}</p>
            )}
            {session.notes && (
              <p className="text-sm text-muted-foreground">📝 {session.notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Sessions() {
  const [typeFilter, setTypeFilter] = useState<"all" | "online" | "live">("all");
  const [formatFilter, setFormatFilter] = useState<"all" | GameFormat>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);

  const utils = trpc.useUtils();

  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(
    {
      ...(typeFilter !== "all" && { type: typeFilter }),
      ...(formatFilter !== "all" && { gameFormat: formatFilter }),
    }
  );

  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: () => {
      toast.success("Sessão criada com sucesso!");
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.statsByFormat.invalidate();
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.history.invalidate();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao criar sessão: " + error.message);
    },
  });

  const updateMutation = trpc.sessions.update.useMutation({
    onSuccess: () => {
      toast.success("Sessão atualizada com sucesso!");
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.statsByFormat.invalidate();
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.history.invalidate();
      setIsDialogOpen(false);
      setEditingSession(null);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar sessão: " + error.message);
    },
  });

  const deleteMutation = trpc.sessions.delete.useMutation({
    onSuccess: () => {
      toast.success("Sessão excluída com sucesso!");
      utils.sessions.list.invalidate();
      utils.sessions.stats.invalidate();
      utils.sessions.statsByFormat.invalidate();
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.history.invalidate();
    },
    onError: (error) => {
      toast.error("Erro ao excluir sessão: " + error.message);
    },
  });

  const handleSubmit = (data: any) => {
    if (data.id) {
      updateMutation.mutate(data);
    } else {
      const { id, ...createData } = data;
      createMutation.mutate(createData);
    }
  };

  const handleEdit = (session: any) => {
    setEditingSession(session);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Sessões</h2>
          <p className="text-muted-foreground">
            Gerencie suas sessões de poker
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
          >
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={formatFilter}
            onValueChange={(v) => setFormatFilter(v as typeof formatFilter)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo de jogo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {GAME_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.emoji} {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingSession(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Sessão
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingSession ? "Editar Sessão" : "Nova Sessão"}
                </DialogTitle>
              </DialogHeader>
              <SessionForm
                initialData={editingSession}
                onSubmit={handleSubmit}
                onCancel={() => {
                  setIsDialogOpen(false);
                  setEditingSession(null);
                }}
                isLoading={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onEdit={() => handleEdit(session)}
              onDelete={() => handleDelete(session.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhuma sessão registrada ainda
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar primeira sessão
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
