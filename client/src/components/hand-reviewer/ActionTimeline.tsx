import { Badge } from "@/components/ui/badge";
import type { PokerAction } from "@/parser/pokerstarsParser";
import { formatActionBadge } from "@/utils/actionNormalizer";

const STREETS: Array<{ key: "preflop" | "flop" | "turn" | "river" | "showdown"; label: string }> = [
  { key: "preflop", label: "Preflop" },
  { key: "flop", label: "Flop" },
  { key: "turn", label: "Turn" },
  { key: "river", label: "River" },
  { key: "showdown", label: "Showdown" },
];

export function ActionTimeline(props: {
  actions: PokerAction[];
  selectedActionIndex: number | null;
  onSelectAction: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      {STREETS.map(street => {
        const items = props.actions
          .map((action, index) => ({ action, index }))
          .filter(item => (street.key === "showdown" ? (item.action.street === "showdown" || item.action.street === "summary") : item.action.street === street.key));

        return (
          <section key={street.key} className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{street.label}</p>
              <Badge variant="outline">{items.length} ações</Badge>
            </div>

            <div className="space-y-1.5">
              {items.length > 0 ? items.map(item => (
                <button
                  key={`${street.key}-${item.index}`}
                  onClick={() => props.onSelectAction(item.index)}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition ${props.selectedActionIndex === item.index ? "border-cyan-300/80 bg-cyan-500/20 text-cyan-950 dark:text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.3)]" : "border-border/60 bg-background/70 text-muted-foreground hover:bg-background"}`}
                >
                  <span className="truncate text-[12px] font-semibold">{item.action.player}</span>
                  <span className="text-[12px] font-black tracking-wide">{formatActionBadge(item.action).toUpperCase()}</span>
                </button>
              )) : (
                <div className="rounded-lg border border-dashed border-border/50 px-2 py-2 text-xs text-muted-foreground">Sem ações</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
