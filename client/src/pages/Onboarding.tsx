import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PUBLIC_LANDING_URL } from "@/const";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Upload, ShieldCheck, KeyRound } from "lucide-react";

const PRESET_AVATAR_OPTIONS = [
  { src: "/avatars/alt/ace-spade-dark.png", label: "As Noturno" },
  { src: "/avatars/alt/king-spade-dark.png", label: "Rei Noturno" },
  { src: "/avatars/alt/queen-spade-dark.png", label: "Dama Noturna" },
  { src: "/avatars/alt/jack-spade-dark.png", label: "Valete Noturno" },
  { src: "/avatars/alt/wolf-hood-dark.png", label: "Lobo" },
  { src: "/avatars/alt/lion-hood-ember.png", label: "Leao" },
  { src: "/avatars/alt/eagle-hood-green.png", label: "Aguia" },
  { src: "/avatars/alt/shadow-cap-green.png", label: "Sombra" },
  { src: "/avatars/alt/faceless-hood-dark.png", label: "Sem Rosto" },
  { src: "/avatars/alt/shade-hood-blue.png", label: "Oculos" },
  { src: "/avatars/alt/ace-queen-pink.png", label: "As Rosa" },
  { src: "/avatars/alt/king-queen-gold.png", label: "Rei Dourado" },
  { src: "/avatars/alt/queen-queen-violet.png", label: "Dama Violeta" },
  { src: "/avatars/alt/jack-queen-mint.png", label: "Valete Menta" },
] as const;

const FORMAT_OPTIONS = [
  { value: "tournament", label: "Torneio" },
  { value: "cash_game", label: "Cash Game" },
  { value: "sit_and_go", label: "Sit & Go" },
  { value: "spin_and_go", label: "Spin & Go" },
  { value: "turbo", label: "Turbo" },
  { value: "hyper_turbo", label: "Hyper Turbo" },
  { value: "bounty", label: "Bounty" },
  { value: "satellite", label: "Satelite" },
  { value: "heads_up", label: "Heads-up" },
] as const;

const ONLINE_TO_BRL_RATE = 5.75;
const BUY_IN_RANGES = [
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

const BR_UF_TO_STATE_NAME: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapa",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceara",
  DF: "Distrito Federal",
  ES: "Espirito Santo",
  GO: "Goias",
  MA: "Maranhao",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Para",
  PB: "Paraiba",
  PR: "Parana",
  PE: "Pernambuco",
  PI: "Piaui",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondonia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "Sao Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const CPF_OPTIONAL_EMAILS = new Set(["gu.antunez@gmail.com"]);

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatUsdCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: valueCents < 100 ? 2 : 0,
  }).format(valueCents / 100);
}

function formatBrlCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function getRangeValueByType(rangeKey: string, playType: "online" | "live"): number {
  const range = BUY_IN_RANGES.find((item) => item.key === rangeKey);
  if (!range) return 0;
  if (playType === "online") return range.valueUsdCents;
  return Math.round(range.valueUsdCents * ONLINE_TO_BRL_RATE);
}

function getRangeLabelByType(rangeKey: string, playType: "online" | "live"): string {
  const range = BUY_IN_RANGES.find((item) => item.key === rangeKey);
  if (!range) return "";
  if (playType === "online") {
    return `${formatUsdCents(range.minUsdCents)} - ${formatUsdCents(range.maxUsdCents)}`;
  }
  const brlMin = Math.round(range.minUsdCents * ONLINE_TO_BRL_RATE);
  const brlMax = Math.round(range.maxUsdCents * ONLINE_TO_BRL_RATE);
  return `${formatBrlCents(brlMin)} - ${formatBrlCents(brlMax)}`;
}

function mapBuyInsToRangeKeys(values: number[], playType: "online" | "live"): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    let closest: { key: string; distance: number } | null = null;
    for (const range of BUY_IN_RANGES) {
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Onboarding() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");
    if (!raw) return "/";
    try {
      const decoded = decodeURIComponent(raw);
      return decoded.startsWith("/") ? decoded : "/";
    } catch {
      return "/";
    }
  }, []);

  const { data: onboardingProfile } = trpc.sessions.getOnboardingProfile.useQuery(undefined, {
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: countries = [] } = trpc.localities.countries.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: venues = [] } = trpc.venues.list.useQuery({}, { enabled: !!user });

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [selectedPresetAvatar, setSelectedPresetAvatar] = useState<string>("");
  const [playType, setPlayType] = useState<"online" | "live">("online");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [buyInRangesOnline, setBuyInRangesOnline] = useState<string[]>([]);
  const [buyInRangesLive, setBuyInRangesLive] = useState<string[]>([]);
  const [playsMultiPlatform, setPlaysMultiPlatform] = useState(false);
  const [showInGlobalRanking, setShowInGlobalRanking] = useState(false);
  const [showInFriendsRanking, setShowInFriendsRanking] = useState(false);
  const [rankingConsentChosen, setRankingConsentChosen] = useState(false);
  const [countryCode, setCountryCode] = useState("BR");
  const [country, setCountry] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [taxDocument, setTaxDocument] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [postalLookupBusy, setPostalLookupBusy] = useState(false);
  const [lastPostalLookup, setLastPostalLookup] = useState("");
  const [postalAutoApplied, setPostalAutoApplied] = useState(false);
  const initialGoogleAvatarRef = useRef<string>("");

  const uploadAvatarMutation = trpc.profile.uploadAvatar.useMutation();
  const updateAvatarMutation = trpc.profile.updateAvatar.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = PUBLIC_LANDING_URL;
    },
    onError: () => {
      window.location.href = PUBLIC_LANDING_URL;
    },
  });
  const saveProfileMutation = trpc.sessions.saveOnboardingProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.sessions.getOnboardingProfile.invalidate(),
        utils.sessions.getUserPreferences.invalidate(),
      ]);
      toast.success("Cadastro concluido! Redirecionando...");
      window.location.href = nextPath || "/";
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao salvar cadastro.");
    },
  });
  const setupPasswordMutation = trpc.auth.setupPassword.useMutation({
    onSuccess: async () => {
      setNewPassword("");
      setConfirmNewPassword("");
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
      await utils.auth.me.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao definir a senha.");
    },
  });

  useEffect(() => {
    if (loading) return;
    if (!user) setLocation("/login");
  }, [loading, user, setLocation]);

  useEffect(() => {
    if (!user || onboardingProfile === undefined || countries.length === 0) return;
    const preferredType = onboardingProfile.preferredPlayType;
    if (preferredType === "online" || preferredType === "live") {
      setPlayType(preferredType);
    }
    setPlatforms(onboardingProfile.preferredPlatforms ?? []);
    setFormats(onboardingProfile.preferredFormats ?? []);
    setBuyInRangesOnline(mapBuyInsToRangeKeys(onboardingProfile.preferredBuyInsOnline ?? [], "online"));
    setBuyInRangesLive(mapBuyInsToRangeKeys(onboardingProfile.preferredBuyInsLive ?? [], "live"));
    setPlaysMultiPlatform(Boolean(onboardingProfile.playsMultiPlatform));
    setShowInGlobalRanking(Boolean(onboardingProfile.showInGlobalRanking));
    setShowInFriendsRanking(Boolean(onboardingProfile.showInFriendsRanking));
    setRankingConsentChosen(Boolean(onboardingProfile.rankingConsentAnsweredAt) || Boolean(onboardingProfile.showInGlobalRanking) || Boolean(onboardingProfile.showInFriendsRanking));
    const persistedCountry = String(onboardingProfile.country ?? "").trim();
    if (persistedCountry) {
      const matched = countries.find((item) => item.name.toLowerCase() === persistedCountry.toLowerCase());
      if (matched) {
        setCountryCode(matched.code);
        setCountry(matched.name);
      } else {
        setCountry(persistedCountry);
      }
    } else {
      const fallback = countries.find((item) => item.code === "BR");
      setCountryCode("BR");
      setCountry(fallback?.name ?? "Brasil");
    }
    setStateRegion(String(onboardingProfile.stateRegion ?? ""));
    setCity(String(onboardingProfile.city ?? ""));
    setAddressLine(String(onboardingProfile.addressLine ?? ""));
    setPostalCode(String(onboardingProfile.postalCode ?? ""));
    setTaxDocument(String(onboardingProfile.taxDocument ?? ""));
  }, [user, onboardingProfile, countries, nextPath, setLocation]);

  const platformOptions = useMemo(() => {
    return venues.filter((venue) => venue.type === playType);
  }, [venues, playType]);

  const googleAvatarUrl = useMemo(() => {
    if (initialGoogleAvatarRef.current) return initialGoogleAvatarRef.current;
    const avatar = String((user as any)?.avatarUrl ?? "").trim();
    const loginMethod = String((user as any)?.loginMethod ?? "").toLowerCase();
    if (loginMethod !== "google") return "";
    if (!/^https?:\/\//i.test(avatar)) return "";
    return avatar;
  }, [user]);

  useEffect(() => {
    const avatar = String((user as any)?.avatarUrl ?? "").trim();
    const loginMethod = String((user as any)?.loginMethod ?? "").toLowerCase();
    if (!initialGoogleAvatarRef.current && loginMethod === "google" && /^https?:\/\//i.test(avatar)) {
      initialGoogleAvatarRef.current = avatar;
    }
  }, [user]);

  const { data: stateOptions = [] } = trpc.localities.states.useQuery(
    { countryCode },
    {
      enabled: !!user && countryCode.length === 2,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const { data: citySuggestions = [] } = trpc.localities.cities.useQuery(
    {
      countryCode,
      stateName: stateRegion,
      search: city,
    },
    {
      enabled: !!user && countryCode.length === 2 && stateRegion.trim().length > 0,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const toggleValue = (value: string, list: string[], setter: (next: string[]) => void) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
      return;
    }
    setter([...list, value]);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem valida.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("A imagem deve ter no maximo 10MB.");
      return;
    }

    setAvatarBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const payloadBase64 = dataUrl.split(",")[1] || "";
      await uploadAvatarMutation.mutateAsync({
        base64: payloadBase64,
        mimeType: file.type,
        fileName: file.name,
      });
      await utils.auth.me.invalidate();
      setSelectedPresetAvatar("");
      toast.success("Foto de perfil salva.");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao enviar foto.");
    } finally {
      setAvatarBusy(false);
      event.target.value = "";
    }
  };

  const handleApplyPresetAvatar = async () => {
    if (!selectedPresetAvatar) {
      toast.error("Selecione um mascote antes de aplicar.");
      return;
    }
    setAvatarBusy(true);
    try {
      await updateAvatarMutation.mutateAsync({ avatarUrl: selectedPresetAvatar });
      await utils.auth.me.invalidate();
      toast.success("Mascote aplicado como foto de perfil.");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao aplicar mascote.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleApplyGoogleAvatar = async () => {
    if (!googleAvatarUrl) {
      toast.error("Foto do Gmail indisponivel para esta conta.");
      return;
    }
    setAvatarBusy(true);
    try {
      await updateAvatarMutation.mutateAsync({ avatarUrl: googleAvatarUrl });
      await utils.auth.me.invalidate();
      setSelectedPresetAvatar("");
      toast.success("Foto do Gmail aplicada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao aplicar foto do Gmail.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSubmit = async () => {
    const avatarSet = String((user as any)?.avatarUrl ?? "").trim().length > 0;
    const normalizedUserEmail = String((user as any)?.email ?? "").trim().toLowerCase();
    const canSkipTaxDocumentRequirement = CPF_OPTIONAL_EMAILS.has(normalizedUserEmail);
    if (!avatarSet) {
      toast.error("Adicione sua foto de perfil antes de continuar.");
      return;
    }
    if (!country.trim() || !stateRegion.trim() || !city.trim() || (!canSkipTaxDocumentRequirement && !taxDocument.trim())) {
      toast.error("Preencha todos os dados de cadastro para continuar.");
      return;
    }
    if (platforms.length === 0 || formats.length === 0 || buyInRangesOnline.length === 0 || buyInRangesLive.length === 0) {
      toast.error("Complete plataformas, formatos e ABI (online e live).");
      return;
    }
    if (!rankingConsentChosen) {
      toast.error("Escolha uma opcao de consentimento de ranking (inclusive Nao aceito).");
      return;
    }

    if (requiresPasswordSetup) {
      if (newPassword !== confirmNewPassword) {
        toast.error("As senhas nao conferem.");
        return;
      }
      if (newPassword.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      const email = String((user as any)?.email ?? "").trim();
      if (!email) {
        toast.error("Nao encontramos um e-mail valido para esta conta.");
        return;
      }

      try {
        await setupPasswordMutation.mutateAsync({
          email,
          password: newPassword,
          taxDocument: taxDocument.trim() || undefined,
        });
      } catch {
        return;
      }
    }

    saveProfileMutation.mutate({
      preferredPlayType: playType,
      preferredPlatforms: platforms,
      preferredFormats: formats,
      preferredBuyIns: (playType === "online" ? buyInRangesOnline : buyInRangesLive)
        .map((rangeKey) => getRangeValueByType(rangeKey, playType))
        .filter((value) => value > 0),
      preferredBuyInsOnline: buyInRangesOnline
        .map((rangeKey) => getRangeValueByType(rangeKey, "online"))
        .filter((value) => value > 0),
      preferredBuyInsLive: buyInRangesLive
        .map((rangeKey) => getRangeValueByType(rangeKey, "live"))
        .filter((value) => value > 0),
      playsMultiPlatform,
      showInGlobalRanking,
      showInFriendsRanking,
      country: country.trim(),
      stateRegion: stateRegion.trim(),
      city: city.trim(),
      addressLine: addressLine.trim(),
      postalCode: postalCode.trim(),
      taxDocument: taxDocument.trim(),
    });
  };

  const handlePostalCodeLookup = async (force = false) => {
    const cep = postalCode.replace(/\D/g, "");
    if (cep.length !== 8) return;
    if (!force && lastPostalLookup === cep) return;

    // If user typed a Brazilian CEP, assume Brazil automatically.
    if (countryCode !== "BR") {
      setCountryCode("BR");
      const brazil = countries.find((item) => item.code === "BR");
      setCountry(brazil?.name ?? "Brasil");
    }

    setPostalLookupBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) {
        toast.error("Nao foi possivel consultar o CEP agora.");
        return;
      }
      const data = await response.json();
      if (data?.erro) {
        toast.error("CEP nao encontrado.");
        return;
      }

      if (typeof data.uf === "string") {
        const uf = String(data.uf).trim().toUpperCase();
        const mappedStateName = BR_UF_TO_STATE_NAME[uf] ?? "";
        const matchedStateByCode = stateOptions.find((item) => String(item.code ?? "").toUpperCase() === uf);
        const matchedStateByName = mappedStateName
          ? stateOptions.find((item) => normalizeForMatch(item.name) === normalizeForMatch(mappedStateName))
          : undefined;

        const nextState = matchedStateByCode?.name ?? matchedStateByName?.name ?? mappedStateName;
        if (nextState) {
          setStateRegion(nextState);
        }
      }
      if (typeof data.localidade === "string" && data.localidade.trim()) {
        setCity(data.localidade.trim());
      }
      if (typeof data.logradouro === "string" && data.logradouro.trim()) {
        setAddressLine(data.logradouro.trim());
      }
      setLastPostalLookup(cep);
      setPostalAutoApplied(true);
      toast.success("Endereco preenchido automaticamente pelo CEP.");
    } catch {
      toast.error("Falha ao buscar CEP. Verifique sua conexao e tente novamente.");
    } finally {
      setPostalLookupBusy(false);
    }
  };

  useEffect(() => {
    const cep = postalCode.replace(/\D/g, "");
    if (cep.length !== 8) return;
    const timer = window.setTimeout(() => {
      handlePostalCodeLookup();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [postalCode, countryCode]);

  useEffect(() => {
    const cep = postalCode.replace(/\D/g, "");
    if (cep.length !== 8) {
      setLastPostalLookup("");
      setPostalAutoApplied(false);
    }
  }, [postalCode]);

  if (loading || !user || onboardingProfile === undefined) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#070b16] text-white">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando cadastro inicial...
        </div>
      </div>
    );
  }

  const avatarSet = String((user as any)?.avatarUrl ?? "").trim().length > 0;
  const normalizedUserEmail = String((user as any)?.email ?? "").trim().toLowerCase();
  const canSkipTaxDocumentRequirement = CPF_OPTIONAL_EMAILS.has(normalizedUserEmail);
  const missingCountry = !country.trim();
  const missingStateRegion = !stateRegion.trim();
  const missingCity = !city.trim();
  const missingTaxDocument = !canSkipTaxDocumentRequirement && !taxDocument.trim();
  const missingPlatforms = platforms.length === 0;
  const missingFormats = formats.length === 0;
  const missingAbiOnline = buyInRangesOnline.length === 0;
  const missingAbiLive = buyInRangesLive.length === 0;
  const requiresPasswordSetup = !String((user as any)?.passwordHash ?? "").trim();

  const requiredFieldClass = (missing: boolean) =>
    `${missing ? "border-red-500/80 ring-1 ring-red-500/40" : "border-white/20"} bg-black/20 text-white`;

  const requiredGroupClass = (missing: boolean) =>
    `${missing ? "rounded-lg border border-red-500/70 bg-red-500/5 p-2" : ""}`;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.15),_transparent_34%),linear-gradient(180deg,#020617_0%,#0b1220_100%)] p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Card className={`bg-[#0b1222]/95 text-white ${!avatarSet ? "border-red-500/70" : "border-white/10"}`}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheck className="h-6 w-6 text-cyan-300" />
                Complete seu cadastro para continuar
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? "Saindo..." : "Sair para login"}
              </Button>
            </div>
            <CardDescription className="text-zinc-300">
              Todos os jogadores ja cadastrados serao enviados para esta pagina ao entrar no aplicativo. Seus dados antigos ja estao carregados para facilitar a revisao e voce pode alterar qualquer campo antes de salvar. Aqui voce confirma novamente os dados cadastrais e, quando solicitado, define ou redefine sua senha. Depois de salvar, voce segue para o site normalmente, sem looping.
            </CardDescription>
          </CardHeader>
        </Card>

        {requiresPasswordSetup && (
          <Card className="border-cyan-300/30 bg-[#0b1222]/95 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <KeyRound className="h-6 w-6 text-cyan-300" />
                Defina sua senha
              </CardTitle>
              <CardDescription className="text-zinc-300">
                Esta conta ainda nao tem senha. Crie agora para poder entrar com e-mail ou CPF depois, sem depender somente do Gmail. Se a sua validacao anual expirar, volte aqui para atualizar e confirmar novamente seus dados.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nova senha</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Digite sua nova senha"
                    className="border-white/20 bg-black/20 text-white pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300"
                    aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <div className="relative">
                  <Input
                    type={showConfirmNewPassword ? "text" : "password"}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="border-white/20 bg-black/20 text-white pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300"
                    aria-label={showConfirmNewPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <PasswordStrengthMeter password={newPassword} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-white/10 bg-[#0b1222]/95 text-white">
          <CardHeader>
            <CardTitle>Foto de perfil</CardTitle>
            <CardDescription className="text-zinc-300">Envie uma foto ou escolha um mascote predefinido para concluir seu perfil.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-white/20 bg-black/30">
                {String((user as any)?.avatarUrl || "").trim() ? (
                  <img src={(user as any).avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-zinc-400">Sem foto</div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
                <Upload className="h-4 w-4" />
                {avatarBusy || uploadAvatarMutation.isPending ? "Enviando..." : "Enviar foto"}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={avatarBusy || uploadAvatarMutation.isPending || updateAvatarMutation.isPending} />
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-sm text-zinc-300">Ou escolha um mascote:</p>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                {PRESET_AVATAR_OPTIONS.map((avatar) => {
                  const isActive = selectedPresetAvatar === avatar.src || String((user as any)?.avatarUrl || "") === avatar.src;
                  return (
                    <button
                      key={avatar.src}
                      type="button"
                      onClick={() => setSelectedPresetAvatar(avatar.src)}
                      className={`rounded-full p-1 transition ${isActive ? "ring-2 ring-cyan-300" : "hover:scale-105"}`}
                      aria-label={`Selecionar mascote ${avatar.label}`}
                    >
                      <img src={avatar.src} alt={avatar.label} className="h-14 w-14 rounded-full object-cover" />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <div className="flex flex-wrap justify-end gap-2">
                  {googleAvatarUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleApplyGoogleAvatar}
                      disabled={avatarBusy || updateAvatarMutation.isPending || uploadAvatarMutation.isPending}
                    >
                      {avatarBusy || updateAvatarMutation.isPending ? "Aplicando..." : "Voltar para foto do Gmail"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleApplyPresetAvatar}
                    disabled={!selectedPresetAvatar || avatarBusy || updateAvatarMutation.isPending || uploadAvatarMutation.isPending}
                  >
                    {avatarBusy || updateAvatarMutation.isPending ? "Aplicando..." : "Usar mascote selecionado"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#0b1222]/95 text-white">
          <CardHeader>
            <CardTitle>Perfil completo</CardTitle>
            <CardDescription className="text-zinc-300">Preencha os campos obrigatorios. Endereco e CEP sao opcionais.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pais</Label>
              <select
                value={countryCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setCountryCode(code);
                  const selected = countries.find((item) => item.code === code);
                  setCountry(selected?.name ?? "");
                  setStateRegion("");
                  setCity("");
                }}
                className={`h-10 w-full rounded-md border px-3 ${requiredFieldClass(missingCountry)}`}
              >
                {countries.map((option) => (
                  <option key={option.code} value={option.code} className="bg-[#0b1222] text-white">
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Estado/Regiao</Label>
              <select
                value={stateRegion}
                onChange={(e) => {
                  setStateRegion(e.target.value);
                  setCity("");
                }}
                className={`h-10 w-full rounded-md border px-3 ${requiredFieldClass(missingStateRegion)}`}
              >
                <option value="" className="bg-[#0b1222] text-white">Selecione</option>
                {stateOptions.map((option) => (
                  <option key={`${option.code || option.name}-${option.name}`} value={option.name} className="bg-[#0b1222] text-white">
                    {option.name}
                  </option>
                ))}
              </select>
              {stateOptions.length === 0 && (
                <p className="text-xs text-zinc-400">Este pais nao possui subdivisoes cadastradas na base.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className={requiredFieldClass(missingCity)} list="onboarding-city-suggestions" />
              {citySuggestions.length > 0 && (
                <datalist id="onboarding-city-suggestions">
                  {citySuggestions.map((cityName) => (
                    <option key={cityName} value={cityName} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input
                value={postalCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setPostalCode(next);
                  setPostalAutoApplied(false);
                  if (next.replace(/\D/g, "").length !== 8) {
                    setLastPostalLookup("");
                  }
                }}
                onBlur={() => handlePostalCodeLookup(true)}
                className={`${postalAutoApplied ? "border-cyan-300 ring-1 ring-cyan-400/60" : "border-white/20"} bg-black/20 text-white`}
                placeholder="00000-000"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => handlePostalCodeLookup(true)} disabled={postalLookupBusy}>
                {postalLookupBusy ? "Consultando CEP..." : "Buscar CEP"}
              </Button>
              <p className="text-xs text-zinc-400">
                {postalLookupBusy
                  ? "Buscando endereco pelo CEP..."
                  : postalAutoApplied
                    ? "CEP aplicado automaticamente. Brasil, estado e cidade foram atualizados."
                    : "Ao preencher um CEP valido, assumimos Brasil e tentamos preencher estado, cidade e endereco automaticamente."}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereco</Label>
              <Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="border-white/20 bg-black/20 text-white" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                CPF / Documento fiscal {canSkipTaxDocumentRequirement ? "(opcional)" : "(obrigatorio)"}
              </Label>
              <Input value={taxDocument} onChange={(e) => setTaxDocument(e.target.value)} className={requiredFieldClass(missingTaxDocument)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#0b1222]/95 text-white">
          <CardHeader>
            <CardTitle>Preferencias e ABI</CardTitle>
            <CardDescription className="text-zinc-300">Defina seu estilo para liberar acesso ao sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Voce joga mais online ou presencial?</Label>
              <div className="flex gap-2">
                <Button type="button" variant={playType === "online" ? "default" : "outline"} onClick={() => setPlayType("online")}>Online</Button>
                <Button type="button" variant={playType === "live" ? "default" : "outline"} onClick={() => setPlayType("live")}>Presencial</Button>
              </div>
            </div>

            <div className={`space-y-2 ${requiredGroupClass(missingPlatforms)}`}>
              <Label>Plataformas/locais</Label>
              <div className="flex flex-wrap gap-2">
                {platformOptions.map((venue) => (
                  <Button
                    key={venue.id}
                    type="button"
                    size="sm"
                    variant={platforms.includes(venue.name) ? "default" : "outline"}
                    onClick={() => toggleValue(venue.name, platforms, setPlatforms)}
                    className={!platforms.includes(venue.name) && missingPlatforms ? "border-red-500/70 text-red-200 hover:bg-red-500/10" : undefined}
                  >
                    {venue.name}
                  </Button>
                ))}
              </div>
              {platformOptions.length === 0 && (
                <p className="text-xs text-zinc-400">Cadastre venues em Configuracoes para selecionar aqui.</p>
              )}
            </div>

            <div className={`space-y-2 ${requiredGroupClass(missingFormats)}`}>
              <Label>Formatos principais</Label>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={formats.includes(option.value) ? "default" : "outline"}
                    onClick={() => toggleValue(option.value, formats, setFormats)}
                    className={!formats.includes(option.value) && missingFormats ? "border-red-500/70 text-red-200 hover:bg-red-500/10" : undefined}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className={`space-y-2 ${requiredGroupClass(missingAbiOnline)}`}>
              <Label>ABI Online (obrigatorio)</Label>
              <div className="flex flex-wrap gap-2">
                {BUY_IN_RANGES.map((range) => (
                  <Button
                    key={`online-${range.key}`}
                    type="button"
                    size="sm"
                    variant={buyInRangesOnline.includes(range.key) ? "default" : "outline"}
                    onClick={() => toggleValue(range.key, buyInRangesOnline, setBuyInRangesOnline)}
                    className={!buyInRangesOnline.includes(range.key) && missingAbiOnline ? "border-red-500/70 text-red-200 hover:bg-red-500/10" : undefined}
                  >
                    {getRangeLabelByType(range.key, "online")}
                  </Button>
                ))}
              </div>
            </div>

            <div className={`space-y-2 ${requiredGroupClass(missingAbiLive)}`}>
              <Label>ABI Live (obrigatorio)</Label>
              <div className="flex flex-wrap gap-2">
                {BUY_IN_RANGES.map((range) => (
                  <Button
                    key={`live-${range.key}`}
                    type="button"
                    size="sm"
                    variant={buyInRangesLive.includes(range.key) ? "default" : "outline"}
                    onClick={() => toggleValue(range.key, buyInRangesLive, setBuyInRangesLive)}
                    className={!buyInRangesLive.includes(range.key) && missingAbiLive ? "border-red-500/70 text-red-200 hover:bg-red-500/10" : undefined}
                  >
                    {getRangeLabelByType(range.key, "live")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Joga em mais de uma plataforma na mesma sessao?</Label>
              <div className="flex gap-2">
                <Button type="button" variant={playsMultiPlatform ? "default" : "outline"} onClick={() => setPlaysMultiPlatform(true)}>Sim</Button>
                <Button type="button" variant={!playsMultiPlatform ? "default" : "outline"} onClick={() => setPlaysMultiPlatform(false)}>Nao</Button>
              </div>
            </div>

            <div className={`space-y-2 ${requiredGroupClass(!rankingConsentChosen)}`}>
              <Label>Consentimento de ranking</Label>
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                <p className="font-semibold">Seu ranking com privacidade protegida</p>
                <p className="mt-1 text-cyan-100/90">
                  Ao ativar o ranking, voce aparece apenas com indicadores simples de resultado.
                  Nenhum dado sensivel e exibido.
                </p>
                <p className="mt-2 text-cyan-100/90">
                  Exibimos somente: nickname, avatar, lucro/prejuizo total, ROI, win rate,
                  melhor/pior sessao, trofeus e posicao no ranking.
                </p>
                <p className="mt-2 text-cyan-100/90">
                  Nao exibimos maos jogadas, historico detalhado, decisoes de jogo, reads, estrategia,
                  notas privadas ou qualquer informacao que prejudique seu processo no poker.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={showInGlobalRanking ? "default" : "outline"}
                  onClick={() => {
                    setShowInGlobalRanking(true);
                    setShowInFriendsRanking(true);
                    setRankingConsentChosen(true);
                  }}
                >
                  Aceito aparecer no ranking global
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!showInGlobalRanking && showInFriendsRanking ? "default" : "outline"}
                  onClick={() => {
                    setShowInGlobalRanking(false);
                    setShowInFriendsRanking(true);
                    setRankingConsentChosen(true);
                  }}
                >
                  Aceito aparecer somente para amigos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!showInGlobalRanking && !showInFriendsRanking && rankingConsentChosen ? "default" : "outline"}
                  onClick={() => {
                    setShowInGlobalRanking(false);
                    setShowInFriendsRanking(false);
                    setRankingConsentChosen(true);
                  }}
                >
                  Nao aceito aparecer no ranking
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {showInGlobalRanking && <Badge variant="secondary">Global ativo</Badge>}
                {showInFriendsRanking && <Badge variant="secondary">Amigos ativo</Badge>}
                {!showInGlobalRanking && !showInFriendsRanking && rankingConsentChosen && <Badge variant="outline">Sem ranking</Badge>}
                {!rankingConsentChosen && <Badge variant="destructive">Escolha obrigatoria</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            onClick={handleSubmit}
            disabled={
              saveProfileMutation.isPending
              || setupPasswordMutation.isPending
              || avatarBusy
              || uploadAvatarMutation.isPending
            }
          >
            {(saveProfileMutation.isPending || setupPasswordMutation.isPending) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {setupPasswordMutation.isPending ? "Definindo senha..." : "Salvando cadastro..."}
              </>
            ) : (
              requiresPasswordSetup ? "Definir senha e concluir cadastro" : "Concluir cadastro e entrar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
