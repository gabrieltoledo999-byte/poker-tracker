import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Settings as SettingsIcon, DollarSign, Monitor, Users, Save, User, Camera, Upload, X, Sun, Moon, Trophy, RotateCw } from "lucide-react";
import { useTheme, ACCENT_COLORS, type AccentColor } from "@/contexts/ThemeContext";

// Helper to format currency

// ─── Image Crop Modal ─────────────────────────────────────────────────────────
const CROP_DISPLAY = 280;
const CROP_OUTPUT = 400;

function CropModal({ src, onApply, onCancel }: { src: string; onApply: (blob: Blob) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const fit = Math.max(CROP_DISPLAY / img.width, CROP_DISPLAY / img.height);
      setMinZoom(fit);
      setZoom(fit);
      setOffset({ x: (CROP_DISPLAY - img.width * fit) / 2, y: (CROP_DISPLAY - img.height * fit) / 2 });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CROP_DISPLAY, CROP_DISPLAY);
    ctx.save();
    ctx.translate(CROP_DISPLAY / 2, CROP_DISPLAY / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-CROP_DISPLAY / 2, -CROP_DISPLAY / 2);
    ctx.drawImage(img, offset.x, offset.y, img.width * zoom, img.height * zoom);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CROP_DISPLAY, CROP_DISPLAY);
    ctx.arc(CROP_DISPLAY / 2, CROP_DISPLAY / 2, CROP_DISPLAY / 2, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.beginPath();
    ctx.arc(CROP_DISPLAY / 2, CROP_DISPLAY / 2, CROP_DISPLAY / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [zoom, offset, rotation]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  const onPointerUp = () => { dragging.current = false; };

  const handleZoomChange = (val: number[]) => { setZoom(val[0]); };

  const handleRotate = () => { setRotation((r) => (r + 90) % 360); };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = CROP_OUTPUT;
    offscreen.height = CROP_OUTPUT;
    const ctx = offscreen.getContext("2d")!;
    const scale = CROP_OUTPUT / CROP_DISPLAY;
    ctx.save();
    ctx.translate(CROP_OUTPUT / 2, CROP_OUTPUT / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-CROP_OUTPUT / 2, -CROP_OUTPUT / 2);
    ctx.drawImage(img, offset.x * scale, offset.y * scale, img.width * zoom * scale, img.height * zoom * scale);
    ctx.restore();
    offscreen.toBlob((blob) => { if (blob) onApply(blob); }, "image/jpeg", 0.92);
  };

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar foto de perfil</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            width={CROP_DISPLAY}
            height={CROP_DISPLAY}
            className="rounded-full cursor-grab active:cursor-grabbing touch-none"
            style={{ width: CROP_DISPLAY, height: CROP_DISPLAY }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-8">Zoom</span>
              <Slider
                min={minZoom}
                max={minZoom * 4}
                step={0.01}
                value={[zoom]}
                onValueChange={handleZoomChange}
                className="flex-1"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2 w-full" onClick={handleRotate}>
              <RotateCw className="h-4 w-4" /> Girar 90°
            </Button>
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button className="flex-1" onClick={handleApply}>Aplicar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
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

const ALTERNATIVE_AVATAR_GROUPS = [
  {
    id: "royal-dark",
    title: "Royals Sombrios",
    description: "Cartas clássicas com tema escuro e símbolo de espadas.",
    items: [
      { src: "/avatars/alt/ace-spade-dark.png", label: "Ás Sombrio" },
      { src: "/avatars/alt/king-spade-dark.png", label: "Rei Sombrio" },
      { src: "/avatars/alt/queen-spade-dark.png", label: "Dama Sombria" },
      { src: "/avatars/alt/jack-spade-dark.png", label: "Valete Sombrio" },
    ],
  },
  {
    id: "predators",
    title: "Predadores",
    description: "Perfis fortes com assinatura animal e capuz.",
    items: [
      { src: "/avatars/alt/wolf-hood-dark.png", label: "Lobo" },
      { src: "/avatars/alt/lion-hood-ember.png", label: "Leão" },
      { src: "/avatars/alt/eagle-hood-green.png", label: "Águia" },
    ],
  },
  {
    id: "anonymous",
    title: "Anônimos",
    description: "Perfis discretos, frios e mais misteriosos.",
    items: [
      { src: "/avatars/alt/shadow-cap-green.png", label: "Sombra" },
      { src: "/avatars/alt/faceless-hood-dark.png", label: "Sem Rosto" },
      { src: "/avatars/alt/shade-hood-blue.png", label: "Óculos" },
    ],
  },
  {
    id: "royal-feminine",
    title: "Royals Elegantes",
    description: "Versões femininas em cores mais marcantes.",
    items: [
      { src: "/avatars/alt/ace-queen-pink.png", label: "Ás Rosa" },
      { src: "/avatars/alt/king-queen-gold.png", label: "Rei Dourado" },
      { src: "/avatars/alt/queen-queen-violet.png", label: "Dama Violeta" },
      { src: "/avatars/alt/jack-queen-mint.png", label: "Valete Menta" },
    ],
  },
] as const;

const ALL_PRESET_AVATARS = ALTERNATIVE_AVATAR_GROUPS.flatMap((group) =>
  group.items.map((item) => item.src)
);

const POKER_FORMAT_OPTIONS = [
  { value: "tournament", label: "Torneio" },
  { value: "cash_game", label: "Cash Game" },
  { value: "sit_and_go", label: "Sit & Go" },
  { value: "spin_and_go", label: "Spin & Go" },
  { value: "turbo", label: "Turbo" },
  { value: "hyper_turbo", label: "Hyper Turbo" },
  { value: "bounty", label: "Bounty" },
  { value: "satellite", label: "Satelite" },
  { value: "heads_up", label: "Heads-up" },
];

const ONLINE_TO_BRL_RATE = 5.75;

const PROFILE_BUY_IN_RANGES = [
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
  const range = PROFILE_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return 0;
  if (playType === "online") return range.valueUsdCents;
  return Math.round(range.valueUsdCents * ONLINE_TO_BRL_RATE);
}

function getRangeLabelByType(rangeKey: string, playType: "online" | "live"): string {
  const range = PROFILE_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return "";
  if (playType === "online") {
    return `${formatUsdCents(range.minUsdCents)} - ${formatUsdCents(range.maxUsdCents)}`;
  }
  const brlMin = Math.round(range.minUsdCents * ONLINE_TO_BRL_RATE);
  const brlMax = Math.round(range.maxUsdCents * ONLINE_TO_BRL_RATE);
  return `${formatBrlCents(brlMin)} - ${formatBrlCents(brlMax)}`;
}

function getOnlineRangeApproxLabel(rangeKey: string): string {
  const range = PROFILE_BUY_IN_RANGES.find((r) => r.key === rangeKey);
  if (!range) return "";
  const brlMin = Math.round(range.minUsdCents * ONLINE_TO_BRL_RATE);
  const brlMax = Math.round(range.maxUsdCents * ONLINE_TO_BRL_RATE);
  return `Aproximacao em BRL: ${formatBrlCents(brlMin)} - ${formatBrlCents(brlMax)}`;
}

function mapBuyInsToRangeKeys(values: number[], playType: "online" | "live"): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    let closest: { key: string; distance: number } | null = null;
    for (const range of PROFILE_BUY_IN_RANGES) {
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
    const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [profilePlayType, setProfilePlayType] = useState<"online" | "live">("online");
  const [profileFormats, setProfileFormats] = useState<string[]>([]);
  const [profilePlatforms, setProfilePlatforms] = useState<string[]>([]);
  const [profileBuyInRangesOnline, setProfileBuyInRangesOnline] = useState<string[]>([]);
  const [profileBuyInRangesLive, setProfileBuyInRangesLive] = useState<string[]>([]);
  const [profileMultiPlatform, setProfileMultiPlatform] = useState(false);
  const [showInGlobalRanking, setShowInGlobalRanking] = useState(false);
  const [showInFriendsRanking, setShowInFriendsRanking] = useState(false);
  const [hasProfileChanges, setHasProfileChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = trpc.bankroll.getSettings.useQuery();
  const { data: onboardingProfile } = trpc.sessions.getOnboardingProfile.useQuery();
  const { data: venues } = trpc.venues.list.useQuery({});
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
    onSuccess: async (_data, variables) => {
      await utils.auth.me.invalidate();
      toast.success("Foto de perfil atualizada!");
      setAvatarUrl(variables.avatarUrl);
      setAvatarPreview("");
      setSelectedFile(null);
      setSelectedPresetAvatar(null);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar foto: " + error.message);
    },
  });

  const saveProfileMutation = trpc.sessions.saveOnboardingProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil de jogo atualizado!");
      utils.sessions.getOnboardingProfile.invalidate();
      utils.sessions.getUserPreferences.invalidate();
      utils.auth.me.invalidate();
      setHasProfileChanges(false);
    },
    onError: (error) => {
      toast.error("Erro ao salvar perfil: " + error.message);
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

  useEffect(() => {
    if (!onboardingProfile) return;
    if (onboardingProfile.preferredPlayType === "online" || onboardingProfile.preferredPlayType === "live") {
      setProfilePlayType(onboardingProfile.preferredPlayType);
    }
    setProfileFormats(onboardingProfile.preferredFormats ?? []);
    setProfilePlatforms(onboardingProfile.preferredPlatforms ?? []);
    setProfileBuyInRangesOnline(mapBuyInsToRangeKeys(onboardingProfile.preferredBuyInsOnline ?? onboardingProfile.preferredBuyIns ?? [], "online"));
    setProfileBuyInRangesLive(mapBuyInsToRangeKeys(onboardingProfile.preferredBuyInsLive ?? [], "live"));
    setProfileMultiPlatform(Boolean(onboardingProfile.playsMultiPlatform));
    setShowInGlobalRanking(Boolean(onboardingProfile.showInGlobalRanking));
    setShowInFriendsRanking(Boolean(onboardingProfile.showInFriendsRanking));
    setHasProfileChanges(false);
  }, [onboardingProfile]);

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

    // Open crop modal with image src
    const reader = new FileReader();
    reader.onload = (ev) => { setCropSrc(ev.target?.result as string); };
    reader.readAsDataURL(file);
  }, []);
  // Handle crop result: convert blob to File and show preview
  const handleCropApply = useCallback((blob: Blob) => {
    const croppedFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    setSelectedFile(croppedFile);
    setSelectedPresetAvatar(null);
    setCropSrc(null);
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
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

  const toggleProfileFormat = (format: string) => {
    setProfileFormats((prev) => {
      const next = prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format];
      setHasProfileChanges(true);
      return next;
    });
  };

  const resetAbiQuestionnaire = () => {
    setProfilePlayType("online");
    setProfileFormats(["tournament"]);
    setProfilePlatforms([]);
    setProfileBuyInRangesOnline([]);
    setProfileBuyInRangesLive([]);
    setProfileMultiPlatform(false);
    setHasProfileChanges(true);
    toast("Questionario ABI resetado", {
      description: "Agora voce pode preencher novamente e salvar.",
    });
  };

  const toggleProfilePlatform = (platformName: string) => {
    setProfilePlatforms((prev) => {
      const next = prev.includes(platformName)
        ? prev.filter((name) => name !== platformName)
        : [...prev, platformName];
      setHasProfileChanges(true);
      return next;
    });
  };

  const toggleProfileBuyIn = (rangeKey: string, playType: "online" | "live") => {
    const setter = playType === "online" ? setProfileBuyInRangesOnline : setProfileBuyInRangesLive;
    setter((prev) => {
      const next = prev.includes(rangeKey)
        ? prev.filter((value) => value !== rangeKey)
        : [...prev, rangeKey];
      setHasProfileChanges(true);
      return next;
    });
  };

  const handleSaveProfile = () => {
    saveProfileMutation.mutate({
      preferredPlayType: profilePlayType,
      preferredFormats: profileFormats,
      preferredPlatforms: profilePlatforms,
      preferredBuyIns: (profilePlayType === "online" ? profileBuyInRangesOnline : profileBuyInRangesLive)
        .map((rangeKey) => getRangeValueByType(rangeKey, profilePlayType))
        .filter((value) => value > 0),
      preferredBuyInsOnline: profileBuyInRangesOnline
        .map((rangeKey) => getRangeValueByType(rangeKey, "online"))
        .filter((value) => value > 0),
      preferredBuyInsLive: profileBuyInRangesLive
        .map((rangeKey) => getRangeValueByType(rangeKey, "live"))
        .filter((value) => value > 0),
      playsMultiPlatform: profileMultiPlatform,
      showInGlobalRanking,
      showInFriendsRanking,
    });
  };

  const profilePlatformOptions = (venues ?? []).filter((venue) => venue.type === profilePlayType);

  const sortedProfileFormatOptions = useMemo(() => {
    return [...POKER_FORMAT_OPTIONS].sort((a, b) => {
      const ai = profileFormats.indexOf(a.value);
      const bi = profileFormats.indexOf(b.value);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [profileFormats]);

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
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onApply={handleCropApply}
          onCancel={() => { setCropSrc(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
        />
      )}
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
            <div className="relative shrink-0">
              <Avatar className="h-28 w-28 border-2 border-primary/20 shadow-lg shadow-primary/10">
                <AvatarImage src={displayAvatar || undefined} className="object-cover" />
                <AvatarFallback className="text-2xl bg-primary/10">
                  {user?.name?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 shadow-md">
                <Camera className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>

            <div className="flex-1 w-full space-y-4">
              <div>
                <p className="font-medium">{user?.name || "Usuário"}</p>
                <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
              </div>

              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Anexar foto</TabsTrigger>
                  <TabsTrigger value="preset">Escolher avatar</TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="mt-4 space-y-4">
                  <div
                    className={`relative rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
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
                          ou clique para selecionar. Formato livre, máximo de 1MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedFile && (
                    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={handleCancelUpload}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleUploadAvatar} disabled={uploadAvatarMutation.isPending}>
                        <Save className="mr-2 h-4 w-4" />
                        {uploadAvatarMutation.isPending ? "Enviando..." : "Salvar foto"}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="preset" className="mt-4 space-y-5">
                  {ALTERNATIVE_AVATAR_GROUPS.map((group) => (
                    <div key={group.id} className="space-y-3">
                      <div>
                        <p className="font-medium text-sm">{group.title}</p>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                        {group.items.map((avatar) => {
                          const isActive = avatarUrl === avatar.src || selectedPresetAvatar === avatar.src;
                          return (
                            <button
                              key={avatar.src}
                              type="button"
                              onClick={() => handleSelectPresetAvatar(avatar.src)}
                              className="group flex flex-col items-center gap-2 text-center"
                              aria-label={`Selecionar avatar ${avatar.label}`}
                            >
                              <span
                                className={`flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full p-1 transition-all ${
                                  isActive
                                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                    : "hover:scale-[1.03]"
                                }`}
                              >
                                <img
                                  src={avatar.src}
                                  alt={avatar.label}
                                  className="h-16 w-16 rounded-full object-cover shadow-sm"
                                />
                              </span>
                              <span className="text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                                {avatar.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {selectedPresetAvatar && ALL_PRESET_AVATARS.includes(selectedPresetAvatar)
                        ? "Avatar alternativo selecionado pronto para aplicar."
                        : "Escolha um avatar alternativo para salvar no perfil."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApplyPresetAvatar}
                      disabled={!selectedPresetAvatar || updateAvatarMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Usar avatar
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Perfil de Jogo
          </CardTitle>
          <CardDescription>
            Edite as preferencias usadas para ordenar sessoes e mesas desde o inicio, mesmo sem historico.
          </CardDescription>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={resetAbiQuestionnaire}>
              Refazer Questionario ABI
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Voce joga mais online ou presencial?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={profilePlayType === "online" ? "default" : "outline"}
                onClick={() => {
                  setProfilePlayType("online");
                  setHasProfileChanges(true);
                }}
              >
                Online
              </Button>
              <Button
                type="button"
                variant={profilePlayType === "live" ? "default" : "outline"}
                onClick={() => {
                  setProfilePlayType("live");
                  setHasProfileChanges(true);
                }}
              >
                Presencial
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Plataformas/locais mais usados</Label>
            <div className="flex flex-wrap gap-2">
              {profilePlatformOptions.map((venue) => (
                <Button
                  key={venue.id}
                  type="button"
                  size="sm"
                  className="gap-2"
                  variant={profilePlatforms.includes(venue.name) ? "default" : "outline"}
                  onClick={() => toggleProfilePlatform(venue.name)}
                >
                  {venue.logoUrl ? (
                    <img src={venue.logoUrl} alt={venue.name} className="h-4 w-4 object-contain" />
                  ) : null}
                  {venue.name}
                </Button>
              ))}
            </div>
            {profilePlatformOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">Cadastre plataformas na area de Venues para selecionar aqui.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Formatos principais</Label>
            <div className="flex flex-wrap gap-2">
              {sortedProfileFormatOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={profileFormats.includes(option.value) ? "default" : "outline"}
                  onClick={() => toggleProfileFormat(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ficha ABI Online</Label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_BUY_IN_RANGES.map((range) => (
                <Tooltip key={range.key}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={profileBuyInRangesOnline.includes(range.key) ? "default" : "outline"}
                      onClick={() => toggleProfileBuyIn(range.key, "online")}
                    >
                      {getRangeLabelByType(range.key, "online")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{getOnlineRangeApproxLabel(range.key)}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ficha ABI Live</Label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_BUY_IN_RANGES.map((range) => (
                <Button
                  key={`live-${range.key}`}
                  type="button"
                  size="sm"
                  variant={profileBuyInRangesLive.includes(range.key) ? "default" : "outline"}
                  onClick={() => toggleProfileBuyIn(range.key, "live")}
                >
                  {getRangeLabelByType(range.key, "live")}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Joga em mais de uma plataforma na mesma sessao?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={profileMultiPlatform ? "default" : "outline"}
                onClick={() => {
                  setProfileMultiPlatform(true);
                  setHasProfileChanges(true);
                }}
              >
                Sim
              </Button>
              <Button
                type="button"
                variant={!profileMultiPlatform ? "default" : "outline"}
                onClick={() => {
                  setProfileMultiPlatform(false);
                  setHasProfileChanges(true);
                }}
              >
                Nao
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Consentimento de Ranking
            </Label>
            <p className="text-xs text-muted-foreground">
              Ranking e opcional. Voce escolhe onde deseja aparecer: global, amigos, ambos ou nenhum.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant={showInGlobalRanking ? "default" : "outline"}
                onClick={() => {
                  setShowInGlobalRanking((prev) => !prev);
                  setHasProfileChanges(true);
                }}
              >
                Ranking Global {showInGlobalRanking ? "Ativo" : "Desativado"}
              </Button>
              <Button
                type="button"
                variant={showInFriendsRanking ? "default" : "outline"}
                onClick={() => {
                  setShowInFriendsRanking((prev) => !prev);
                  setHasProfileChanges(true);
                }}
              >
                Ranking de Amigos {showInFriendsRanking ? "Ativo" : "Desativado"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveProfile}
              disabled={!hasProfileChanges || saveProfileMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveProfileMutation.isPending ? "Salvando..." : "Salvar Perfil de Jogo"}
            </Button>
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
