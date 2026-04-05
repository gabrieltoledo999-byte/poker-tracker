import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spade, Eye, EyeOff, Loader2, Mail, Lock, User, KeyRound } from "lucide-react";
import { toast } from "sonner";

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
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center w-20 h-20 rounded-3xl border-2 border-primary/40 bg-primary/10 shadow-2xl shadow-primary/20">
            <Spade className="h-10 w-10 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-tight text-foreground">
              The<span className="text-primary">Rail</span>
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mt-1.5 font-medium">
              Poker Bankroll Tracker
            </p>
          </div>
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
                    {mode === "login" && "Entrando..."}
                    {mode === "register" && "Criando conta..."}
                    {mode === "setup_password" && "Salvando senha..."}
                  </>
                ) : (
                  <>
                    {mode === "login" && "Entrar"}
                    {mode === "register" && "Criar conta"}
                    {mode === "setup_password" && "Salvar senha e entrar"}
                  </>
                )}
              </Button>
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
