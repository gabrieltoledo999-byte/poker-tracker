import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BookOpenCheck, ClipboardList, Sigma } from "lucide-react";
import { useLocation } from "wouter";

export default function Gto() {
  const [, setLocation] = useLocation();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_28%),linear-gradient(135deg,_rgba(10,10,10,0.96),_rgba(20,28,20,0.94))] p-6 text-white shadow-2xl md:p-8">
        <Badge className="mb-4 border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
          Novo modulo
        </Badge>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-200">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">GTO</h1>
            </div>
            <p className="text-sm leading-6 text-zinc-300 md:text-base">
              Espaco reservado para estudo de ranges, sizings e linhas teoricas. A aba ja esta criada na navegacao e pronta para receber a ferramenta completa.
            </p>
          </div>
          <Button className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={() => setLocation("/sessions")}>
            Ir para sessoes
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sigma className="h-4 w-4 text-emerald-500" />
              Ranges
            </CardTitle>
            <CardDescription>Pré-flop, defesa, 3-bet e spots por posicao.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Estrutura pronta para receber tabelas, filtros por stack e atalhos de estudo.
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="h-4 w-4 text-emerald-500" />
              Biblioteca
            </CardTitle>
            <CardDescription>Links de spots, anotações e teoria aplicada.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Pode concentrar artigos, drills e resumos operacionais para consulta rapida.
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-emerald-500" />
              Checklist
            </CardTitle>
            <CardDescription>Pipeline pronto para evoluir sem mexer na nav depois.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A aba ja esta ligada ao menu lateral e ao roteamento de producao.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}