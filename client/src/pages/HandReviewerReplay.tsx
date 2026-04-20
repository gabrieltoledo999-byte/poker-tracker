import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, SkipBack, SkipForward } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionTimeline } from "@/components/hand-reviewer/ActionTimeline";
import { PokerTableReplay } from "@/components/hand-reviewer/PokerTableReplay";
import { TournamentHandListItem } from "@/components/hand-reviewer/TournamentHandListItem";
import { loadHandReviewSession, type HandReviewSession } from "@/lib/hand-review-session";
import { parseHandHistoryTranscript } from "@/parser/handHistoryDispatcher";
import type { ParsedPokerStarsTournament } from "@/parser/pokerstarsParser";
import type { PokerStreet } from "@/lib/pokerstars-transcript";
import {
  buildReplaySteps,
  type ReplayStep,
} from "@/utils/actionNormalizer";
import { formatTournamentLevel, type DisplayUnit } from "@/utils/displayUnit";

type HandFilter = "all" | "won" | "lost" | "folded";

function isForcedPostingAction(action: { action: string }): boolean {
  return action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind";
}

export default function HandReviewerReplay() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ sessionId: string }>("/hand-review/replay/:sessionId");
  const sessionId = params?.sessionId ?? "";

  const [session, setSession] = useState<HandReviewSession | null>(null);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>("chips");
  const [handFilter, setHandFilter] = useState<HandFilter>("all");
  const [mobilePanel, setMobilePanel] = useState<"none" | "hands" | "timeline">("none");
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const loaded = loadHandReviewSession(sessionId);
    setSession(loaded);
    setSelectedHandIndex(0);
    setCurrentActionIndex(0);
    setSelectedSeat(null);
  }, [sessionId]);

  const parsedTournament = useMemo<ParsedPokerStarsTournament | null>(() => {
    if (!session?.rawInput) return null;
    return parseHandHistoryTranscript(session.rawInput, { preferredPlatform: session.parserSelection ?? "AUTO" });
  }, [session]);

  const filteredHands = useMemo(() => {
    if (!parsedTournament) return [];
    return parsedTournament.hands
      .map((hand, idx) => ({ hand, idx }))
      .filter(({ hand }) => {
        if (handFilter === "all") return true;
        return hand.summary.heroResult === handFilter;
      });
  }, [parsedTournament, handFilter]);

  const selectedHand = parsedTournament?.hands[selectedHandIndex] ?? null;
  const handActions = useMemo(
    () => (selectedHand?.actions ?? []).filter(action => !isForcedPostingAction(action)),
    [selectedHand],
  );

  const replaySteps = useMemo(() => (selectedHand ? buildReplaySteps(selectedHand) : []), [selectedHand]);

  const streetFirstStep = useMemo(() => {
    const result: Partial<Record<PokerStreet, number>> = {};
    for (let i = 0; i < replaySteps.length; i++) {
      const s = replaySteps[i].street;
      if (result[s] === undefined) result[s] = i;
    }
    return result;
  }, [replaySteps]);

  const jumpToStreet = (street: PokerStreet) => {
    const idx = streetFirstStep[street];
    if (idx !== undefined) setCurrentActionIndex(idx);
  };

  const currentBigBlind = selectedHand?.bigBlind ?? 0;
  const maxStepIndex = Math.max(replaySteps.length - 1, 0);
  const safeActionIndex = Math.min(Math.max(currentActionIndex, 0), handActions.length);
  const safeStepIndex = Math.min(safeActionIndex, maxStepIndex);
  const currentStep: ReplayStep | null = replaySteps[safeStepIndex] ?? null;
  const previousStep: ReplayStep | null = safeStepIndex > 0 ? replaySteps[safeStepIndex - 1] ?? null : null;
  const highlightedActionIndex = safeActionIndex > 0 ? safeActionIndex - 1 : null;
  const visibleActions = handActions.slice(0, safeActionIndex);

  const canPrevAction = safeActionIndex > 0;
  const canNextAction = safeActionIndex < handActions.length;
  const canPrevHand = selectedHandIndex > 0;
  const canNextHand = selectedHandIndex < ((parsedTournament?.hands.length ?? 0) - 1);
  const currentStreet = currentStep?.street ?? "preflop";
  const selectedHandSeats = selectedHand?.seats ?? [];
  const heroSeatBase = selectedHandSeats.find(seat => seat.isHero);
  const heroStackStart = heroSeatBase?.startingStack ?? null;
  const heroStackNow = currentStep?.seats?.find(seat => seat.isHero)?.stackApprox ?? null;
  const currentDepthBb = heroStackNow != null && currentBigBlind > 0 ? heroStackNow / currentBigBlind : null;
  const startDepthBb = heroStackStart != null && currentBigBlind > 0 ? heroStackStart / currentBigBlind : null;
  const playersAtTable = selectedHandSeats.filter(seat => !seat.isSittingOut).length;
  const handsUntilCurrent = parsedTournament?.hands.slice(0, selectedHandIndex + 1) ?? [];
  const observedPlacingsUntilCurrent = useMemo(() => {
    return handsUntilCurrent.flatMap(hand =>
      Array.from(hand.rawHand.matchAll(/finished the tournament in\s+(\d+)(?:st|nd|rd|th)\s+place/gi))
        .map(match => Number(match[1]))
        .filter(position => Number.isFinite(position) && position > 0),
    );
  }, [handsUntilCurrent]);
  const nearestObservedPlacing = observedPlacingsUntilCurrent.length > 0 ? Math.min(...observedPlacingsUntilCurrent) : null;
  const finalPosition = handsUntilCurrent.map(hand => hand.summary.eliminationPosition).find(position => position != null) ?? null;
  const playersRemainingOnElimination = nearestObservedPlacing != null ? Math.max(nearestObservedPlacing - 1, 0) : null;

  const moveToHand = (handIndex: number, actionIndex: number) => {
    setSelectedHandIndex(handIndex);
    setCurrentActionIndex(actionIndex);
    setSelectedSeat(null);
  };

  const goToTournamentAnalyzer = () => {
    setLocation(`/hand-review/import?replaySession=${sessionId}`);
  };

  const goBackFromReplay = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/hand-review/import");
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-no-back-swipe="true"]')) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;

    const target = event.target;
    if (target instanceof Element && target.closest('[data-no-back-swipe="true"]')) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const mobileViewport = window.innerWidth < 768;
    const startedInLeftArea = start.x <= window.innerWidth * 0.6;

    if (mobileViewport && startedInLeftArea && deltaX >= 90 && deltaY <= 70) {
      goBackFromReplay();
    }
  };

  const goPrevHand = () => {
    if (!canPrevHand) return;
    moveToHand(selectedHandIndex - 1, 0);
  };

  const goNextHand = () => {
    if (!canNextHand) return;
    moveToHand(selectedHandIndex + 1, 0);
  };

  const changeFilter = (filter: HandFilter) => {
    setHandFilter(filter);
    // Navigate to first hand matching new filter
    if (!parsedTournament) return;
    const first = parsedTournament.hands.findIndex(h =>
      filter === "all" ? true : h.summary.heroResult === filter
    );
    if (first >= 0) moveToHand(first, 0);
  };

  const goPrevActionContinuous = () => {
    if (safeActionIndex > 0) {
      setCurrentActionIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (!parsedTournament || !canPrevHand) return;
    const previousHandIndex = selectedHandIndex - 1;
    const previousHandActionCount = (parsedTournament.hands[previousHandIndex]?.actions ?? [])
      .filter(action => !isForcedPostingAction(action)).length;
    moveToHand(previousHandIndex, previousHandActionCount);
  };

  const goNextActionContinuous = () => {
    if (safeActionIndex < handActions.length) {
      setCurrentActionIndex(prev => Math.min(prev + 1, handActions.length));
      return;
    }

    if (!canNextHand) return;
    moveToHand(selectedHandIndex + 1, 0);
  };

  if (!parsedTournament || !selectedHand || !currentStep) {
    return (
      <div className="mx-auto mt-0.5 flex h-[calc(100vh-5rem)] w-full max-w-[1700px] flex-col gap-3 overflow-hidden px-2 py-3 md:mt-1 md:px-3">
        <Card className="border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle>Replay nao carregado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Nao foi encontrada uma sessao de torneio para este replay.</p>
            <Button variant="outline" onClick={() => setLocation("/hand-review/import")}>Voltar para importacao</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="mx-auto mt-0.5 flex h-[calc(100vh-5rem)] w-full max-w-[1900px] flex-col gap-0 overflow-hidden pb-4 md:mt-1"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <section className="grid min-h-0 h-full flex-1 items-stretch gap-2 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden h-full flex-col rounded-2xl border border-white/10 bg-slate-950/65 p-2.5 md:flex" style={{ minHeight: 0 }}>
          {/* Top half — hand list */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-[0.15em] text-cyan-100 text-xs">Mao a mao</div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={goToTournamentAnalyzer}>Analisar torneio</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setLocation("/hand-review/import")}>Novo torneio</Button>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="mb-2 flex gap-1 shrink-0">
              {(["all", "won", "lost", "folded"] as HandFilter[]).map(f => {
                const labels: Record<HandFilter, string> = { all: "ALL", won: "WIN", lost: "LOSS", folded: "FOLD" };
                const activeClass: Record<HandFilter, string> = {
                  all: "bg-white/20 text-white border-white/30",
                  won: "bg-emerald-500 text-white border-emerald-400",
                  lost: "bg-red-600 text-white border-red-500",
                  folded: "bg-slate-500 text-white border-slate-400",
                };
                const inactiveClass = "bg-white/5 text-white/50 border-white/10 hover:bg-white/10";
                return (
                  <button
                    key={f}
                    onClick={() => changeFilter(f)}
                    className={`flex-1 rounded-md border px-1 py-1 text-[10px] font-bold transition ${
                      handFilter === f ? activeClass[f] : inactiveClass
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-white/50 mb-2 shrink-0">{filteredHands.length} / {parsedTournament?.hands?.length ?? 0} maos</div>

            {/* Column header */}
            <div className="mb-1 shrink-0 grid grid-cols-[auto_1fr_auto_auto] items-center gap-1.5 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/35">
              <span className="w-2" />
              <span>Mão</span>
              <span>Pos</span>
              <span>Blinds</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto text-xs text-white/70 pr-0.5">
              {filteredHands.map(({ hand, idx }) => {
                const heroCards: [string, string] = [
                  hand.heroCards?.[0] ?? "?",
                  hand.heroCards?.[1] ?? "?",
                ];

                return (
                  <TournamentHandListItem
                    key={idx}
                    handNumber={idx + 1}
                    heroCards={heroCards}
                    smallBlind={hand.smallBlind}
                    bigBlind={hand.bigBlind}
                    heroPosition={hand.heroPosition}
                    heroResult={hand.summary.heroResult}
                    isSelected={selectedHandIndex === idx}
                    onClick={() => moveToHand(idx, 0)}
                    displayUnit={displayUnit}
                  />
                );
              })}
            </div>
          </div>

          {/* Bottom half — timeline */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 pt-3 mt-3 overflow-hidden">
            <div className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Timeline — Mão {selectedHandIndex + 1}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ActionTimeline
                actions={handActions}
                selectedActionIndex={highlightedActionIndex}
                onSelectAction={index => setCurrentActionIndex(index + 1)}
              />
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 h-full flex-1 flex-col">
          <div className="mb-2 flex items-center gap-1.5 px-1 md:hidden">
            <Button
              size="sm"
              variant={mobilePanel === "hands" ? "default" : "outline"}
              className="h-7 px-2 text-[10px]"
              onClick={() => setMobilePanel(prev => (prev === "hands" ? "none" : "hands"))}
            >
              Maos
            </Button>
            <Button
              size="sm"
              variant={mobilePanel === "timeline" ? "default" : "outline"}
              className="h-7 px-2 text-[10px]"
              onClick={() => setMobilePanel(prev => (prev === "timeline" ? "none" : "timeline"))}
            >
              Acoes
            </Button>
            <div className="ml-auto text-[11px] text-white/65">
              Mao {selectedHandIndex + 1} · {safeActionIndex}/{handActions.length}
            </div>
          </div>

          <PokerTableReplay
            className="flex-1 min-h-0"
            step={currentStep}
            previousStep={previousStep}
            maxPlayers={selectedHand.maxPlayers}
            selectedSeat={selectedSeat}
            onSelectSeat={setSelectedSeat}
            displayUnit={displayUnit}
            bigBlind={currentBigBlind}
            unitToggle={(
              <Button
                size="sm"
                className="h-7 sm:h-10 px-2 sm:px-3 text-[10px] sm:text-sm"
                variant={displayUnit === "bb" ? "default" : "outline"}
                onClick={() => setDisplayUnit(prev => (prev === "bb" ? "chips" : "bb"))}
              >
                {displayUnit === "bb" ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                BB
              </Button>
            )}
            infoPanel={(() => {
              const sprByStreet = selectedHand.calculations.sprByStreet;
              const sprValue = currentStreet === "preflop" ? sprByStreet?.preflop
                : currentStreet === "flop" ? (sprByStreet?.flop ?? selectedHand.calculations.sprFlop)
                : currentStreet === "turn" ? sprByStreet?.turn
                : sprByStreet?.river;
              const sprLabel = currentStreet === "preflop" ? "SPR pré" : `SPR ${currentStreet}`;
              const rows: [string, string | null][] = [
                ["Nível", formatTournamentLevel(selectedHand.level)],
                ["Blinds", `${selectedHand.smallBlind}/${selectedHand.bigBlind}${selectedHand.ante > 0 ? `/${selectedHand.ante}` : ""}`],
                ["Mesa", `${playersAtTable}/${selectedHand.maxPlayers}`],
                ["Stack", currentDepthBb != null ? `${currentDepthBb.toFixed(1)}bb` : null],
                ["Início", startDepthBb != null ? `${startDepthBb.toFixed(1)}bb` : null],
                [sprLabel, sprValue != null ? sprValue.toFixed(2) : null],
                ["Posição final", finalPosition != null ? `${finalPosition}º` : null],
                ["Restavam", playersRemainingOnElimination != null ? String(playersRemainingOnElimination) : null],
              ];
              const visibleRows = rows.filter(([, v]) => v != null);
              return (
                <div className="grid min-w-[180px] grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {visibleRows.map(([label, value]) => (
                    <Fragment key={label}>
                      <span className="text-white/55">{label}</span>
                      <span className="text-right font-semibold text-cyan-100">{value}</span>
                    </Fragment>
                  ))}
                </div>
              );
            })()}
            controls={(
              <div className="flex min-w-max items-center justify-end gap-1 sm:gap-2">
                {/* Street jump buttons */}
                {(["preflop", "flop", "turn", "river"] as PokerStreet[]).map(street => {
                  const labels: Record<string, string> = { preflop: "PreFlop", flop: "Flop", turn: "Turn", river: "River" };
                  const isActive = currentStreet === street ||
                    (street === "preflop" && ["preflop"].includes(currentStreet)) ||
                    (street === "flop" && ["flop"].includes(currentStreet)) ||
                    (street === "turn" && ["turn"].includes(currentStreet)) ||
                    (street === "river" && ["river", "showdown", "summary"].includes(currentStreet));
                  const exists = streetFirstStep[street] !== undefined;
                  return (
                    <Button
                      key={street}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className={`h-7 sm:h-11 px-2 sm:px-4 text-[10px] sm:text-sm ${
                        isActive ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : ""
                      }`}
                      onClick={() => jumpToStreet(street)}
                      disabled={!exists}
                    >
                      {labels[street]}
                    </Button>
                  );
                })}
                <div className="mx-0.5 h-5 w-px bg-white/15" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-11 px-2 sm:px-4 text-[10px] sm:text-sm"
                  onClick={goPrevHand}
                  disabled={!canPrevHand}
                >
                  <SkipBack className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Mao-</span>
                  <span className="sm:hidden">M-</span>
                </Button>
                <Button
                  size="sm"
                  className="h-7 sm:h-11 px-2 sm:px-4 text-[10px] sm:text-sm"
                  variant="outline"
                  onClick={goPrevActionContinuous}
                  disabled={!canPrevAction && !canPrevHand}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-7 sm:h-11 px-2 sm:px-4 text-[10px] sm:text-sm"
                  variant="outline"
                  onClick={goNextActionContinuous}
                  disabled={!canNextAction && !canNextHand}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-11 px-2 sm:px-4 text-[10px] sm:text-sm"
                  onClick={goNextHand}
                  disabled={!canNextHand}
                >
                  <SkipForward className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Mao+</span>
                  <span className="sm:hidden">M+</span>
                </Button>
                <span className="rounded-md border border-border/60 px-1.5 py-1 text-[9px] sm:px-2.5 sm:py-1.5 sm:text-xs text-muted-foreground">
                  {safeActionIndex}/{handActions.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex h-11 px-4 text-sm"
                  onClick={goToTournamentAnalyzer}
                >
                  Analisar torneio
                </Button>
              </div>
            )}
          />

          {mobilePanel === "hands" && (
            <div data-no-back-swipe="true" className="mt-2 md:hidden rounded-xl border border-white/10 bg-slate-950/70 p-2 max-h-[36vh] overflow-y-auto">
              <div className="mb-2 flex gap-1">
                {(["all", "won", "lost", "folded"] as HandFilter[]).map(f => {
                  const labels: Record<HandFilter, string> = { all: "ALL", won: "WIN", lost: "LOSS", folded: "FOLD" };
                  const activeClass: Record<HandFilter, string> = {
                    all: "bg-white/20 text-white border-white/30",
                    won: "bg-emerald-500 text-white border-emerald-400",
                    lost: "bg-red-600 text-white border-red-500",
                    folded: "bg-slate-500 text-white border-slate-400",
                  };
                  const inactiveClass = "bg-white/5 text-white/50 border-white/10 hover:bg-white/10";
                  return (
                    <button
                      key={`mobile-filter-${f}`}
                      onClick={() => changeFilter(f)}
                      className={`flex-1 rounded-md border px-1 py-1 text-[10px] font-bold transition ${
                        handFilter === f ? activeClass[f] : inactiveClass
                      }`}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-white/50 mb-2">{filteredHands.length} / {parsedTournament?.hands?.length ?? 0} maos</div>
              <div className="space-y-1">
                {filteredHands.map(({ hand, idx }) => {
                  const heroCards: [string, string] = [
                    hand.heroCards?.[0] ?? "?",
                    hand.heroCards?.[1] ?? "?",
                  ];
                  return (
                    <TournamentHandListItem
                      key={`mobile-hand-${idx}`}
                      handNumber={idx + 1}
                      heroCards={heroCards}
                      smallBlind={hand.smallBlind}
                      bigBlind={hand.bigBlind}
                      heroPosition={hand.heroPosition}
                      heroResult={hand.summary.heroResult}
                      isSelected={selectedHandIndex === idx}
                      onClick={() => {
                        moveToHand(idx, 0);
                        setMobilePanel("none");
                      }}
                      displayUnit={displayUnit}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {mobilePanel === "timeline" && (
            <div data-no-back-swipe="true" className="mt-2 md:hidden rounded-xl border border-white/10 bg-slate-950/70 p-2 max-h-[36vh] overflow-y-auto">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Timeline — Mao {selectedHandIndex + 1}
              </div>
              <ActionTimeline
                actions={handActions}
                selectedActionIndex={highlightedActionIndex}
                onSelectAction={index => setCurrentActionIndex(index + 1)}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
