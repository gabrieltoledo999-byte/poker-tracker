import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_POKER_CARDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CardCode,
  type HoldemBoard,
  type OddsSimulationResult,
  simulateEquity,
} from "@/lib/pokerOdds";
import { ChevronDown, Dices, RefreshCw, Target, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type ActiveTarget =
  | { zone: "hero"; cardIndex: 0 | 1 }
  | { zone: "board"; boardIndex: 0 | 1 | 2 | 3 | 4 }
  | { zone: "opponent"; playerId: string; cardIndex: 0 | 1 };

type StageKey = "hero-1" | "hero-2" | "board" | "opponents" | "simulate";

type SeatPosition = {
  top?: string;
  right?: string;
  left?: string;
  bottom?: string;
  transform?: string;
};

type Player = {
  id: string;
  name: string;
  isHero: boolean;
  active: boolean;
  cards: [CardCode | null, CardCode | null];
  ranges?: string[];
};

const HERO_LABELS = ["Sua 1a carta", "Sua 2a carta"] as const;
const BOARD_LABELS = ["Flop 1", "Flop 2", "Flop 3", "Turn", "River"] as const;
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
const SUIT_SYMBOLS = { h: "♥", d: "♦", c: "♣", s: "♠" } as const;

const OPPONENT_POSITIONS: SeatPosition[] = [
  { top: "16%", left: "24%" },
  { top: "9%", left: "50%" },
  { top: "16%", left: "76%" },
  { top: "40%", left: "89%" },
  { top: "67%", left: "85%" },
  { top: "84%", left: "70%" },
  { top: "84%", left: "30%" },
  { top: "67%", left: "15%" },
  { top: "40%", left: "11%" },
];

const HERO_POSITION: SeatPosition = { bottom: "6.5%", left: "50%", transform: "translateX(-50%)" };

function createInitialPlayers(): Player[] {
  return [
    { id: "hero", name: "Hero", isHero: true, active: true, cards: [null, null] },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `op-${index + 1}`,
      name: `Vilão ${index + 1}`,
      isHero: false,
      active: index < 2,
      cards: [null, null] as [CardCode | null, CardCode | null],
    })),
  ];
}

function emptyBoard(): HoldemBoard {
  return [null, null, null, null, null];
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function countCards(cards: Array<CardCode | null | undefined>): number {
  return cards.filter(Boolean).length;
}

function seatStyle(position: SeatPosition): CSSProperties {
  return { position: "absolute", ...position };
}

function topCategory(result: OddsSimulationResult | null) {
  if (!result?.ok) return null;
  return CATEGORY_ORDER.reduce<{ key: (typeof CATEGORY_ORDER)[number]; value: number } | null>((best, category) => {
    const value = result.heroCategoryPct[category];
    if (!best || value > best.value) return { key: category, value };
    return best;
  }, null);
}

function getTargetCard(target: ActiveTarget, players: Player[], board: HoldemBoard): CardCode | null {
  if (target.zone === "board") return board[target.boardIndex];
  if (target.zone === "hero") {
    const hero = players.find((player) => player.isHero);
    return hero?.cards[target.cardIndex] ?? null;
  }
  return players.find((player) => player.id === target.playerId)?.cards[target.cardIndex] ?? null;
}

function targetLabel(target: ActiveTarget, players: Player[]): string {
  if (target.zone === "hero") return target.cardIndex === 0 ? "sua 1ª carta" : "sua 2ª carta";
  if (target.zone === "board") return "cartas da mesa";
  const player = players.find((item) => item.id === target.playerId);
  return `${player?.name ?? "Vilão"} - carta ${target.cardIndex + 1}`;
}

function firstEmptyTarget(players: Player[], board: HoldemBoard): ActiveTarget | null {
  const hero = players.find((player) => player.isHero);
  if (hero) {
    if (!hero.cards[0]) return { zone: "hero", cardIndex: 0 };
    if (!hero.cards[1]) return { zone: "hero", cardIndex: 1 };
  }

  for (let i = 0; i < board.length; i += 1) {
    if (!board[i]) return { zone: "board", boardIndex: i as 0 | 1 | 2 | 3 | 4 };
  }

  for (const opponent of players.filter((player) => !player.isHero && player.active)) {
    if (!opponent.cards[0]) return { zone: "opponent", playerId: opponent.id, cardIndex: 0 };
    if (!opponent.cards[1]) return { zone: "opponent", playerId: opponent.id, cardIndex: 1 };
  }

  return null;
}

function nextTargetAfterFill(current: ActiveTarget, players: Player[], board: HoldemBoard): ActiveTarget | null {
  if (current.zone === "hero" && current.cardIndex === 0) {
    const hero = players.find((player) => player.isHero);
    if (hero && !hero.cards[1]) return { zone: "hero", cardIndex: 1 };
  }

  if (current.zone === "board" && current.boardIndex < 4) {
    const nextBoardIndex = (current.boardIndex + 1) as 1 | 2 | 3 | 4;
    if (!board[nextBoardIndex]) return { zone: "board", boardIndex: nextBoardIndex };
  }

  if (current.zone === "opponent" && current.cardIndex === 0) {
    const opponent = players.find((player) => player.id === current.playerId);
    if (opponent && !opponent.cards[1]) return { zone: "opponent", playerId: current.playerId, cardIndex: 1 };
  }

  return firstEmptyTarget(players, board);
}

function useOddsSimulation(players: Player[], boardCards: HoldemBoard) {
  const [result, setResult] = useState<OddsSimulationResult>({
    ok: false,
    method: "invalid",
    iterations: 0,
    heroWinsPct: 0,
    heroTiesPct: 0,
    heroLosesPct: 0,
    heroEquityPct: 0,
    othersWinsPct: 0,
    othersTiesPct: 0,
    othersLosesPct: 0,
    othersEquityPct: 0,
    heroCategoryPct: {
      royal_flush: 0,
      straight_flush: 0,
      quads: 0,
      full_house: 0,
      flush: 0,
      straight: 0,
      trips: 0,
      two_pair: 0,
      one_pair: 0,
      high_card: 0,
    },
    opponentsCategoryPct: {
      royal_flush: 0,
      straight_flush: 0,
      quads: 0,
      full_house: 0,
      flush: 0,
      straight: 0,
      trips: 0,
      two_pair: 0,
      one_pair: 0,
      high_card: 0,
    },
    usedCards: [],
    activeOpponents: 0,
    note: "Comece escolhendo suas 2 cartas.",
  });

  useEffect(() => {
    let cancelled = false;
    const hero = players.find((player) => player.isHero);
    if (!hero) return;

    const activeOpponents = players.filter((player) => !player.isHero && player.active);
    const iterations = activeOpponents.length >= 6 ? 7000 : activeOpponents.length >= 3 ? 5500 : 4000;

    const timeout = window.setTimeout(() => {
      const simulation = simulateEquity({
        heroCards: hero.cards,
        boardCards,
        opponents: activeOpponents.map((opponent) => ({
          active: true,
          cards: opponent.cards,
          ranges: opponent.ranges,
        })),
        iterations,
      });
      if (!cancelled) setResult(simulation);
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [boardCards, players]);

  return result;
}

function PokerCardButton({
  card,
  hidden = false,
  size = "board",
  selected = false,
  disabled = false,
  onClick,
  onClear,
  title,
}: {
  card: CardCode | null;
  hidden?: boolean;
  size?: "deck" | "board" | "hero" | "opponent";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onClear?: () => void;
  title?: string;
}) {
  const widthClass =
    size === "deck"
      ? "w-[clamp(24px,2.1vw,34px)]"
      : size === "hero"
        ? "w-[clamp(44px,4.5vw,64px)]"
        : size === "opponent"
          ? "w-[clamp(38px,4vw,58px)]"
          : "w-[clamp(40px,4vw,58px)]";

  const textClass = size === "deck" ? "text-[clamp(10px,0.9vw,13px)]" : "text-lg";
  const isRed = card ? card[1] === "h" || card[1] === "d" : false;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`group relative ${widthClass} aspect-[5/7] rounded-[6px] border transition ${
        hidden
          ? "border-slate-500/70 bg-[linear-gradient(140deg,#263246_0%,#111a2a_100%)]"
          : "border-slate-300 bg-white"
      } ${selected ? "ring-2 ring-cyan-300/65" : ""} ${disabled ? "cursor-not-allowed opacity-25" : "hover:-translate-y-0.5"}`}
    >
      {hidden || !card ? (
        <span className="grid h-full place-items-center text-[11px] font-black text-slate-300">?</span>
      ) : (
        <div className="flex h-full flex-col px-1 py-0.5">
          <span className={`text-left ${textClass} font-black leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}>{card[0]}</span>
          <span className={`flex flex-1 items-center justify-center ${textClass} font-black leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}>
            {SUIT_SYMBOLS[card[1]]}
          </span>
          <span className={`text-right ${textClass} font-black leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}>{card[0]}</span>
        </div>
      )}
      {card && onClear ? (
        <span
          role="button"
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-xs text-white group-hover:flex"
        >
          <X className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </button>
  );
}

function OpponentSeat({
  player,
  position,
  selectedTarget,
  onToggle,
  onSelectCard,
  onClearCard,
}: {
  player: Player;
  position: SeatPosition;
  selectedTarget: ActiveTarget;
  onToggle: () => void;
  onSelectCard: (index: 0 | 1) => void;
  onClearCard: (index: 0 | 1) => void;
}) {
  const selected = (index: 0 | 1) =>
    selectedTarget.zone === "opponent" && selectedTarget.playerId === player.id && selectedTarget.cardIndex === index;
  const seatSelected = selectedTarget.zone === "opponent" && selectedTarget.playerId === player.id;

  return (
    <div
      style={seatStyle(position)}
      className={`opponent-seat z-20 flex min-w-[clamp(92px,8vw,128px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${
        seatSelected ? "drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        title={player.active ? `${player.name} ativo` : `Adicionar ${player.name}`}
        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[clamp(10px,0.8vw,12px)] font-bold tracking-[0.04em] transition ${
          player.active ? "border-white/30 bg-black/35 text-white/90" : "border-white/20 bg-black/25 text-slate-300 hover:border-white/40"
        }`}
      >
        {player.name}
      </button>

      {player.active ? (
        <div className="flex gap-[5px]">
          <PokerCardButton
            card={player.cards[0]}
            hidden={!player.cards[0]}
            size="opponent"
            selected={selected(0)}
            onClick={() => onSelectCard(0)}
            onClear={player.cards[0] ? () => onClearCard(0) : undefined}
            title={`${player.name} carta 1`}
          />
          <PokerCardButton
            card={player.cards[1]}
            hidden={!player.cards[1]}
            size="opponent"
            selected={selected(1)}
            onClick={() => onSelectCard(1)}
            onClear={player.cards[1] ? () => onClearCard(1) : undefined}
            title={`${player.name} carta 2`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          title={`Adicionar ${player.name}`}
          className="grid h-[clamp(24px,2vw,30px)] w-[clamp(24px,2vw,30px)] place-items-center rounded-full border border-white/30 bg-black/30 text-sm font-bold text-slate-100 hover:border-cyan-300/60"
        >
          +
        </button>
      )}
    </div>
  );
}

export function PokerOddsHub() {
  const [players, setPlayers] = useState<Player[]>(createInitialPlayers());
  const [boardCards, setBoardCards] = useState<HoldemBoard>(emptyBoard());
  const [selectedTarget, setSelectedTarget] = useState<ActiveTarget>({ zone: "hero", cardIndex: 0 });
  const [showMobileDeck, setShowMobileDeck] = useState(false);

  const hero = players.find((player) => player.isHero) ?? createInitialPlayers()[0];
  const opponents = players.filter((player) => !player.isHero);
  const activeOpponentCount = opponents.filter((player) => player.active).length;
  const heroFilled = countCards(hero.cards);
  const boardFilled = countCards(boardCards);
  const knownCards = heroFilled + boardFilled + opponents.reduce((sum, item) => sum + countCards(item.cards), 0);

  const simulation = useOddsSimulation(players, boardCards);
  const bestCategory = topCategory(simulation);

  const usedCards = useMemo(
    () =>
      new Set(
        [
          ...boardCards,
          ...players.flatMap((player) => player.cards),
        ].filter(Boolean) as CardCode[],
      ),
    [boardCards, players],
  );

  const selectedLabel = targetLabel(selectedTarget, players);

  function clearTarget(target: ActiveTarget) {
    if (target.zone === "board") {
      setBoardCards((current) => {
        const next = [...current] as HoldemBoard;
        next[target.boardIndex] = null;
        return next;
      });
      setSelectedTarget(target);
      return;
    }

    setPlayers((current) =>
      current.map((player) => {
        if (target.zone === "hero" && player.isHero) {
          const nextCards = [...player.cards] as [CardCode | null, CardCode | null];
          nextCards[target.cardIndex] = null;
          return { ...player, cards: nextCards };
        }
        if (target.zone === "opponent" && player.id === target.playerId) {
          const nextCards = [...player.cards] as [CardCode | null, CardCode | null];
          nextCards[target.cardIndex] = null;
          return { ...player, cards: nextCards };
        }
        return player;
      }),
    );
    setSelectedTarget(target);
  }

  function placeCard(card: CardCode) {
    const nextBoard = [...boardCards] as HoldemBoard;
    const nextPlayers = players.map((player) => ({ ...player, cards: [...player.cards] as [CardCode | null, CardCode | null] }));

    for (let i = 0; i < nextBoard.length; i += 1) {
      if (nextBoard[i] === card) nextBoard[i] = null;
    }
    for (const player of nextPlayers) {
      if (player.cards[0] === card) player.cards[0] = null;
      if (player.cards[1] === card) player.cards[1] = null;
    }

    if (selectedTarget.zone === "board") {
      nextBoard[selectedTarget.boardIndex] = card;
    } else if (selectedTarget.zone === "hero") {
      const heroPlayer = nextPlayers.find((player) => player.isHero);
      if (heroPlayer) heroPlayer.cards[selectedTarget.cardIndex] = card;
    } else {
      const targetPlayer = nextPlayers.find((player) => player.id === selectedTarget.playerId);
      if (targetPlayer) targetPlayer.cards[selectedTarget.cardIndex] = card;
    }

    setBoardCards(nextBoard);
    setPlayers(nextPlayers);

    const nextTarget = nextTargetAfterFill(selectedTarget, nextPlayers, nextBoard);
    if (nextTarget) setSelectedTarget(nextTarget);
    setShowMobileDeck(false);
  }

  function resetAll() {
    setPlayers(createInitialPlayers());
    setBoardCards(emptyBoard());
    setSelectedTarget({ zone: "hero", cardIndex: 0 });
  }

  function randomizeSetup() {
    const shuffled = [...ALL_POKER_CARDS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }

    setPlayers((current) =>
      current.map((player, index) => {
        if (player.isHero) {
          return { ...player, cards: [shuffled[0], shuffled[1]] };
        }
        if (index === 1) return { ...player, active: true, cards: [shuffled[5], shuffled[6]] };
        if (index === 2) return { ...player, active: true, cards: [null, null] };
        if (index === 3) return { ...player, active: true, cards: [null, null] };
        return { ...player, active: false, cards: [null, null] };
      }),
    );
    setBoardCards([shuffled[2], shuffled[3], shuffled[4], null, null]);
    setSelectedTarget({ zone: "board", boardIndex: 3 });
  }

  function selectNextEmptySlot() {
    const next = firstEmptyTarget(players, boardCards);
    if (next) setSelectedTarget(next);
  }

  const activeTargetCard = getTargetCard(selectedTarget, players, boardCards);

  const deckPanel = (
    <Card className="w-full border-white/10 bg-[#0a1627] shadow-none xl:w-[220px]">
      <CardHeader className="px-3 pb-2 pt-3">
        <CardTitle className="flex items-center gap-1 text-sm font-bold">
          <Users className="h-3.5 w-3.5 text-cyan-300" />
          Baralho
        </CardTitle>
        <CardDescription className="text-[11px]">{selectedLabel}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div
          className="grid grid-cols-[16px_repeat(4,var(--deck-w))] auto-rows-[var(--deck-h)] items-center gap-x-[5px] gap-y-[3px]"
          style={{
            ["--deck-w" as string]: "clamp(24px,2.1vw,34px)",
            ["--deck-h" as string]: "calc(var(--deck-w) * 1.4)",
          }}
        >
          {RANKS.map((rank) => {
            const cardsOfRank = ALL_POKER_CARDS.filter((card) => card[0] === rank);
            return (
              <div key={rank} className="contents">
                <div className="grid place-items-center text-[10px] font-bold text-slate-400">{rank}</div>
                {cardsOfRank.map((card) => {
                  const activeHere = activeTargetCard === card;
                  const blocked = usedCards.has(card) && !activeHere;
                  return (
                    <PokerCardButton
                      key={card}
                      card={card}
                      size="deck"
                      selected={activeHere}
                      disabled={blocked}
                      onClick={() => {
                        if (!blocked) placeCard(card);
                      }}
                      title={blocked ? "Carta bloqueada" : "Selecionar carta"}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <section className="mx-auto w-full max-w-[1100px] space-y-3 rounded-[18px] border border-white/10 bg-[#07111f] p-[clamp(10px,1.6vw,16px)] text-slate-50">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[clamp(18px,1.7vw,24px)] font-black tracking-tight">Odds / Equity Texas Hold&apos;em</h1>
            <p className="text-[11px] text-slate-400">Simule mãos, mesa e adversários em tempo real.</p>
          </div>
          <Badge className="border-cyan-300/30 bg-cyan-300/10 text-[11px] text-cyan-100 hover:bg-cyan-300/10">Escolhendo: {selectedLabel}</Badge>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
        <main className="space-y-3">
          <Card className="border-white/10 bg-[#0b1524] p-2.5 text-white shadow-none">
            <div className="relative min-h-[clamp(360px,42vw,500px)] overflow-hidden rounded-[36px] border border-white/12 bg-[radial-gradient(circle_at_20%_10%,rgba(139,92,246,0.15),transparent_34%),radial-gradient(circle_at_82%_85%,rgba(6,182,212,0.14),transparent_38%),linear-gradient(180deg,#0b1020_0%,#070b17_100%)]">
              <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-[linear-gradient(145deg,rgba(255,255,255,0.05),transparent_30%,transparent_70%,rgba(255,255,255,0.03))]" />

              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[84%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-black/55 blur-[30px]" />
              <div className="absolute left-1/2 top-1/2 h-[90%] w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_50%_18%,#2e3460_0%,#1c2050_18%,#131636_38%,#0c0e22_58%,#070915_80%,#040610_100%)] shadow-[0_28px_48px_rgba(0,0,0,0.85),inset_0_4px_16px_rgba(120,130,255,0.18),inset_0_-14px_24px_rgba(0,0,0,0.70)]" />
              <div className="absolute left-1/2 top-1/2 h-[82%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] border-[3px] border-indigo-500/30 bg-[radial-gradient(ellipse_at_50%_20%,#181c34_0%,#0f1224_30%,#090c1c_60%,#050810_100%)] shadow-[inset_0_6px_18px_rgba(99,102,241,0.10),inset_0_-18px_30px_rgba(0,0,0,0.90),inset_0_0_30px_rgba(0,0,0,0.50)]" />
              <div className="absolute left-1/2 top-1/2 h-[76%] w-[87%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] border border-cyan-200/18 bg-[radial-gradient(circle_at_50%_42%,#1f5578_0%,#18476f_33%,#15395c_62%,#26204e_100%)] shadow-[inset_0_2px_5px_rgba(255,255,255,0.12),inset_0_-20px_26px_rgba(0,0,0,0.26)]" />
              <div className="absolute left-1/2 top-1/2 h-[70%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0)_28%)]" />

              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center opacity-[0.38]">
                <img src="/all-in-edge-logo-horizontal.webp" alt="All-in-Edge" className="h-auto w-[clamp(200px,34vw,420px)] max-w-[52%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]" />
              </div>

              {opponents.map((opponent, index) => (
                <OpponentSeat
                  key={opponent.id}
                  player={opponent}
                  position={OPPONENT_POSITIONS[index]}
                  selectedTarget={selectedTarget}
                  onToggle={() => {
                    const willActivate = !opponent.active;
                    setPlayers((current) =>
                      current.map((player) => {
                        if (player.id !== opponent.id) return player;
                        if (player.active) {
                          return { ...player, active: false, cards: [null, null] };
                        }
                        return { ...player, active: true };
                      }),
                    );

                    if (willActivate) {
                      setSelectedTarget({ zone: "opponent", playerId: opponent.id, cardIndex: 0 });
                    } else if (selectedTarget.zone === "opponent" && selectedTarget.playerId === opponent.id) {
                      const next = firstEmptyTarget(players, boardCards);
                      if (next) setSelectedTarget(next);
                    }
                  }}
                  onSelectCard={(cardIndex) => setSelectedTarget({ zone: "opponent", playerId: opponent.id, cardIndex })}
                  onClearCard={(cardIndex) => clearTarget({ zone: "opponent", playerId: opponent.id, cardIndex })}
                />
              ))}

              <div className="board-area absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
                <div className="flex gap-1.5 sm:gap-2">
                  {BOARD_LABELS.map((label, index) => (
                    <PokerCardButton
                      key={label}
                      card={boardCards[index]}
                      hidden={!boardCards[index]}
                      size="board"
                      selected={selectedTarget.zone === "board" && selectedTarget.boardIndex === index}
                      onClick={() => setSelectedTarget({ zone: "board", boardIndex: index as 0 | 1 | 2 | 3 | 4 })}
                      onClear={boardCards[index] ? () => clearTarget({ zone: "board", boardIndex: index as 0 | 1 | 2 | 3 | 4 }) : undefined}
                      title={label}
                    />
                  ))}
                </div>
              </div>

              <div style={seatStyle(HERO_POSITION)} className="hero-seat z-20">
                <div className="flex flex-col items-center gap-1">
                  <span className="rounded-full border border-amber-200/30 bg-black/25 px-2 py-0.5 text-[9px] tracking-[0.12em] text-amber-100">HERO</span>
                  <div className="flex gap-1.5 sm:gap-2">
                    {HERO_LABELS.map((label, index) => (
                      <PokerCardButton
                        key={label}
                        card={hero.cards[index]}
                        hidden={!hero.cards[index]}
                        size="hero"
                        selected={selectedTarget.zone === "hero" && selectedTarget.cardIndex === index}
                        onClick={() => setSelectedTarget({ zone: "hero", cardIndex: index as 0 | 1 })}
                        onClear={hero.cards[index] ? () => clearTarget({ zone: "hero", cardIndex: index as 0 | 1 }) : undefined}
                        title={label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-white/10 bg-[#0a1627] shadow-none">
            <CardContent className="grid gap-3 p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/12 bg-[rgba(7,17,31,0.72)] p-3.5">
                  <div className="mb-2.5 text-[13px] font-bold text-white/80">Você</div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="min-w-0 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/65">Equidade</div>
                      <div className="whitespace-nowrap text-[clamp(28px,3vw,42px)] font-extrabold leading-none text-white">{simulation.ok ? pct(simulation.heroEquityPct) : "--"}</div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-[rgba(15,23,42,0.86)] px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/65">Ganhar</div>
                      <div className="whitespace-nowrap text-[clamp(20px,2.1vw,30px)] font-extrabold leading-none text-white">{simulation.ok ? pct(simulation.heroWinsPct) : "--"}</div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-[rgba(15,23,42,0.86)] px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/65">Empatar</div>
                      <div className="whitespace-nowrap text-[clamp(20px,2.1vw,30px)] font-extrabold leading-none text-white">{simulation.ok ? pct(simulation.heroTiesPct) : "--"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/12 bg-[rgba(7,17,31,0.72)] p-3.5">
                  <div className="mb-2.5 text-[13px] font-bold text-white/80">Outros</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0 rounded-xl border border-white/10 bg-[rgba(15,23,42,0.86)] px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/65">Ganhar</div>
                      <div className="whitespace-nowrap text-[clamp(20px,2.1vw,30px)] font-extrabold leading-none text-white">{simulation.ok ? pct(simulation.othersWinsPct) : "--"}</div>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-[rgba(15,23,42,0.86)] px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/65">Empatar</div>
                      <div className="whitespace-nowrap text-[clamp(20px,2.1vw,30px)] font-extrabold leading-none text-white">{simulation.ok ? pct(simulation.othersTiesPct) : "--"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"><span className="text-[11px] font-semibold text-slate-400">Adversários</span><span className="font-black text-white">{activeOpponentCount}</span></div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"><span className="text-[11px] font-semibold text-slate-400">Cartas conhecidas</span><span className="font-black text-white">{knownCards}/25</span></div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"><span className="text-[11px] font-semibold text-slate-400">Melhor mão</span><span className="font-black text-white">{bestCategory ? CATEGORY_LABELS[bestCategory.key] : "--"}</span></div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <details className="rounded-lg border border-white/10 bg-background/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold">
                    <span>Ranking das mãos</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </summary>
                  <div className="space-y-1.5 px-3 pb-3">
                    {simulation.ok ? (
                      CATEGORY_ORDER.map((category) => {
                        const heroPct = simulation.heroCategoryPct[category];
                        const otherPct = simulation.opponentsCategoryPct[category];
                        return (
                          <div key={category} className="rounded-md border border-border/60 p-1.5">
                            <div className="mb-1 text-[10px] font-semibold text-muted-foreground">{CATEGORY_LABELS[category]}</div>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <div className="mb-0.5">Você {pct(heroPct)}</div>
                                <div className="h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-cyan-400" style={{ width: `${Math.min(100, heroPct)}%` }} /></div>
                              </div>
                              <div>
                                <div className="mb-0.5">Outros {pct(otherPct)}</div>
                                <div className="h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, otherPct)}%` }} /></div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">Estado vazio.</p>
                    )}
                  </div>
                </details>

                <div className="grid gap-2 md:w-[178px]">
                  <Button className="h-8 w-full justify-start text-xs" onClick={selectNextEmptySlot}><Target className="mr-2 h-3.5 w-3.5" />Próximo slot</Button>
                  <Button className="h-8 w-full justify-start text-xs" variant="secondary" onClick={randomizeSetup}><Dices className="mr-2 h-3.5 w-3.5" />Exemplo</Button>
                  <Button className="h-8 w-full justify-start text-xs" variant="outline" onClick={resetAll}><RefreshCw className="mr-2 h-3.5 w-3.5" />Limpar</Button>
                  <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">Baralho 13x4 ativo com bloqueio global de cartas usadas.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        <aside className="hidden xl:block">{deckPanel}</aside>
      </div>

      <div className="hidden lg:block xl:hidden">{deckPanel}</div>

      <div className="fixed bottom-3 left-0 right-0 z-40 px-4 lg:hidden">
        <Button className="w-full" onClick={() => setShowMobileDeck(true)}>Escolher carta ({selectedLabel})</Button>
      </div>

      {showMobileDeck ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 lg:hidden">
          <div className="max-h-[86vh] w-full overflow-auto rounded-t-2xl border border-white/10 bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Escolher carta</div>
                <div className="text-xs text-muted-foreground">{selectedLabel}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowMobileDeck(false)}>Fechar</Button>
            </div>
            {deckPanel}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function OddsCalculator() {
  return <PokerOddsHub />;
}
