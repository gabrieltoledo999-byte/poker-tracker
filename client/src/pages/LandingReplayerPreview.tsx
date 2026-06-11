import { PokerTableReplay } from "@/components/hand-reviewer/PokerTableReplay";
import type { ParsedPokerStarsHand } from "@/lib/pokerstars-transcript";
import { buildReplaySteps } from "@/utils/actionNormalizer";
import { parseAndPrepareHand } from "./landingReplayShared";
import { useEffect, useMemo, useState } from "react";

const SAMPLE_HANDS: Array<{ label: string; transcript: string }> = [
  {
    label: "AA",
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
    label: "JJ",
    transcript: `PokerStars Hand #251002102: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:26:42 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #2 is the button
Seat 1: RiverLab (31220 in chips)
Seat 2: HeroPro (41380 in chips)
Seat 3: NeoRange (22890 in chips)
Seat 4: FoldTank (20110 in chips)
Seat 5: ValueCore (25400 in chips)
Seat 6: JamNode (31890 in chips)
FoldTank: posts small blind 600
ValueCore: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [Jh Jc]
NeoRange: folds
FoldTank: calls 600
ValueCore: checks
HeroPro: raises 3600 to 4800
FoldTank: calls 4200
ValueCore: folds
*** FLOP *** [Js 8d 3c]
FoldTank: checks
HeroPro: bets 3800
FoldTank: calls 3800
*** TURN *** [Js 8d 3c] [Td]
FoldTank: checks
HeroPro: checks
*** RIVER *** [Js 8d 3c Td] [2c]
FoldTank: bets 5000
HeroPro: calls 5000
HeroPro collected 27300 from pot
*** SUMMARY ***
Total pot 27300 | Rake 0
Board [Js 8d 3c Td 2c]`,
  },
  {
    label: "AK",
    transcript: `PokerStars Hand #251002103: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:29:08 BRT
Table 'Sunday Storm Deepstack' 6-max Seat #5 is the button
Seat 1: RiverLab (28144 in chips)
Seat 2: NeoRange (19620 in chips)
Seat 3: HeroPro (34455 in chips)
Seat 4: FoldTank (18332 in chips)
Seat 5: ValueCore (22890 in chips)
Seat 6: JamNode (25410 in chips)
HeroPro: posts small blind 600
FoldTank: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroPro [As Kd]
ValueCore: folds
JamNode: folds
RiverLab: raises 1800 to 3000
NeoRange: calls 3000
HeroPro: raises 4200 to 7200
FoldTank: folds
RiverLab: calls 4200
NeoRange: folds
*** FLOP *** [Ah 9c 4d]
HeroPro: bets 5800
RiverLab: calls 5800
*** TURN *** [Ah 9c 4d] [2s]
HeroPro: checks
RiverLab: checks
*** RIVER *** [Ah 9c 4d 2s] [Kh]
HeroPro: bets 10800
RiverLab: folds
Uncalled bet (10800) returned to HeroPro
HeroPro collected 23600 from pot
*** SUMMARY ***
Total pot 23600 | Rake 0
Board [Ah 9c 4d 2s Kh]`,
  },
  {
    label: "Fold",
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
  {
    label: "All-in",
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
];

export default function LandingReplayerPreview() {
  const preparedHands = useMemo(
    () => SAMPLE_HANDS
      .map((sample) => ({ label: sample.label, hand: parseAndPrepareHand(sample.transcript) }))
      .filter((item): item is { label: string; hand: ParsedPokerStarsHand } => Boolean(item.hand)),
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

  // Continuous autoplay: advance step by step and roll into the next hand at the end.
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
      <div className="relative min-h-0 flex-1 p-4">
        <PokerTableReplay
          step={currentStep}
          previousStep={previousStep}
          maxPlayers={selected.hand.maxPlayers}
          selectedSeat={selectedSeat}
          onSelectSeat={setSelectedSeat}
          displayUnit="bb"
          bigBlind={selected.hand.bigBlind}
          className="h-full min-h-[520px]"
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
  );
}
