import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings as SettingsIcon, DollarSign, Monitor, Users, Save, User, Camera } from "lucide-react";

// Helper to format currency
function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

export default function Settings() {
  const { user } = useAuth();
  const [onlineBankroll, setOnlineBankroll] = useState("");
  const [liveBankroll, setLiveBankroll] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [hasAvatarChanges, setHasAvatarChanges] = useState(false);

  const { data: settings, isLoading } = trpc.bankroll.getSettings.useQuery();
  const utils = trpc.useUtils();

  const updateMutation = trpc.bankroll.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações de bankroll salvas!");
      utils.bankroll.getSettings.invalidate();
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.history.invalidate();
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error("Erro ao salvar: " + error.message);
    },
  });

  const updateAvatarMutation = trpc.profile.updateAvatar.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil atualizada! Recarregue a página para ver as alterações.");
      setHasAvatarChanges(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar foto: " + error.message);
    },
  });

  useEffect(() => {
    if (settings) {
      setOnlineBankroll(String(settings.initialOnline / 100));
      setLiveBankroll(String(settings.initialLive / 100));
    }
  }, [settings]);

  useEffect(() => {
    if (user && (user as any).avatarUrl) {
      setAvatarUrl((user as any).avatarUrl);
    }
  }, [user]);

  const handleOnlineChange = (value: string) => {
    setOnlineBankroll(value);
    setHasChanges(true);
  };

  const handleLiveChange = (value: string) => {
    setLiveBankroll(value);
    setHasChanges(true);
  };

  const handleAvatarChange = (value: string) => {
    setAvatarUrl(value);
    setHasAvatarChanges(true);
  };

  const handleSave = () => {
    const onlineCentavos = Math.round(parseFloat(onlineBankroll) * 100);
    const liveCentavos = Math.round(parseFloat(liveBankroll) * 100);

    if (isNaN(onlineCentavos) || onlineCentavos < 0) {
      toast.error("Valor do bankroll online inválido");
      return;
    }
    if (isNaN(liveCentavos) || liveCentavos < 0) {
      toast.error("Valor do bankroll live inválido");
      return;
    }

    updateMutation.mutate({
      initialOnline: onlineCentavos,
      initialLive: liveCentavos,
    });
  };

  const handleSaveAvatar = () => {
    if (!avatarUrl.trim()) {
      toast.error("Por favor, insira uma URL de imagem válida");
      return;
    }

    // Basic URL validation
    try {
      new URL(avatarUrl);
    } catch {
      toast.error("URL inválida. Por favor, insira uma URL completa (ex: https://...)");
      return;
    }

    updateAvatarMutation.mutate({ avatarUrl: avatarUrl.trim() });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const totalBankroll =
    (parseFloat(onlineBankroll) || 0) + (parseFloat(liveBankroll) || 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Configurações
        </h2>
        <p className="text-muted-foreground">
          Configure seu perfil e bankroll inicial
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Perfil
          </CardTitle>
          <CardDescription>
            Personalize seu perfil com uma foto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24 border-2 border-primary/20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-2xl bg-primary/10">
                  {user?.name?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
                <Camera className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="font-medium">{user?.name || "Usuário"}</p>
                <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
              </div>
              <div className="space-y-2">
                <Label>URL da Foto de Perfil</Label>
                <Input
                  type="url"
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  value={avatarUrl}
                  onChange={(e) => handleAvatarChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cole a URL de uma imagem da web (ex: foto do Google, Gravatar, etc.)
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleSaveAvatar}
                disabled={!hasAvatarChanges || updateAvatarMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateAvatarMutation.isPending ? "Salvando..." : "Salvar Foto"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bankroll Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-[oklch(0.7_0.15_85)]" />
            Bankroll Inicial
          </CardTitle>
          <CardDescription>
            Defina os valores iniciais do seu bankroll para poker online e live.
            Esses valores serão usados como base para calcular seu lucro/prejuízo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-[oklch(0.5_0.15_250)]" />
                Bankroll Online (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={onlineBankroll}
                onChange={(e) => handleOnlineChange(e.target.value)}
                placeholder="1000.00"
              />
              <p className="text-xs text-muted-foreground">
                Valor destinado para jogos online
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[oklch(0.55_0.18_145)]" />
                Bankroll Live (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={liveBankroll}
                onChange={(e) => handleLiveChange(e.target.value)}
                placeholder="4000.00"
              />
              <p className="text-xs text-muted-foreground">
                Valor destinado para jogos presenciais
              </p>
            </div>
          </div>

          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bankroll Total</p>
                  <p className="text-2xl font-bold text-[oklch(0.7_0.15_85)]">
                    {formatCurrency(totalBankroll * 100)}
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>Online: {formatCurrency(parseFloat(onlineBankroll || "0") * 100)}</p>
                  <p>Live: {formatCurrency(parseFloat(liveBankroll || "0") * 100)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sobre o Aplicativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Este aplicativo foi desenvolvido para ajudar você a gerenciar seu bankroll
            de poker e acompanhar seu desempenho ao longo do tempo.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-2xl">📊</p>
              <p className="text-sm font-medium mt-1">Dashboard</p>
              <p className="text-xs text-muted-foreground">Visão geral</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-2xl">🎰</p>
              <p className="text-sm font-medium mt-1">Sessões</p>
              <p className="text-xs text-muted-foreground">Registro detalhado</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-2xl">📈</p>
              <p className="text-sm font-medium mt-1">Gráficos</p>
              <p className="text-xs text-muted-foreground">Evolução visual</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-2xl">💰</p>
              <p className="text-sm font-medium mt-1">Métricas</p>
              <p className="text-xs text-muted-foreground">ROI, Win Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
