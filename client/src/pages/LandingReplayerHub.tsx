import { PokerTableReplay } from "@/components/hand-reviewer/PokerTableReplay";
import type { ParsedPokerStarsHand } from "@/lib/pokerstars-transcript";
import { buildReplaySteps } from "@/utils/actionNormalizer";
import { parseAndPrepareHand } from "./landingReplayShared";
import { useEffect, useMemo, useState } from "react";

type HandResult = "win" | "loss" | "fold";

interface HubHandDef {
  label: string;
  cards: [string, string];
  result: HandResult;
  delta: string;
  transcript: string;
}

const HUB_HANDS: HubHandDef[] = [
  {
    label: "AA",
    cards: ["Ah", "As"],
    result: "win",
    delta: "+13.0 BB",
    transcript: `PokerStars Hand #251002101: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:24:08 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #3 is the button
Seat 1: HeroPro (38144 in chips)
Seat 2: RiverLab (22620 in chips)
Seat 3: NeoRange (41455 in chips)
Seat 4: FoldTank (20332 in chips)
Seat 5: ValueCore (34890 in chips)
Seat 6: JamNode (27410 in chips)
HeroPro: posts small blind 600
RiverLab: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [Ah As]
NeoRange: folds
FoldTank: folds
ValueCore: raises 1800 to 3000
JamNode: folds
HeroPro: raises 3600 to 6600
RiverLab: folds
ValueCore: calls 3600
*** FLOP *** [Ac 9h 4d]
HeroPro: bets 4200
ValueCore: calls 4200
*** TURN *** [Ac 9h 4d] [2s]
HeroPro: checks
ValueCore: checks
*** RIVER *** [Ac 9h 4d 2s] [Kd]
HeroPro: bets 9800
ValueCore: folds
Uncalled bet (9800) returned to HeroPro
HeroPro collected 22200 from pot
*** SUMMARY ***
Total pot 22200 | Rake 0
Board [Ac 9h 4d 2s Kd]`,
  },
  {
    label: "All-in",
    cards: ["Ad", "Ks"],
    result: "win",
    delta: "+13.5 BB",
    transcript: `PokerStars Hand #251002105: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:34:18 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #4 is the button
Seat 1: RiverLab (18240 in chips)
Seat 2: NeoRange (20110 in chips)
Seat 3: HeroPro (15000 in chips)
Seat 4: FoldTank (22380 in chips)
Seat 5: ValueCore (24600 in chips)
Seat 6: JamNode (19450 in chips)
ValueCore: posts small blind 600
JamNode: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [Ad Ks]
RiverLab: folds
NeoRange: folds
HeroPro: raises 13800 to 15000 and is all-in
FoldTank: folds
ValueCore: calls 14400
JamNode: folds
*** FLOP *** [Kh 7c 3d]
*** TURN *** [Kh 7c 3d] [9s]
*** RIVER *** [Kh 7c 3d 9s] [2c]
HeroPro: shows [Ad Ks] (a pair of Kings)
ValueCore: shows [Qh Qd] (a pair of Queens)
HeroPro collected 31200 from pot
*** SUMMARY ***
Total pot 31200 | Rake 0
Board [Kh 7c 3d 9s 2c]`,
  },
  {
    label: "KK",
    cards: ["Kc", "Kh"],
    result: "loss",
    delta: "-21.7 BB",
    transcript: `PokerStars Hand #251002106: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:38:10 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #2 is the button
Seat 1: RiverLab (24240 in chips)
Seat 2: NeoRange (20110 in chips)
Seat 3: HeroPro (26000 in chips)
Seat 4: FoldTank (22380 in chips)
Seat 5: ValueCore (30600 in chips)
Seat 6: JamNode (19450 in chips)
HeroPro: posts small blind 600
FoldTank: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [Kc Kh]
ValueCore: raises 1800 to 3000
JamNode: folds
RiverLab: folds
NeoRange: folds
HeroPro: raises 23000 to 26000 and is all-in
FoldTank: folds
ValueCore: calls 23000
*** FLOP *** [Ad 8c 5s]
*** TURN *** [Ad 8c 5s] [3h]
*** RIVER *** [Ad 8c 5s 3h] [9d]
HeroPro: shows [Kc Kh] (a pair of Kings)
ValueCore: shows [As Ah] (a pair of Aces)
ValueCore collected 53200 from pot
*** SUMMARY ***
Total pot 53200 | Rake 0
Board [Ad 8c 5s 3h 9d]`,
  },
  {
    label: "AQ",
    cards: ["Ah", "Qs"],
    result: "loss",
    delta: "-18.0 BB",
    transcript: `PokerStars Hand #251002107: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:41:55 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #5 is the button
Seat 1: RiverLab (28144 in chips)
Seat 2: NeoRange (24620 in chips)
Seat 3: HeroPro (30455 in chips)
Seat 4: FoldTank (18332 in chips)
Seat 5: ValueCore (22890 in chips)
Seat 6: JamNode (25410 in chips)
JamNode: posts small blind 600
RiverLab: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [Ah Qs]
NeoRange: folds
HeroPro: raises 1800 to 3000
FoldTank: folds
ValueCore: folds
JamNode: folds
RiverLab: calls 1800
*** FLOP *** [Qd 8h 5c]
RiverLab: checks
HeroPro: bets 3600
RiverLab: calls 3600
*** TURN *** [Qd 8h 5c] [2d]
RiverLab: checks
HeroPro: bets 6000
RiverLab: calls 6000
*** RIVER *** [Qd 8h 5c 2d] [Js]
RiverLab: bets 9000
HeroPro: calls 9000
RiverLab: shows [Jh Jd] (three of a kind, Jacks)
HeroPro: shows [Ah Qs] (a pair of Queens)
RiverLab collected 43800 from pot
*** SUMMARY ***
Total pot 43800 | Rake 0
Board [Qd 8h 5c 2d Js]`,
  },
  {
    label: "72o",
    cards: ["7c", "2d"],
    result: "fold",
    delta: "Fold",
    transcript: `PokerStars Hand #251002104: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:31:42 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #1 is the button
Seat 1: HeroPro (30120 in chips)
Seat 2: RiverLab (28640 in chips)
Seat 3: NeoRange (26110 in chips)
Seat 4: FoldTank (24330 in chips)
Seat 5: ValueCore (22480 in chips)
Seat 6: JamNode (31550 in chips)
RiverLab: posts small blind 600
NeoRange: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [7c 2d]
FoldTank: folds
ValueCore: raises 1800 to 3000
JamNode: folds
HeroPro: folds
RiverLab: folds
NeoRange: folds
Uncalled bet (1800) returned to ValueCore
ValueCore collected 3600 from pot
*** SUMMARY ***
Total pot 3600 | Rake 0`,
  },
];

const SUIT_GLYPH: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };

function MiniCard({ card }: { card: string }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const red = suit === "h" || suit === "d";
  return (
    <span
      className={`inline-flex h-7 w-5 flex-col items-center justify-center rounded-[4px] border border-black/10 bg-white text-[11px] font-bold leading-none ${red ? "text-rose-600" : "text-slate-900"}`}
    >
      <span>{rank}</span>
      <span className="text-[10px]">{SUIT_GLYPH[suit] ?? ""}</span>
    </span>
  );
}

const RESULT_STYLE: Record<HandResult, { badge: string; dot: string; tag: string }> = {
  win: { badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400", tag: "Ganhou" },
  loss: { badge: "bg-rose-500/15 text-rose-300 border-rose-500/30", dot: "bg-rose-400", tag: "Perdeu" },
  fold: { badge: "bg-white/8 text-white/60 border-white/15", dot: "bg-white/40", tag: "Fold" },
};

export default function LandingReplayerHub() {
  const preparedHands = useMemo(
    () => HUB_HANDS
      .map((def) => ({ def, hand: parseAndPrepareHand(def.transcript) }))
      .filter((item): item is { def: HubHandDef; hand: ParsedPokerStarsHand } => Boolean(item.hand)),
    [],
  );

  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const selected = preparedHands[selectedHandIndex] ?? null;
  const replaySteps = useMemo(
    () => (selected ? buildReplaySteps(selected.hand) : []),
    [selected],
  );

  const maxStepIndex = Math.max(replaySteps.length - 1, 0);
  const safeStepIndex = Math.min(Math.max(stepIndex, 0), maxStepIndex);
  const currentStep = replaySteps[safeStepIndex] ?? null;
  const previousStep = safeStepIndex > 0 ? replaySteps[safeStepIndex - 1] ?? null : null;

  const wins = preparedHands.filter((item) => item.def.result === "win").length;
  const losses = preparedHands.filter((item) => item.def.result === "loss").length;
  const folds = preparedHands.filter((item) => item.def.result === "fold").length;

  const selectHand = (index: number) => {
    setSelectedHandIndex(index);
    setStepIndex(0);
    setSelectedSeat(null);
  };

  useEffect(() => {
    if (!autoPlay) return;
    const atEnd = safeStepIndex >= maxStepIndex;
    const delay = atEnd ? 2400 : 1300;
    const timer = setTimeout(() => {
      if (atEnd) {
        const nextHand = preparedHands.length > 0 ? (selectedHandIndex + 1) % preparedHands.length : 0;
        setSelectedHandIndex(nextHand);
        setStepIndex(0);
        setSelectedSeat(null);
      } else {
        setStepIndex((prev) => Math.min(prev + 1, maxStepIndex));
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [autoPlay, safeStepIndex, maxStepIndex, selectedHandIndex, preparedHands.length]);

  if (!selected || !currentStep) {
    return <div className="flex h-full items-center justify-center bg-[#060915] text-sm text-white/70">Replay indisponivel</div>;
  }

  return (
    <div className="flex h-screen min-h-[640px] w-full flex-col overflow-hidden bg-[#060915] text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-cyan-200/90">Sessao do torneio</div>
          <div className="text-[11px] text-white/50">Sunday Storm Deepstack - Nivel XII</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-emerald-300">{wins} ganhas</span>
          <span className="rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-1 text-rose-300">{losses} perdidas</span>
          <span className="rounded-md border border-white/15 bg-white/8 px-2 py-1 text-white/60">{folds} fold</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 p-3 sm:w-[230px] sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r">
          <div className="hidden px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40 sm:block">Maos da sessao</div>
          {preparedHands.map((item, index) => {
            const style = RESULT_STYLE[item.def.result];
            const active = index === selectedHandIndex;
            return (
              <button
                key={item.def.label}
                type="button"
                onClick={() => selectHand(index)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition sm:w-full ${active ? "border-violet-400/60 bg-violet-500/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"}`}
              >
                <span className="flex gap-1">
                  <MiniCard card={item.def.cards[0]} />
                  <MiniCard card={item.def.cards[1]} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold leading-none">{item.def.label}</span>
                  <span className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.tag} {item.def.result !== "fold" ? item.def.delta : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="relative min-h-0 flex-1 p-3">
          <PokerTableReplay
            step={currentStep}
            previousStep={previousStep}
            maxPlayers={selected.hand.maxPlayers}
            selectedSeat={selectedSeat}
            onSelectSeat={setSelectedSeat}
            displayUnit="bb"
            bigBlind={selected.hand.bigBlind}
            className="h-full min-h-[480px]"
            layoutMode="landing"
            controls={
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setStepIndex(0); }}
                  className="rounded px-2 py-1 text-[12px] font-semibold text-white/80 hover:bg-white/10"
                >
                  {"<<"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setStepIndex((prev) => Math.max(prev - 1, 0)); }}
                  className="rounded px-2 py-1 text-[12px] font-semibold text-white/80 hover:bg-white/10"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlay((prev) => !prev)}
                  className="rounded px-2 py-1 text-[12px] font-bold text-cyan-200 hover:bg-white/10"
                  aria-label={autoPlay ? "Pausar" : "Reproduzir"}
                >
                  {autoPlay ? "❚❚" : "►"}
                </button>
                <span className="px-1 text-[12px] text-white/65">{safeStepIndex + 1}/{maxStepIndex + 1}</span>
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setStepIndex((prev) => Math.min(prev + 1, maxStepIndex)); }}
                  className="rounded px-2 py-1 text-[12px] font-semibold text-white/80 hover:bg-white/10"
                >
                  {">"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAutoPlay(false); setStepIndex(maxStepIndex); }}
                  className="rounded px-2 py-1 text-[12px] font-semibold text-white/80 hover:bg-white/10"
                >
                  {">>"}
                </button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
