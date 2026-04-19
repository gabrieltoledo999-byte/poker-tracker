import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Calculator, CirclePercent, Coins, Trophy } from "lucide-react";
import { useLocation } from "wouter";

export default function IcmCalculator() {
  const [, setLocation] = useLocation();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_26%),linear-gradient(135deg,_rgba(20,12,6,0.98),_rgba(34,20,10,0.95))] p-6 text-white shadow-2xl md:p-8">
        <Badge className="mb-4 border-amber-300/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/15">
          Novo modulo
        </Badge>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-400/15 p-3 text-amber-100">
                <Calculator className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">Calculadora de ICM</h1>
            </div>
            <p className="text-sm leading-6 text-zinc-300 md:text-base">
              Area reservada para calculo de equidade por premiacao, stacks efetivos e decisao de push ou fold em spots finais.
            </p>
          </div>
          <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300" onClick={() => setLocation("/ranking")}>
            Ver ranking
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-amber-500" />
              Premiacao
            </CardTitle>
            <CardDescription>Campos prontos para payout e distribuicao de premios.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            O modulo pode receber entradas dinamicas por numero de jogadores restantes.
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CirclePercent className="h-4 w-4 text-amber-500" />
              Equidade
            </CardTitle>
            <CardDescription>Comparacao de stack, blind e valor monetario esperado.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Espaco ideal para exibir EV em fichas e EV em dinheiro no mesmo painel.
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" />
              Mesa final
            </CardTitle>
            <CardDescription>Estrutura pronta para spots de FT e bolha.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A aba ja esta criada no menu lateral e pronta para evoluir para uma calculadora funcional.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}