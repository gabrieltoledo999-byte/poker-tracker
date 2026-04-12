import { useEffect, useState } from "react";
import { Building2, FolderTree, ExternalLink, ShieldCheck, Lock, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";

const DRIVE_STORAGE_KEY = "the-rail-company-drive-url";

const defaultDriveUrl = import.meta.env.VITE_THE_RAIL_DRIVE_URL || "https://drive.google.com/drive/home";

const folders = [
  {
    name: "Estrategia",
    description: "Visao da empresa, objetivos, decisoes importantes e roadmap.",
    items: ["Visao da empresa", "Objetivos", "Decisoes importantes", "Roadmap"],
  },
  {
    name: "Equipe",
    description: "Gestao de pessoas, cargos, responsabilidades e planilha principal.",
    items: ["Planilha principal da equipe", "Definicao de cargos", "Responsabilidades"],
  },
  {
    name: "Produto",
    description: "Funcionalidades, melhorias, feedbacks e bugs.",
    items: ["Ideias de funcionalidades", "Melhorias", "Feedbacks", "Bugs"],
  },
  {
    name: "Operacoes",
    description: "Tarefas, processos e organizacao interna.",
    items: ["Tarefas", "Processos", "Organizacao interna"],
  },
  {
    name: "Financeiro",
    description: "Custos, receitas e planejamento financeiro para crescimento.",
    items: ["Custos", "Receitas", "Planejamento financeiro"],
  },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [driveUrl, setDriveUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  // Redirect if not admin
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (user.role !== "admin") {
      toast.error("Acesso negado. Apenas administradores podem acessar esta aba.");
      setLocation("/");
      return;
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    const saved = localStorage.getItem(DRIVE_STORAGE_KEY) || defaultDriveUrl;
    setDriveUrl(saved);
    setDraftUrl(saved);
  }, []);

  const handleSaveDriveUrl = () => {
    const cleaned = draftUrl.trim();
    localStorage.setItem(DRIVE_STORAGE_KEY, cleaned);
    setDriveUrl(cleaned);
    toast.success("Link do Google Drive salvo na aba Administracao.");
  };

  const handleOpenDrive = () => {
    if (!driveUrl) {
      toast.error("Defina o link do Google Drive antes de abrir.");
      return;
    }
    window.open(driveUrl, "_blank", "noopener,noreferrer");
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not admin
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md border-destructive/50">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <Lock className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription className="mt-2 text-base font-semibold text-destructive">
              Apenas administradores podem acessar esta aba.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")} className="w-full">
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administracao The Rail</h1>
          <p className="text-sm text-muted-foreground">
            Centro operacional com estrutura da empresa e acesso rapido ao Google Drive.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Aba de Administracao
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4" />
            Google Drive da Empresa
          </CardTitle>
          <CardDescription>
            Defina o link quando o Drive oficial do Gmail da empresa estiver pronto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="drive-url">Link do Google Drive</Label>
            <Input
              id="drive-url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveDriveUrl}>Salvar Link</Button>
            <Button variant="outline" onClick={handleOpenDrive}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Google Drive
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Estrutura Principal
          </CardTitle>
          <CardDescription>
            Pasta raiz THE RAIL com subpastas operacionais simples, claras e escalaveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <p className="font-semibold">THE RAIL</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Pasta raiz operacional da empresa dentro da aba Administracao.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
          {folders.map((folder) => (
            <div key={folder.name} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="mb-1 flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                <p className="font-semibold">{folder.name}</p>
              </div>
              <p className="text-sm text-muted-foreground">{folder.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {folder.items.map((item) => (
                  <span
                    key={`${folder.name}-${item}`}
                    className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}