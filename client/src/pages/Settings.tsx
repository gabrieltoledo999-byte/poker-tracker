import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Settings as SettingsIcon, DollarSign, Monitor, Users, Save, User, Camera, Upload, X, Sun, Moon } from "lucide-react";
import { useTheme, ACCENT_COLORS, type AccentColor } from "@/contexts/ThemeContext";

// Helper to format currency
function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

// Convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

const POKER_GENERIC_AVATARS = [
  "/avatars/poker-generic-1.svg",
  "/avatars/poker-generic-2.svg",
  "/avatars/poker-generic-3.svg",
  "/avatars/poker-generic-4.svg",
];

export default function Settings() {
  const { user } = useAuth();
  const [onlineBankroll, setOnlineBankroll] = useState("");
  const [liveBankroll, setLiveBankroll] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPresetAvatar, setSelectedPresetAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadAvatarMutation = trpc.profile.uploadAvatar.useMutation({
    onSuccess: async (data) => {
      await utils.auth.me.invalidate();
      toast.success("Foto de perfil atualizada!");
      setAvatarUrl(data.url);
      setAvatarPreview("");
      setSelectedFile(null);
    },
    onError: (error) => {
      toast.error("Erro ao enviar foto: " + error.message);
    },
  });

  const updateAvatarMutation = trpc.profile.updateAvatar.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Foto de perfil atualizada!");
      setSelectedPresetAvatar(null);
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

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    // Keep client/server constraints aligned.
    if (file.size > 1 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 1MB");
      return;
    }

    setSelectedFile(file);
    
    // Create preview
    const base64 = await fileToBase64(file);
    setAvatarPreview(base64);
  }, []);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Upload the selected file
  const handleUploadAvatar = async () => {
    if (!selectedFile) return;

    const base64 = await fileToBase64(selectedFile);
    
    uploadAvatarMutation.mutate({
      base64,
      mimeType: selectedFile.type,
      fileName: selectedFile.name,
    });
  };

  // Cancel file selection
  const handleCancelUpload = () => {
    setSelectedFile(null);
    setAvatarPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectPresetAvatar = (avatar: string) => {
    setSelectedPresetAvatar(avatar);
    setAvatarPreview("");
    setSelectedFile(null);
    setAvatarUrl(avatar);
  };

  const handleApplyPresetAvatar = () => {
    if (!selectedPresetAvatar) return;
    updateAvatarMutation.mutate({ avatarUrl: selectedPresetAvatar });
  };

  const { theme, toggleTheme, accentColor, setAccentColor } = useTheme();

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

  const displayAvatar = avatarPreview || avatarUrl;

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
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar Preview */}
            <div className="relative">
              <Avatar className="h-24 w-24 border-2 border-primary/20">
                <AvatarImage src={displayAvatar || undefined} />
                <AvatarFallback className="text-2xl bg-primary/10">
                  {user?.name?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
                <Camera className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>

            {/* Upload Area */}
            <div className="flex-1 w-full space-y-4">
              <div>
                <p className="font-medium">{user?.name || "Usuário"}</p>
                <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
              </div>

              {/* Drag & Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                
                <div className="flex flex-col items-center gap-2 text-center">
                  <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="font-medium">
                      {isDragging ? "Solte a imagem aqui" : "Arraste sua foto aqui"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ou clique para selecionar (máx. 1MB)
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected File Actions */}
              {selectedFile && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelUpload}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUploadAvatar}
                    disabled={uploadAvatarMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {uploadAvatarMutation.isPending ? "Enviando..." : "Salvar"}
                  </Button>
                </div>
              )}

              {/* URL Input (alternative) */}
              <div className="pt-2 border-t space-y-3">
                <p className="text-xs text-muted-foreground">
                  Avatares genéricos de poker:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {POKER_GENERIC_AVATARS.map((avatar, idx) => {
                    const isActive = avatarUrl === avatar || selectedPresetAvatar === avatar;
                    return (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => handleSelectPresetAvatar(avatar)}
                        className={`rounded-lg border p-1 transition-all ${
                          isActive
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50"
                        }`}
                        aria-label={`Selecionar avatar poker ${idx + 1}`}
                      >
                        <img
                          src={avatar}
                          alt={`Avatar poker ${idx + 1}`}
                          className="h-16 w-16 mx-auto rounded-md object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApplyPresetAvatar}
                    disabled={!selectedPresetAvatar || updateAvatarMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Usar avatar selecionado
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  Ou cole a URL de uma imagem:
                </p>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://exemplo.com/sua-foto.jpg"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (avatarUrl) {
                        updateAvatarMutation.mutate({ avatarUrl });
                      }
                    }}
                    disabled={!avatarUrl || updateAvatarMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
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

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Aparência
          </CardTitle>
          <CardDescription>
            Escolha entre o tema claro ou escuro. A preferência é salva automaticamente no seu navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Tema claro/escuro */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="h-8 w-8 text-[oklch(0.6_0.15_250)]" />
                ) : (
                  <Sun className="h-8 w-8 text-[oklch(0.7_0.15_85)]" />
                )}
                <div>
                  <p className="font-medium">{theme === "dark" ? "Tema Escuro" : "Tema Claro"}</p>
                  <p className="text-sm text-muted-foreground">
                    {theme === "dark" ? "Interface escura, ideal para uso noturno" : "Interface clara, ideal para uso diurno"}
                  </p>
                </div>
              </div>
              <Button onClick={toggleTheme} variant="outline" className="gap-2">
                {theme === "dark" ? (
                  <><Sun className="h-4 w-4" />Mudar para Claro</>
                ) : (
                  <><Moon className="h-4 w-4" />Mudar para Escuro</>
                )}
              </Button>
            </div>

            {/* Cor de acento */}
            <div className="p-4 rounded-lg border space-y-3">
              <div>
                <p className="font-medium">Cor de Destaque</p>
                <p className="text-sm text-muted-foreground">Escolha a cor principal do aplicativo. Salva automaticamente.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {(Object.entries(ACCENT_COLORS) as [AccentColor, typeof ACCENT_COLORS[AccentColor]][]).map(([key, val]) => (
                  <button
                    key={key}
                    title={val.label}
                    onClick={() => setAccentColor(key)}
                    className={`relative h-9 w-9 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      accentColor === key ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: val.hex }}
                  >
                    {accentColor === key && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="white" strokeWidth={3}>
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Cor atual: <span className="font-medium" style={{ color: ACCENT_COLORS[accentColor].hex }}>{ACCENT_COLORS[accentColor].label}</span>
              </p>
            </div>
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
