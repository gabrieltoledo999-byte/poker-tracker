import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spade } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "E-mail ou senha incorretos.");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao criar conta.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem. Digite a mesma senha nos dois campos.");
        return;
      }
      registerMutation.mutate({ name, email, password });
    }
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl border-2 border-primary bg-card shadow-lg">
            <Spade className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              The<span className="text-primary">Rail</span>
            </h1>
            <p className="text-sm text-muted-foreground uppercase tracking-widest mt-1">
              Poker Bankroll Tracker
            </p>
          </div>
        </div>

        {/* Card */}
        <Card className="border border-border shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {mode === "login" ? "Entrar na sua conta" : "Criar nova conta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Digite seu e-mail e senha para acessar o app."
                : "Preencha os dados abaixo para se registrar."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    disabled={isLoading}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 6 : 1}
                  disabled={isLoading}
                />
              </div>
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? "Aguarde..."
                  : mode === "login"
                  ? "Entrar"
                  : "Criar conta"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-primary hover:underline font-medium"
                  >
                    Criar conta
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-primary hover:underline font-medium"
                  >
                    Entrar
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
