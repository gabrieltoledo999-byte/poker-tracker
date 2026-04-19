import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParsedPokerStarsHand } from "@/parser/pokerstarsParser";
import { formatTournamentLevel } from "@/utils/displayUnit";

function formatDate(dateText: string): string {
  const parts = dateText.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/);
  if (!parts) return dateText;
  return `${parts[3]}/${parts[2]}/${parts[1]} ${parts[4]}`;
}

export function HandSummaryHeader({ hand }: { hand: ParsedPokerStarsHand }) {
  const heroSeat = hand.seats.find(seat => seat.isHero);
  const displayLevel = formatTournamentLevel(hand.level) ?? hand.level;

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Resumo da mão</CardTitle>
          <div className="flex gap-2">
            <Badge>{hand.maxPlayers}-max</Badge>
            <Badge variant="outline">Level {displayLevel}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Hand ID: <strong>{hand.handId}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Torneio: <strong>#{hand.tournamentId}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Data: <strong>{formatDate(hand.dateTime)} {hand.timezone}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Mesa: <strong>{hand.tableName}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Blinds/Antes: <strong>{hand.smallBlind}/{hand.bigBlind}/{hand.ante}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Hero: <strong>{hand.heroName}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Posição: <strong>{hand.heroPosition || "-"}</strong></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">Stack inicial: <strong>{heroSeat?.startingStack ?? "-"}</strong></div>
        </div>
      </CardContent>
    </Card>
  );
}
