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
    name: "00_DIRETORIA",
    description: "So voce + COO. Acesso restrito.",
    restricted: true,
    items: ["Estrategia da empresa", "Decisoes importantes", "Planejamento financeiro", "Visao de crescimento"],
  },
  {
    name: "01_PRODUTO",
    description: "Coracao do projeto. Onde o aplicativo evolui.",
    items: ["Ideias do app", "Funcionalidades", "Roadmap", "Melhorias"],
  },
  {
    name: "02_DESENVOLVIMENTO",
    description: "Execucao tecnica do sistema.",
    items: ["Bugs", "Estrutura do sistema", "Scripts", "Integracoes"],
  },
  {
    name: "03_OPERACOES",
    description: "Organizacao do dia a dia da empresa.",
    items: ["Tarefas", "Processos", "Fluxos internos", "📊 Controle de Equipe"],
  },
  {
    name: "04_TESTES & VALIDACAO",
    description: "Onde o produto evolui de verdade.",
    items: ["Feedback dos usuarios", "Testes do app", "Ajustes"],
  },
  {
    name: "05_POKER — INTELIGENCIA DO PRODUTO",
    description: "Diferencial competitivo. Alimenta o produto.",
    items: ["Analise de maos", "Estrategias", "Insights de jogadores", "Dados reais"],
  },
  {
    name: "06_MARKETING & BRANDING",
    description: "Identidade visual e presenca da marca.",
    items: ["Logo oficial", "Paleta de cores", "Identidade visual", "Posts", "Ideias de conteudo", "📄 Brand Guidelines"],
  },
  {
    name: "07_ADMINISTRATIVO",
    description: "Parte essencial — documentos e contratos.",
    items: ["Documentos da empresa (MEI)", "Contratos futuros", "Dados legais"],
  },
  {
    name: "08_FINANCEIRO",
    description: "Controle financeiro simples e objetivo.",
    items: ["Custos", "Investimentos", "Projecoes"],
  },
  {
    name: "09_LOJA (FUTURO)",
    description: "Visao de monetizacao e produtos digitais.",
    items: ["Produtos digitais", "Assinaturas", "Ideias de monetizacao", "Estrutura de planos"],
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <div
              key={folder.name}
              className={`rounded-xl border p-4 ${
                folder.restricted
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/70 bg-card"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                {folder.restricted ? (
                  <Lock className="h-4 w-4 text-destructive" />
                ) : (
                  <FolderTree className="h-4 w-4 text-primary" />
                )}
                <p className="font-semibold text-sm">{folder.name}</p>
                {folder.restricted && (
                  <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                    RESTRITO
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{folder.description}</p>
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