import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { Eye, EyeOff, Loader2, Mail, Lock, User, KeyRound } from "lucide-react";
import { toast } from "sonner";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.6 12 2.6 6.9 2.6 2.8 6.7 2.8 11.8S6.9 21 12 21c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.3l3.2 2.4c.9-1.8 2.8-3 4.9-3 1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.6 12 2.6c-3.7 0-6.9 2.1-8.5 5.2z"
      />
      <path
        fill="#FBBC05"
        d="M12 21c2.5 0 4.6-.8 6.1-2.3l-2.8-2.3c-.7.5-1.7.9-3.3.9-2.5 0-4.5-1.7-5.3-3.9l-3.2 2.5C5.1 18.9 8.2 21 12 21z"
      />
      <path
        fill="#4285F4"
        d="M21.1 13.7c0-.6-.1-1-.1-1.5H12v3.9h5.5c-.3 1.4-1.1 2.5-2.2 3.2l2.8 2.3c1.6-1.5 3-4 3-7.9z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M17.05 12.54c.03 3.16 2.77 4.21 2.8 4.22-.02.08-.43 1.5-1.42 2.97-.86 1.27-1.75 2.54-3.16 2.57-1.39.03-1.84-.82-3.43-.82-1.59 0-2.09.79-3.41.85-1.36.05-2.4-1.36-3.27-2.62-1.77-2.56-3.12-7.23-1.31-10.38.9-1.56 2.5-2.55 4.24-2.58 1.33-.03 2.58.89 3.4.89.81 0 2.35-1.1 3.97-.94.68.03 2.58.28 3.8 2.06-.1.06-2.26 1.32-2.23 3.78z" />
      <path d="M14.97 3.78c.72-.87 1.21-2.08 1.08-3.28-1.03.04-2.27.69-3.01 1.56-.67.77-1.25 1.99-1.09 3.16 1.15.09 2.3-.58 3.02-1.44z" />
    </svg>
  );
}

export default function Login() {
  const [mode, setMode] = useState<"login" | "register" | "setup_password" | "verify_email">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [country, setCountry] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [taxDocument, setTaxDocument] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Conta antiga sem senha — redirecionar para fluxo de primeiro acesso
      if (data.needsPasswordSetup) {
        setMode("setup_password");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        toast.info("Conta encontrada! Crie uma senha para acessar seu histórico.");
        return;
      }
      utils.auth.me.setData(undefined, data.user);
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "E-mail ou senha incorretos.");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      toast.success("Conta criada! Bem-vindo ao All in Edge.");
      utils.auth.me.setData(undefined, data.user);
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao criar conta.");
    },
  });

  const setupPasswordMutation = trpc.auth.setupPassword.useMutation({
    onSuccess: (data) => {
      toast.success("Senha criada! Bem-vindo de volta — seu histórico está intacto.");
      utils.auth.me.setData(undefined, data.user);
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao configurar senha.");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ identifier: email, password });
    } else if (mode === "register") {
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem.");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      registerMutation.mutate({
        name,
        email,
        password,
        country,
        stateRegion,
        city,
        addressLine,
        postalCode,
        taxDocument,
      });
    } else if (mode === "setup_password") {
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem.");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      setupPasswordMutation.mutate({ email, password, taxDocument });
    } else if (mode === "verify_email") {
      const code = verificationCode.replace(/\D/g, "");
      if (code.length !== 6) {
        toast.error("Informe o codigo de 6 digitos.");
        return;
      }

      setVerificationBusy(true);
      try {
        const response = await fetch("/api/oauth/google/verify-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(data?.message || "Nao foi possivel validar o codigo.");
          return;
        }

        utils.auth.me.invalidate();
        window.location.href = "/";
      } catch {
        toast.error("Falha de rede ao validar o codigo.");
      } finally {
        setVerificationBusy(false);
      }
    }
  };

  const switchMode = (newMode: "login" | "register" | "setup_password" | "verify_email") => {
    setMode(newMode);
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const isLoading =
    loginMutation.isPending ||
    registerMutation.isPending ||
    setupPasswordMutation.isPending ||
    verificationBusy;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauthError");
    if (!oauthError) return;

    toast.error(decodeURIComponent(oauthError));
    params.delete("oauthError");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyEmail = params.get("verifyEmail");
    const pendingEmail = params.get("email");
    if (verifyEmail !== "1") return;

    setMode("verify_email");
    if (pendingEmail) {
      setEmail(decodeURIComponent(pendingEmail));
    }
  }, []);

  const resendVerificationCode = async () => {
    setVerificationBusy(true);
    try {
      const response = await fetch("/api/oauth/google/resend-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.message || "Nao foi possivel reenviar o codigo.");
        return;
      }
      toast.success("Novo codigo enviado para seu e-mail.");
    } catch {
      toast.error("Falha de rede ao reenviar codigo.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleSocialLogin = (provider: "Google" | "Apple") => {
    if (provider === "Google") {
      window.location.href = "/api/oauth/google";
      return;
    }

    toast.info("Login com Apple em breve.");
  };

  const needsPasswordConfirmation = mode === "register" || mode === "setup_password";
  const passwordMismatch = needsPasswordConfirmation && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover"
      style={{
        backgroundImage: "radial-gradient(circle at 18% 22%, rgba(56,189,248,0.22), transparent 46%), radial-gradient(circle at 82% 76%, rgba(16,185,129,0.2), transparent 45%), linear-gradient(180deg, #030712 0%, #0b1220 100%)",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-sm space-y-4">

        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/all-in-edge-logo-full-slogan.webp"
            alt="All in Edge"
            className="h-32 md:h-36 w-auto object-contain drop-shadow-xl transition-transform duration-300 ease-out hover:scale-110"
          />
        </div>

        {/* Card */}
        <Card className="border border-border/60 shadow-2xl">
          <CardHeader className="pb-2 pt-6 px-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              {mode === "setup_password" && <KeyRound className="h-5 w-5 text-primary" />}
              {mode === "login" && "Entrar na sua conta"}
              {mode === "register" && "Criar nova conta"}
              {mode === "setup_password" && "Criar sua senha"}
              {mode === "verify_email" && "Confirmar codigo do e-mail"}
            </CardTitle>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nome (só no registro) */}
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium">Nickname</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nickname único"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={2}
                      disabled={isLoading}
                      className="pl-9"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              {mode === "register" && (
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro - Localizacao e seguranca</p>
                  <p className="text-[11px] text-muted-foreground">Esses dados ajudam a validar acesso, compras e segurança da conta.</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="country" className="text-xs">Pais</Label>
                      <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Brasil" maxLength={120} disabled={isLoading} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="stateRegion" className="text-xs">Estado/Regiao</Label>
                      <Input id="stateRegion" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} placeholder="SP" maxLength={120} disabled={isLoading} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="city" className="text-xs">Cidade</Label>
                      <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sao Paulo" maxLength={120} disabled={isLoading} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="postalCode" className="text-xs">CEP</Label>
                      <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="00000-000" maxLength={20} disabled={isLoading} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="addressLine" className="text-xs">Endereco</Label>
                    <Input id="addressLine" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Rua, numero e complemento" maxLength={300} disabled={isLoading} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="taxDocument" className="text-xs">CPF ou documento fiscal (opcional)</Label>
                    <Input id="taxDocument" value={taxDocument} onChange={(e) => setTaxDocument(e.target.value)} placeholder="000.000.000-00" maxLength={24} disabled={isLoading} />
                  </div>
                </div>
              )}

              {/* E-mail (oculto no setup_password pois já foi preenchido) */}
              {(mode === "login" || mode === "register") && (
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">E-mail ou CPF</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type={mode === "login" ? "text" : "email"}
                      placeholder={mode === "login" ? "seu@email.com ou seu CPF" : "seu@email.com"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-9"
                      autoComplete="email"
                    />
                  </div>
                </div>
              )}

              {mode === "verify_email" && (
                <div className="space-y-2">
                  <Label htmlFor="verificationCode" className="text-sm font-medium">Codigo de verificacao</Label>
                  <Input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    disabled={isLoading}
                    className="text-center tracking-[0.35em] text-lg font-semibold"
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviamos um codigo para {email || "seu e-mail"}. Digite para concluir o login com Google.
                  </p>
                </div>
              )}

              {/* Senha */}
              {mode !== "verify_email" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "login" ? "Sua senha" : "Mínimo 6 caracteres"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "login" ? 1 : 6}
                    disabled={isLoading}
                    className="pl-9 pr-10"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              )}

              {/* CPF opcional e confirmar senha (registro e setup_password) */}
              {(mode === "register" || mode === "setup_password") && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxDocument" className="text-sm font-medium">CPF ou documento fiscal (opcional)</Label>
                    <div className="relative">
                      <Input
                        id="taxDocument"
                        value={taxDocument}
                        onChange={(e) => setTaxDocument(e.target.value)}
                        placeholder="000.000.000-00"
                        maxLength={24}
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repita a senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className={`pl-9 pr-10 ${passwordMismatch ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordMismatch && (
                      <p className="text-xs text-red-400">As senhas precisam ser iguais nas duas tentativas.</p>
                    )}
                  </div>

                  <PasswordStrengthMeter password={password} />
                </>
              )}

              {/* Botão de submit */}
              <Button
                type="submit"
                className="w-full font-semibold mt-2"
                disabled={isLoading || passwordMismatch}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {mode === "login" && "Continuando..."}
                    {mode === "register" && "Criando conta..."}
                    {mode === "setup_password" && "Salvando senha..."}
                    {mode === "verify_email" && "Validando codigo..."}
                  </>
                ) : (
                  <>
                    {mode === "login" && "Continuar"}
                    {mode === "register" && "Criar conta"}
                    {mode === "setup_password" && "Salvar senha e entrar"}
                    {mode === "verify_email" && "Confirmar e entrar"}
                  </>
                )}
              </Button>

              {mode === "verify_email" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={resendVerificationCode}
                  disabled={isLoading}
                >
                  Reenviar codigo
                </Button>
              )}

              {mode === "login" && (
                <div className="mt-4 rounded-2xl bg-card px-4 py-4">
                  <p className="text-center text-xl font-semibold text-white">Ou entre com:</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-center rounded-xl !border-0 !bg-white !text-[#1f1f1f] shadow-none hover:!bg-[#f2f3f5]"
                      disabled={isLoading}
                      onClick={() => handleSocialLogin("Google")}
                      aria-label="Continuar com Google"
                    >
                      <GoogleIcon />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-center rounded-xl !border-0 !bg-black !text-white shadow-none hover:!bg-[#111111]"
                      disabled={isLoading}
                      onClick={() => handleSocialLogin("Apple")}
                      aria-label="Continuar com Apple"
                    >
                      <AppleIcon />
                    </Button>
                  </div>
                </div>
              )}
            </form>

            {/* Alternância entre modos */}
            <div className="mt-5 pt-4 border-t border-border/50 text-center text-sm text-muted-foreground">
              {mode === "login" && (
                <>
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="text-primary hover:underline font-semibold"
                  >
                    Criar conta grátis
                  </button>
                </>
              )}
              {mode === "register" && (
                <>
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="text-primary hover:underline font-semibold"
                  >
                    Entrar
                  </button>
                </>
              )}
              {mode === "setup_password" && (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  ← Voltar ao login
                </button>
              )}
              {mode === "verify_email" && (
                <button
                  type="button"
                  onClick={() => (window.location.href = "/login")}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  ← Reiniciar login
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/60">Seus dados são privados e seguros.</p>
        <p className="text-center text-[11px] text-muted-foreground/70">
          <span className="mr-1.5 inline-flex h-5 w-6 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white">+18</span>
          Jogo responsável. Somente para maiores de 18 anos.
        </p>
      </div>
    </div>
  );
}
