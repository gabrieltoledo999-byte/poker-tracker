import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [mode, setMode] = useState<"login" | "register" | "setup_password">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "E-mail ou senha incorretos.");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada! Bem-vindo ao The Rail.");
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao criar conta.");
    },
  });

  const setupPasswordMutation = trpc.auth.setupPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha criada! Bem-vindo de volta — seu histórico está intacto.");
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao configurar senha.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "register") {
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem.");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      registerMutation.mutate({ name, email, password });
    } else if (mode === "setup_password") {
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem.");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      setupPasswordMutation.mutate({ email, password });
    }
  };

  const switchMode = (newMode: "login" | "register" | "setup_password") => {
    setMode(newMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending || setupPasswordMutation.isPending;

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

  const handleSocialLogin = (provider: "Google" | "Apple") => {
    if (provider === "Google") {
      window.location.href = "/api/oauth/google";
      return;
    }

    toast.info("Login com Apple em breve.");
  };

  const passwordStrength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3;

  const strengthColors = ["bg-muted", "bg-red-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];
  const strengthLabels = ["", "Fraca", "Regular", "Boa", "Forte"];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/favicon-symbol-large.png"
            alt="The Rail"
            className="h-44 md:h-48 w-auto object-contain drop-shadow-xl"
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
            </CardTitle>
            <CardDescription className="text-sm">
              {mode === "login" && "Acesse seu bankroll e sessões."}
              {mode === "register" && "Comece a rastrear seu bankroll agora."}
              {mode === "setup_password" && (
                <span>
                  Conta encontrada para <strong className="text-foreground">{email}</strong>.
                  {" "}Crie uma senha para acessar seu histórico completo.
                </span>
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nome (só no registro) */}
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome completo"
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

              {/* E-mail (oculto no setup_password pois já foi preenchido) */}
              {mode !== "setup_password" && (
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
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

              {/* Senha */}
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

              {/* Confirmar senha + indicador de força (registro e setup_password) */}
              {(mode === "register" || mode === "setup_password") && (
                <>
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
                        className="pl-9 pr-10"
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
                  </div>

                  {/* Indicador de força da senha */}
                  {password.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              passwordStrength >= level ? strengthColors[passwordStrength] : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      {passwordStrength > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Força da senha: <span className="font-medium">{strengthLabels[passwordStrength]}</span>
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Botão de submit */}
              <Button
                type="submit"
                className="w-full font-semibold mt-2"
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {mode === "login" && "Continuando com e-mail..."}
                    {mode === "register" && "Criando conta..."}
                    {mode === "setup_password" && "Salvando senha..."}
                  </>
                ) : (
                  <>
                    {mode === "login" && "Continuar com e-mail"}
                    {mode === "register" && "Criar conta"}
                    {mode === "setup_password" && "Salvar senha e entrar"}
                  </>
                )}
              </Button>

              <div className="mt-3 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start rounded-xl !border-[#dadce0] !bg-white !text-[#5f6368] hover:!bg-[#f8f9fa] hover:!text-[#3c4043]"
                  style={{ backgroundColor: "#ffffff", color: "#5f6368" }}
                  disabled={isLoading}
                  onClick={() => handleSocialLogin("Google")}
                >
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center">
                    <GoogleIcon />
                  </span>
                  Continuar com Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start rounded-xl !border-black !bg-black !text-white font-semibold tracking-[0.01em] hover:!bg-[#111111]"
                  style={{ backgroundColor: "#000000", color: "#ffffff" }}
                  disabled={isLoading}
                  onClick={() => handleSocialLogin("Apple")}
                >
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center">
                    <AppleIcon />
                  </span>
                  Continuar com Apple
                </Button>
              </div>
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
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/50">
          Seus dados são privados e seguros.
        </p>
      </div>
    </div>
  );
}
