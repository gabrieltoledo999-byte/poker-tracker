import { BoardCards } from "@/components/hand-reviewer/BoardCards";
import { PlayerSeat } from "@/components/hand-reviewer/PlayerSeat";
import { PlayerTableBet } from "@/components/hand-reviewer/PlayerTableBet";
import { PotDisplay } from "@/components/hand-reviewer/PotDisplay";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import type { ReplayStep } from "@/utils/actionNormalizer";
import { formatActionBadge } from "@/utils/actionNormalizer";
import { formatValue, type DisplayUnit } from "@/utils/displayUnit";

function getSeatLayout(maxPlayers: number): Array<{ top: string; left: string }> {
  if (maxPlayers <= 2) {
    return [
      { top: "83%", left: "50%" },
      { top: "17%", left: "50%" },
    ];
  }

  // Build a clockwise ring starting from bottom-center (hero viewpoint).
  // Sequence becomes: bottom -> left-bottom -> left-top -> top -> right-top -> right-bottom.
  const seats = Math.min(Math.max(maxPlayers, 3), 9);
  const cx = 50;
  const cy = 49;
  const rx = seats >= 8 ? 39 : 37;
  const ry = seats >= 8 ? 37 : 35;
  const step = 360 / seats;

  return Array.from({ length: seats }).map((_, index) => {
    const angleDeg = 90 + (index * step);
    const angle = (angleDeg * Math.PI) / 180;
    const left = cx + (rx * Math.cos(angle));
    const top = cy + (ry * Math.sin(angle));
    return {
      top: `${top.toFixed(2)}%`,
      left: `${left.toFixed(2)}%`,
    };
  });
}

/**
 * Calculate player's bet zone position (58% towards center from seat).
 * This is where chips stop after being bet, NOT at the pot center.
 */
function getSeatBetPosition(seatPosition: { top: string; left: string }): { top: string; left: string } {
  const tableCenter = { top: 50, left: 50 };
  const seatTop = parseFloat(seatPosition.top);
  const seatLeft = parseFloat(seatPosition.left);
  
  // Move 58% towards center from seat position
  const betTop = tableCenter.top + (seatTop - tableCenter.top) * 0.42;
  const betLeft = tableCenter.left + (seatLeft - tableCenter.left) * 0.42;
  
  return {
    top: `${betTop.toFixed(2)}%`,
    left: `${betLeft.toFixed(2)}%`,
  };
}

function getSeatHoleCardAnchor(seatPosition: { top: string; left: string }, isHero: boolean): { top: string; left: string } {
  const seatTop = parseFloat(seatPosition.top);
  const seatLeft = parseFloat(seatPosition.left);
  const verticalOffset = isHero ? 6.8 : seatTop < 34 ? 4.8 : seatTop > 66 ? 7.1 : 5.8;
  return {
    top: `${(seatTop - verticalOffset).toFixed(2)}%`,
    left: `${seatLeft.toFixed(2)}%`,
  };
}

function parseCard(card: string): { rank: string; suit: string; isRed: boolean } {
  const clean = card.trim().toUpperCase();
  const suit = clean.slice(-1);
  const rank = clean.slice(0, -1);
  const isRed = suit === "H" || suit === "D";
  const suitSymbol = suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : "♠";
  return { rank, suit: suitSymbol, isRed };
}

function FaceCard({ card }: { card: string }) {
  const parsed = parseCard(card);
  return (
    <div className="h-20 w-14 rounded-xl border-2 border-slate-300 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.38)] flex flex-col items-start px-1.5 pt-1">
      <div className={`text-base font-black leading-tight ${parsed.isRed ? "text-red-600" : "text-slate-900"}`}>{parsed.rank}</div>
      <div className={`flex w-full flex-1 items-center justify-center text-4xl font-black leading-none ${parsed.isRed ? "text-red-600" : "text-slate-900"}`}>{parsed.suit}</div>
    </div>
  );
}

function BackCard() {
  return (
    <div className="h-20 w-14 rounded-xl border-2 border-cyan-200/40 bg-[linear-gradient(140deg,#5b21b6_0%,#312e81_52%,#0e7490_100%)] shadow-[0_8px_18px_rgba(0,0,0,0.42)]">
      <div className="m-1.5 h-[calc(100%-0.75rem)] rounded-md border border-white/35 bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.4)_0_3px,rgba(248,250,252,0)_3px_10px)]" />
    </div>
  );
}

export function PokerTableReplay(props: {
  step: ReplayStep;
  previousStep?: ReplayStep | null;
  maxPlayers: number;
  selectedSeat: number | null;
  onSelectSeat: (seatNumber: number) => void;
  controls?: ReactNode;
  unitToggle?: ReactNode;
  infoPanel?: ReactNode;
  displayUnit: DisplayUnit;
  bigBlind: number;
  className?: string;
}) {
  const [transientChipStep, setTransientChipStep] = useState<number | null>(null);

  const occupied = [...(props.step.seats || [])].sort((a, b) => a.seat - b.seat);
  const layout = getSeatLayout(props.maxPlayers);
  
  // Find hero and rotate seats so hero is always at position 0 (visual center bottom)
  let heroIndex = occupied.length > 0 ? occupied.findIndex(seat => seat.isHero) : -1;
  
  // Fallback: if hero not found, try to find by name "Hero" (case-insensitive)
  if (heroIndex < 0 && occupied.length > 0) {
    heroIndex = occupied.findIndex(seat => seat.name.toLowerCase() === "hero");
  }
  
  // Fallback: if still not found, use first seat (shouldn't happen but prevents crashes)
  if (heroIndex < 0 && occupied.length > 0) {
    heroIndex = 0;
    console.warn("Hero not found in seats, using first seat as hero for layout");
  }
  
  const rotatedSeats = heroIndex >= 0 && occupied.length > 0
    ? [...occupied.slice(heroIndex), ...occupied.slice(0, heroIndex)]
    : occupied;
  
  const actingIndex = props.step.actingPlayer
    ? rotatedSeats.findIndex(seat => seat.name === props.step.actingPlayer)
    : -1;
  
  const actingSeatPosition = actingIndex >= 0 ? layout[actingIndex % layout.length] : { top: "50%", left: "50%" };
  const chipOrigin = actingSeatPosition;
  
  // Chip destination: player's bet zone (NOT center pot)
  const chipDestination = getSeatBetPosition(actingSeatPosition);
  
  const showChipTravel = props.step.action != null && props.step.actionAmount > 0;
  const actionBadgeLabel = props.step.action ? formatActionBadge(props.step.action).toUpperCase() : "";
  const isPlayerLocalAction =
    props.step.action?.action === "fold" ||
    props.step.action?.action === "check" ||
    props.step.action?.action === "collect";
  const isCollectAction = props.step.action?.action === "collect" && (props.step.action.amount ?? 0) > 0;
  const collectChipCount = isCollectAction ? 7 : 0;
  const collectTarget = {
    top: `${parseFloat(actingSeatPosition.top) - 3.2}%`,
    left: actingSeatPosition.left,
  };
  const actionBadgePosition = isPlayerLocalAction
    ? {
        top: `${parseFloat(actingSeatPosition.top) - 9.5}%`,
        left: actingSeatPosition.left,
      }
    : {
        top: `${parseFloat(chipDestination.top) - 6}%`,
        left: chipDestination.left,
      };

  useEffect(() => {
    if (!showChipTravel) {
      setTransientChipStep(null);
      return;
    }

    setTransientChipStep(props.step.stepIndex);

    // Effect is visual-only and should end automatically on the same action step.
    const timeout = setTimeout(() => {
      setTransientChipStep(current => (current === props.step.stepIndex ? null : current));
    }, 560);

    return () => clearTimeout(timeout);
  }, [showChipTravel, props.step.stepIndex]);

  const shouldRenderTransientChip = showChipTravel && transientChipStep === props.step.stepIndex;
  const dealerIndex = rotatedSeats.findIndex(seat => seat.isButton);
  const dealerSeatPoint = dealerIndex >= 0 ? layout[dealerIndex % layout.length] : null;
  const dealerTop = dealerSeatPoint ? `${parseFloat(dealerSeatPoint.top) + (50 - parseFloat(dealerSeatPoint.top)) * 0.27}%` : "50%";
  const dealerIsHero = dealerIndex >= 0 && rotatedSeats[dealerIndex]?.isHero;
  const dealerLeft = dealerSeatPoint ? `${parseFloat(dealerSeatPoint.left) + (50 - parseFloat(dealerSeatPoint.left)) * 0.27 - (dealerIsHero ? 9 : 0)}%` : "50%";
  const isStreetTransition = Boolean(props.previousStep && props.previousStep.street !== props.step.street);
  const previousRotatedSeats = props.previousStep?.seats
    ? [...props.previousStep.seats].sort((a, b) => a.seat - b.seat)
    : [];
  const previousHeroIndex = previousRotatedSeats.findIndex(seat => seat.isHero);
  const previousSeatsByCurrentLayout = previousHeroIndex >= 0
    ? [...previousRotatedSeats.slice(previousHeroIndex), ...previousRotatedSeats.slice(0, previousHeroIndex)]
    : previousRotatedSeats;

  return (
    <section className={`relative h-full overflow-hidden rounded-3xl border border-white/12 bg-[radial-gradient(circle_at_20%_10%,rgba(139,92,246,0.15),transparent_34%),radial-gradient(circle_at_82%_85%,rgba(6,182,212,0.14),transparent_38%),linear-gradient(180deg,#0b1020_0%,#070b17_100%)] shadow-[0_22px_55px_rgba(2,6,23,0.5)] ${props.className ?? ""}`}>
      <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(145deg,rgba(255,255,255,0.05),transparent_30%,transparent_70%,rgba(255,255,255,0.03))]" />
      <div className="relative h-full w-full pb-20">
        <div className="pointer-events-none absolute left-1/2 top-[52.5%] h-[60%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-black/55 blur-[26px]" />
        <div
          className="absolute left-1/2 top-[48.8%] h-[67%] w-[93%] rounded-[999px] border border-indigo-200/18 bg-[radial-gradient(circle_at_50%_34%,#3a3859_0%,#1a213b_46%,#090d1a_100%)] shadow-[0_22px_38px_rgba(0,0,0,0.62),inset_0_2px_2px_rgba(255,255,255,0.16),inset_0_-8px_12px_rgba(0,0,0,0.45)]"
          style={{ transform: "translate(-50%, -50%) perspective(1400px) rotateX(19deg)" }}
        />
        <div
          className="absolute left-1/2 top-[48.8%] h-[62%] w-[88%] rounded-[999px] border border-cyan-100/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0)_24%)]"
          style={{ transform: "translate(-50%, -50%) perspective(1400px) rotateX(19deg)" }}
        />
        <div
          className="absolute left-1/2 top-[48.8%] h-[58.5%] w-[84.5%] rounded-[999px] border border-cyan-200/18 bg-[radial-gradient(circle_at_50%_42%,#1f5578_0%,#18476f_33%,#15395c_62%,#26204e_100%)] shadow-[inset_0_2px_5px_rgba(255,255,255,0.12),inset_0_-20px_26px_rgba(0,0,0,0.26)]"
          style={{ transform: "translate(-50%, -50%) perspective(1400px) rotateX(19deg)" }}
        />

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[6] -translate-x-1/2 -translate-y-1/2 opacity-28">
          <img src="/TheRail_Primary_WITH-FX_navbar_400x120_V02.png" alt="The Rail" className="h-auto w-[420px] max-w-[80vw] object-contain" />
        </div>

        {/* Center area: board + single pot display (single source of truth) */}
        <div className="absolute left-1/2 top-[46.5%] z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <BoardCards cards={props.step.board} />
        </div>
        <div className="absolute left-1/2 top-[57%] z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <PotDisplay pot={props.step.pot} street={props.step.street} displayUnit={props.displayUnit} bigBlind={props.bigBlind} />
        </div>

        {/* Dealer button - above hero cards */}
        {dealerSeatPoint && (
          <div
            className="pointer-events-none absolute z-[52]"
            style={{ top: dealerTop, left: dealerLeft, transform: "translate(-50%, -50%)" }}
          >
            <div className="relative h-12 w-12 rounded-full border-2 border-amber-100/90 bg-[radial-gradient(circle_at_30%_26%,#fff8db_0%,#ffe59f_40%,#eab308_85%)] shadow-[0_10px_18px_rgba(0,0,0,0.42),0_0_18px_rgba(250,204,21,0.38)]">
              <div className="absolute inset-[3px] rounded-full border border-amber-50/90 bg-[repeating-conic-gradient(from_0deg,rgba(255,255,255,0.9)_0deg_14deg,rgba(234,179,8,0)_14deg_30deg)]" />
              <div className="absolute inset-[8px] rounded-full border border-amber-200/85 bg-[radial-gradient(circle_at_30%_30%,#fffef7_0%,#fde68a_70%,#f59e0b_100%)]" />
              <div className="absolute inset-0 flex items-center justify-center text-[13px] font-black tracking-[0.08em] text-slate-900">D</div>
            </div>
          </div>
        )}

        {/* Player seats and related elements */}
        {rotatedSeats.map((seat, index) => {
          // Prevent rendering duplicate or out-of-bounds seats
          if (index >= layout.length) {
            console.warn(`Seat index ${index} exceeds layout length ${layout.length}. Skipping render.`);
            return null;
          }
          
          const seatPosition = layout[index];
          if (!seatPosition) {
            console.warn(`No seat position for index ${index}`);
            return null;
          }
          
          const cardAnchor = getSeatHoleCardAnchor(seatPosition, seat.isHero);
          const seatLeft = parseFloat(seatPosition.left);
          const cardRowTilt = seatLeft < 40 ? -4 : seatLeft > 60 ? 4 : 0;
          const showBackCards = !seat.isHero && seat.status !== "folded" && seat.status !== "sitting_out" && seat.revealedCards.length === 0;
          const showFaceUpCards = seat.status !== "folded" && ((seat.isHero && seat.holeCards.length > 0) || (!seat.isHero && seat.revealedCards.length > 0));
          const cardRowRotation = (!seat.isHero && showBackCards ? 180 : 0) + cardRowTilt;
          const cards = seat.isHero ? seat.holeCards : seat.revealedCards;

          return (
            <div key={`seat-group-${seat.seat}-${seat.name}`}>
              {/* Hole cards */}
              {(showBackCards || showFaceUpCards) && (
                <div
                  key={`hole-cards-${seat.seat}`}
                  className="absolute pointer-events-none"
                  style={{
                    top: cardAnchor.top,
                    left: cardAnchor.left,
                    transform: "translate(-50%, -50%)",
                    zIndex: seat.isHero ? 20 : 18,
                  }}
                >
                  <div
                    className="flex -space-x-3"
                    style={{
                      transform: `rotate(${cardRowRotation}deg)`,
                    }}
                  >
                    {showFaceUpCards
                      ? cards.map((card, cardIndex) => (
                          <FaceCard key={`face-card-${seat.seat}-${card}-${cardIndex}`} card={card} />
                        ))
                      : (
                        <>
                          <BackCard />
                          <BackCard />
                        </>
                      )}
                  </div>
                </div>
              )}

              {/* Player seat */}
              <div
                key={`seat-${seat.seat}`}
                className="absolute z-30 pointer-events-auto"
                style={{
                  top: seatPosition.top,
                  left: seatPosition.left,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <PlayerSeat
                  seat={seat}
                  isActing={props.step.actingPlayer === seat.name}
                  isSelected={props.selectedSeat === seat.seat}
                  displayUnit={props.displayUnit}
                  bigBlind={props.bigBlind}
                  onClick={() => props.onSelectSeat(seat.seat)}
                />
              </div>

              {/* Player bet zone */}
              {seat.contributedCurrentRound > 0 && (
                <div
                  key={`bet-${seat.seat}`}
                  className="absolute z-[35] pointer-events-none"
                  style={{
                    ...getSeatBetPosition(seatPosition),
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <PlayerTableBet
                    amount={seat.contributedCurrentRound}
                    displayUnit={props.displayUnit}
                    bigBlind={props.bigBlind}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Chip animation - z-40 (top layer, above everything except controls) */}
        <AnimatePresence>
          {shouldRenderTransientChip && (
            <motion.div
              key={`chip-${props.step.stepIndex}`}
              className="pointer-events-none absolute z-40"
              initial={{ top: chipOrigin.top, left: chipOrigin.left, opacity: 0, scale: 0.7 }}
              animate={{ top: chipDestination.top, left: chipDestination.left, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ transform: "translate(-50%, -50%)" }}
            >
              <div className="flex items-center gap-1 rounded-xl border border-slate-200/30 bg-slate-900/84 px-2 py-1 text-[10px] font-black text-white shadow-[0_0_20px_rgba(15,23,42,0.8)]">
                <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,#ede9fe_0%,#8b5cf6_50%,#4c1d95_100%)]">
                  <span className="absolute inset-[2px] rounded-full border border-white/80 bg-[repeating-conic-gradient(from_0deg,#ffffff_0deg_18deg,transparent_18deg_40deg)] opacity-90" />
                </span>
                <span className="relative inline-flex h-4 w-4 -ml-1 items-center justify-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,#ecfeff_0%,#06b6d4_50%,#155e75_100%)]">
                  <span className="absolute inset-[2px] rounded-full border border-white/80 bg-[repeating-conic-gradient(from_0deg,#ffffff_0deg_18deg,transparent_18deg_40deg)] opacity-90" />
                </span>
                {formatValue(props.step.actionAmount, props.displayUnit, props.bigBlind)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collect animation: chips return from pot to winning player */}
        <AnimatePresence>
          {isCollectAction && Array.from({ length: collectChipCount }).map((_, chipIndex) => {
            const spreadX = (chipIndex % 3) * 1.1 - 1.1;
            const spreadY = Math.floor(chipIndex / 3) * 1.1 - 1.1;
            return (
              <motion.div
                key={`collect-chip-${props.step.stepIndex}-${chipIndex}`}
                className="pointer-events-none absolute z-[60]"
                initial={{
                  top: `${50 + spreadY}%`,
                  left: `${50 + spreadX}%`,
                  opacity: 0.95,
                  scale: 0.85,
                }}
                animate={{
                  top: collectTarget.top,
                  left: collectTarget.left,
                  opacity: 0,
                  scale: 1.08,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 + chipIndex * 0.03, ease: "easeOut" }}
                style={{ transform: "translate(-50%, -50%)" }}
              >
                <div className={`h-4 w-4 rounded-full border border-white/85 shadow-[0_3px_8px_rgba(0,0,0,0.45)] ${chipIndex % 2 === 0 ? "bg-[radial-gradient(circle_at_30%_30%,#ede9fe_0%,#8b5cf6_50%,#4c1d95_100%)]" : "bg-[radial-gradient(circle_at_30%_30%,#ecfeff_0%,#06b6d4_50%,#155e75_100%)]"}`} />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Street close animation: pull player bet zones into center pot */}
        <AnimatePresence>
          {isStreetTransition && previousSeatsByCurrentLayout.map((seat, index) => {
            if (seat.contributedCurrentRound <= 0) return null;
            const from = getSeatBetPosition(layout[index % layout.length]);
            return (
              <motion.div
                key={`pull-pot-${props.step.stepIndex}-${seat.seat}`}
                className="pointer-events-none absolute z-[45]"
                initial={{ top: from.top, left: from.left, opacity: 1, scale: 1 }}
                animate={{ top: "50%", left: "50%", opacity: 0, scale: 0.9 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
                style={{ transform: "translate(-50%, -50%)" }}
              >
                <div className="h-5 w-5 rounded-full border border-white/85 bg-[radial-gradient(circle_at_30%_30%,#ede9fe_0%,#8b5cf6_50%,#4c1d95_100%)] shadow-[0_3px_8px_rgba(0,0,0,0.4)]" />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Current action badge near acting player's bet zone */}
        {props.step.action && props.step.actingPlayer && actingIndex >= 0 && (
          <motion.div
            className="pointer-events-none absolute z-[62]"
            style={{
              top: actionBadgePosition.top,
              left: actionBadgePosition.left,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: [1, 1.08, 1] }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="rounded-xl border-2 border-cyan-200/85 bg-cyan-300/95 px-3.5 py-1.5 text-[12px] font-black tracking-wide text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.6)]">
              {actionBadgeLabel}
            </div>
          </motion.div>
        )}
      </div>

      {props.controls && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 pointer-events-auto rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md">
          {props.controls}
        </div>
      )}

      {props.unitToggle && (
        <div className="absolute bottom-6 left-4 z-50 pointer-events-auto rounded-xl border border-white/15 bg-slate-950/88 px-2 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {props.unitToggle}
        </div>
      )}

      {props.infoPanel && (
        <div className="absolute bottom-6 right-3 z-50 pointer-events-auto rounded-2xl border border-white/15 bg-slate-950/88 p-3 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md">
          {props.infoPanel}
        </div>
      )}
    </section>
  );
}
