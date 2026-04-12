import { useEffect, useState } from "react";
import { Building2, FolderTree, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DRIVE_STORAGE_KEY = "the-rail-company-drive-url";

const defaultDriveUrl = import.meta.env.VITE_THE_RAIL_DRIVE_URL || "https://drive.google.com/drive/home";

const folders = [
  {
    name: "Estrategia",
    description: "Visao da empresa, objetivos, decisoes importantes e roadmap.",
  },
  {
    name: "Equipe",
    description: "Gestao de pessoas, cargos, responsabilidades e planilha principal.",
  },
  {
    name: "Produto",
    description: "Funcionalidades, melhorias, feedbacks e bugs.",
  },
  {
    name: "Operacoes",
    description: "Tarefas, processos e organizacao interna.",
  },
  {
    name: "Financeiro",
    description: "Custos, receitas e planejamento financeiro para crescimento.",
  },
];

export default function Admin() {
  const [driveUrl, setDriveUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

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
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {folders.map((folder) => (
            <div key={folder.name} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="mb-1 flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                <p className="font-semibold">{folder.name}</p>
              </div>
              <p className="text-sm text-muted-foreground">{folder.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}