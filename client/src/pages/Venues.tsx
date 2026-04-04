import { useState, useRef } from "react";
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
} from "lucide-react";

// Helper to format currency
function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

// Venue form component
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
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5MB.");
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        const result = await uploadLogoMutation.mutateAsync({
          base64,
          mimeType: file.type,
        });
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

    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    onSubmit({
      id: initialData?.id,
      name: name.trim(),
      type,
      logoUrl: logoUrl || undefined,
      website: website || undefined,
      address: address || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input
          placeholder="Ex: PokerStars, H2 Club"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Tipo</Label>
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
        <Label>Logo do Clube (opcional)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Cole uma URL ou clique em 📎 para enviar do dispositivo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Enviar imagem do seu dispositivo"
            className="shrink-0"
          >
            {isUploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
        {logoUrl && (
          <div className="flex items-center gap-3 mt-2">
            <div className="relative">
              <img 
                src={logoUrl} 
                alt="Preview" 
                className="h-14 w-14 rounded-lg object-contain bg-muted p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <span className="text-sm text-muted-foreground">Preview da logo</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Website (opcional)</Label>
        <Input
          placeholder="https://..."
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {type === "live" && (
        <div className="space-y-2">
          <Label>Endereço (opcional)</Label>
          <Input
            placeholder="Rua, número, cidade..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Textarea
          placeholder="Observações sobre o local..."
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

// Venue card component
function VenueCard({
  venue,
  stats,
  onEdit,
  onDelete,
}: {
  venue: {
    id: number;
    name: string;
    type: "online" | "live";
    logoUrl?: string | null;
    website?: string | null;
    address?: string | null;
    notes?: string | null;
    isPreset: number;
  };
  stats?: {
    sessions: number;
    totalProfit: number;
    winRate: number;
    avgHourlyRate: number;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPreset = venue.isPreset === 1;
  const hasStats = stats && stats.sessions > 0;
  const isPositive = hasStats && stats.totalProfit >= 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {venue.logoUrl ? (
              <img 
                src={venue.logoUrl} 
                alt={venue.name} 
                className="h-12 w-12 rounded-lg object-contain bg-muted p-1"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                {venue.type === "online" ? (
                  <Monitor className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <MapPin className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{venue.name}</h3>
                {isPreset && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {venue.type === "online" ? (
                  <span className="flex items-center gap-1">
                    <Monitor className="h-3 w-3" /> Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> Live
                  </span>
                )}
                {venue.website && (
                  <a 
                    href={venue.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    <Globe className="h-3 w-3" /> Site
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!isPreset && (
              <>
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
                      <AlertDialogTitle>Excluir local?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O local será removido permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        {hasStats && (
          <div className="mt-4 grid grid-cols-4 gap-2 text-center border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground">Sessões</p>
              <p className="font-medium">{stats.sessions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lucro</p>
              <p
                className={`font-bold flex items-center justify-center gap-1 ${
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
                {formatCurrency(stats.totalProfit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="font-medium">{stats.winRate}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">R$/hora</p>
              <p
                className={`font-medium ${
                  stats.avgHourlyRate >= 0
                    ? "text-[oklch(0.6_0.2_145)]"
                    : "text-[oklch(0.55_0.22_25)]"
                }`}
              >
                {formatCurrency(stats.avgHourlyRate)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Venues() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"online" | "live">("online");

  const utils = trpc.useUtils();

  const { data: venues, isLoading } = trpc.venues.list.useQuery({});
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();

  const createMutation = trpc.venues.create.useMutation({
    onSuccess: () => {
      toast.success("Local criado com sucesso!");
      setIsCreateOpen(false);
      utils.venues.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao criar local: ${error.message}`);
    },
  });

  const updateMutation = trpc.venues.update.useMutation({
    onSuccess: () => {
      toast.success("Local atualizado com sucesso!");
      setEditingVenue(null);
      utils.venues.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar local: ${error.message}`);
    },
  });

  const deleteMutation = trpc.venues.delete.useMutation({
    onSuccess: () => {
      toast.success("Local excluído com sucesso!");
      utils.venues.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir local: ${error.message}`);
    },
  });

  const handleCreate = (data: any) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: any) => {
    updateMutation.mutate(data);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const getVenueStats = (venueId: number) => {
    return venueStats?.find(s => s.venueId === venueId);
  };

  const filteredVenues = venues?.filter(v => v.type === activeTab) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Locais & Plataformas</h1>
          <p className="text-muted-foreground">
            Gerencie onde você joga poker
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Local
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Local</DialogTitle>
            </DialogHeader>
            <VenueForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreateOpen(false)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "online" | "live")}>
        <TabsList>
          <TabsTrigger value="online" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Online ({venues?.filter(v => v.type === "online").length || 0})
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Live ({venues?.filter(v => v.type === "live").length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="online" className="mt-4">
          {filteredVenues.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  stats={getVenueStats(venue.id)}
                  onEdit={() => setEditingVenue(venue)}
                  onDelete={() => handleDelete(venue.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Nenhuma plataforma online cadastrada.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          {filteredVenues.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  stats={getVenueStats(venue.id)}
                  onEdit={() => setEditingVenue(venue)}
                  onDelete={() => handleDelete(venue.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Nenhum local live cadastrado.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingVenue} onOpenChange={(open) => !open && setEditingVenue(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Local</DialogTitle>
          </DialogHeader>
          {editingVenue && (
            <VenueForm
              initialData={editingVenue}
              onSubmit={handleUpdate}
              onCancel={() => setEditingVenue(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
