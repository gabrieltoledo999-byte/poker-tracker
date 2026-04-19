import type { ParsedPokerStarsHand, PokerAction, PokerStreet } from "@/parser/pokerstarsParser";
import { calculatePotFromActions } from "@/utils/potCalculator";

export interface ReplaySeatState {
  seat: number;
  name: string;
  position: string;
  startingStack: number;
  stackApprox: number;
  contributedCurrentRound: number;
  forcedPosted: {
    ante?: number;
    smallBlind?: number;
    bigBlind?: number;
  };
  holeCards: string[];
  revealedCards: string[];
  isHero: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  status: "active" | "folded" | "all-in" | "sitting_out";
  lastAction: string;
}

export interface ReplayStep {
  stepIndex: number;
  street: PokerStreet;
  actingPlayer: string | null;
  action: PokerAction | null;
  actionLabel: string;
  actionAmount: number;
  pot: number;
  board: string[];
  seats: ReplaySeatState[];
}

type ForcedPostingKind = "ante" | "small_blind" | "big_blind";

type ForcedPosting = {
  kind: ForcedPostingKind;
  player: string;
  amount: number;
  action: PokerAction;
};

export function formatActionBadge(action: PokerAction): string {
  if (action.action === "fold") return "Fold";
  if (action.action === "check") return "Check";
  if (action.action === "call") return action.isAllIn ? `All-in ${action.amount ?? 0}` : `Call ${action.amount ?? 0}`;
  if (action.action === "bet") return action.isAllIn ? `All-in ${action.amount ?? 0}` : `Bet ${action.amount ?? 0}`;
  if (action.action === "raise") return action.isAllIn ? `All-in ${action.toAmount ?? action.amount ?? 0}` : `Raise to ${action.toAmount ?? action.amount ?? 0}`;
  if (action.action === "post_ante") return `Ante ${action.amount ?? 0}`;
  if (action.action === "post_small_blind") return `SB ${action.amount ?? 0}`;
  if (action.action === "post_big_blind") return `BB ${action.amount ?? 0}`;
  if (action.action === "all_in") return "All-in";
  if (action.action === "show") return "Show";
  if (action.action === "collect") return `Collect ${action.amount ?? 0}`;
  if (action.action === "returned_uncalled_bet") return `Returned ${action.amount ?? 0}`;
  return action.raw;
}

function boardForStreet(hand: ParsedPokerStarsHand, street: PokerStreet): string[] {
  if (street === "preflop") return [];
  if (street === "flop") return [...hand.board.flop];
  if (street === "turn") return [...hand.board.flop, ...hand.board.turn];
  if (street === "river" || street === "showdown" || street === "summary") {
    return hand.board.full.length > 0 ? [...hand.board.full] : [...hand.board.flop, ...hand.board.turn, ...hand.board.river];
  }
  return [];
}

function parseCardsFromRawAction(raw: string): string[] {
  const match = raw.match(/\[([^\]]+)\]/);
  if (!match?.[1]) return [];
  return match[1].trim().split(/\s+/).filter(Boolean);
}

function getActionDelta(action: PokerAction): number {
  if (action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind" || action.action === "call" || action.action === "bet") {
    return action.amount ?? 0;
  }
  if (action.action === "raise") {
    return action.toAmount ?? action.amount ?? 0;
  }
  if (action.action === "returned_uncalled_bet") {
    return action.amount ?? 0;
  }
  return 0;
}

function isForcedPostingAction(action: PokerAction): boolean {
  return action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind";
}

function isReplayHiddenAction(action: PokerAction): boolean {
  return action.action === "returned_uncalled_bet";
}

function toForcedPosting(action: PokerAction): ForcedPosting | null {
  const amount = action.amount ?? 0;
  if (amount <= 0) return null;

  if (action.action === "post_ante") {
    return { kind: "ante", player: action.player, amount, action };
  }
  if (action.action === "post_small_blind") {
    return { kind: "small_blind", player: action.player, amount, action };
  }
  if (action.action === "post_big_blind") {
    return { kind: "big_blind", player: action.player, amount, action };
  }
  return null;
}

function applyActionToSeat(seat: ReplaySeatState, action: PokerAction): ReplaySeatState {
  const next = { ...seat };
  next.lastAction = formatActionBadge(action);

  if (action.action === "fold") next.status = "folded";
  if (action.isAllIn || action.action === "all_in") next.status = "all-in";

  const amount = action.amount ?? 0;

  // For call, bet, and other action types, add the amount to contribution
  if (action.action === "call") {
    // Call amount in PokerStars transcript is usually delta (what player adds now).
    // If toAmount is unavailable, derive target from current contribution + delta.
    const target = action.toAmount ?? (next.contributedCurrentRound + amount);
    const amountAdded = Math.max(0, target - next.contributedCurrentRound);
    next.stackApprox = Math.max(next.stackApprox - amountAdded, 0);
    next.contributedCurrentRound += amountAdded;
  }

  if (action.action === "bet") {
    // Bet is a new amount in the current street
    next.stackApprox = Math.max(next.stackApprox - amount, 0);
    next.contributedCurrentRound += amount;
  }

  if (action.action === "post_ante") {
    next.stackApprox = Math.max(next.stackApprox - amount, 0);
    next.forcedPosted.ante = amount;
  }

  if (action.action === "post_small_blind") {
    next.stackApprox = Math.max(next.stackApprox - amount, 0);
    next.forcedPosted.smallBlind = amount;
    next.contributedCurrentRound += amount;
  }

  if (action.action === "post_big_blind") {
    next.stackApprox = Math.max(next.stackApprox - amount, 0);
    next.forcedPosted.bigBlind = amount;
    next.contributedCurrentRound += amount;
  }

  if (action.action === "raise") {
    // Raise: toAmount is the total amount to commit
    const target = action.toAmount ?? amount;
    const amountAdded = Math.max(0, target - next.contributedCurrentRound);
    next.stackApprox = Math.max(next.stackApprox - amountAdded, 0);
    next.contributedCurrentRound = target;
  }

  if (action.action === "returned_uncalled_bet") {
    next.stackApprox += amount;
  }

  if (action.action === "collect") {
    next.stackApprox += amount;
  }

  if (action.action === "show") {
    const shown = parseCardsFromRawAction(action.raw);
    if (shown.length > 0) next.revealedCards = shown;
  }

  return next;
}

function initialSeats(hand: ParsedPokerStarsHand): ReplaySeatState[] {
  const sbPlayer = hand.actions.find(action => action.action === "post_small_blind")?.player;
  const bbPlayer = hand.actions.find(action => action.action === "post_big_blind")?.player;

  return hand.seats.map(seat => ({
    seat: seat.seatNumber,
    name: seat.playerName,
    position: seat.position,
    startingStack: seat.startingStack,
    stackApprox: seat.startingStack,
    contributedCurrentRound: 0,
    forcedPosted: {},
    holeCards: seat.isHero ? [...hand.heroCards] : [],
    revealedCards: [],
    isHero: seat.isHero,
    // Use parsed table position to keep dealer logic correct even when seat numbers are sparse.
    isButton: seat.position === "BTN" || seat.seatNumber === hand.buttonSeat,
    isSmallBlind: seat.playerName === sbPlayer,
    isBigBlind: seat.playerName === bbPlayer,
    status: seat.isSittingOut ? "sitting_out" : "active",
    lastAction: "-",
  }));
}

function initializeHandState(hand: ParsedPokerStarsHand): {
  seats: ReplaySeatState[];
  forcedActions: PokerAction[];
  voluntaryActions: PokerAction[];
  initialPot: number;
} {
  const forcedActions = hand.actions.filter(isForcedPostingAction);
  const voluntaryActions = hand.actions.filter(action => !isForcedPostingAction(action));
  const forcedPostings = forcedActions.map(toForcedPosting).filter((item): item is ForcedPosting => item != null);

  let seats = initialSeats(hand);
  for (const posting of forcedPostings) {
    seats = seats.map(seat => {
      if (seat.name !== posting.player) return seat;

      const next: ReplaySeatState = {
        ...seat,
        stackApprox: Math.max(seat.stackApprox - posting.amount, 0),
        forcedPosted: { ...seat.forcedPosted },
      };

      if (posting.kind === "ante") {
        next.forcedPosted.ante = posting.amount;
      }

      if (posting.kind === "small_blind") {
        next.forcedPosted.smallBlind = posting.amount;
        next.contributedCurrentRound += posting.amount;
        next.lastAction = `SB ${posting.amount}`;
      }

      if (posting.kind === "big_blind") {
        next.forcedPosted.bigBlind = posting.amount;
        next.contributedCurrentRound += posting.amount;
        next.lastAction = `BB ${posting.amount}`;
      }

      return next;
    });
  }

  const initialPot = forcedPostings.reduce((sum, posting) => sum + posting.amount, 0);
  return { seats, forcedActions, voluntaryActions, initialPot };
}

export function buildReplaySteps(hand: ParsedPokerStarsHand): ReplayStep[] {
  const { seats: initializedSeats, forcedActions, voluntaryActions, initialPot } = initializeHandState(hand);
  const baseSeats = initializedSeats;
  const steps: ReplayStep[] = [
    {
      stepIndex: 0,
      street: "preflop",
      actingPlayer: null,
      action: null,
      actionLabel: "Mesa inicializada",
      actionAmount: 0,
      pot: initialPot,
      board: [],
      seats: baseSeats,
    },
  ];

  let seats = baseSeats;
  let currentStreet: PokerStreet = "preflop";
  const appliedActions: PokerAction[] = [...forcedActions];
  let visibleStepIndex = 1;

  voluntaryActions.forEach((action) => {
    if (action.street !== currentStreet) {
      currentStreet = action.street;
      seats = seats.map(seat => ({ ...seat, contributedCurrentRound: 0 }));
    }

    seats = seats.map(seat => (seat.name === action.player ? applyActionToSeat(seat, action) : seat));
    appliedActions.push(action);

    if (isReplayHiddenAction(action)) {
      return;
    }

    if (action.street === "showdown" || action.street === "summary") {
      const showdownMap = new Map<string, string[]>();
      if (hand.summary.heroShowed.length > 0) showdownMap.set(hand.heroName, [...hand.summary.heroShowed]);
      hand.summary.villainCards.forEach(villain => {
        showdownMap.set(villain.player, [...villain.cards]);
      });
      if (showdownMap.size > 0) {
        seats = seats.map(seat => {
          const cards = showdownMap.get(seat.name);
          if (!cards || cards.length === 0) return seat;
          return { ...seat, revealedCards: cards };
        });
      }
    }

    const actionLabel = formatActionBadge(action);
    const actionAmount = getActionDelta(action);

    steps.push({
      stepIndex: visibleStepIndex,
      street: action.street,
      actingPlayer: action.player,
      action,
      actionLabel,
      actionAmount,
      pot: calculatePotFromActions(appliedActions),
      board: boardForStreet(hand, action.street),
      seats,
    });

    visibleStepIndex += 1;
  });

  if (steps.length === 1) {
    steps[0] = {
      ...steps[0],
      actionLabel: "Mão pronta para ação",
      board: boardForStreet(hand, "summary"),
      pot: hand.summary.totalPot,
    };
  }

  const finalStep = steps[steps.length - 1];
  const expectedTotalPot = hand.summary.totalPot;
  if (finalStep && Number.isFinite(expectedTotalPot) && expectedTotalPot > 0 && finalStep.pot !== expectedTotalPot) {
    console.error("[ReplayPotValidation] Divergência detectada", {
      handId: hand.handId,
      hero: hand.heroName,
      replayPot: finalStep.pot,
      summaryTotalPot: expectedTotalPot,
      difference: finalStep.pot - expectedTotalPot,
    });
  }

  return steps;
}

export function actionIndexToStep(actionIndex: number): number {
  return actionIndex + 1;
}

export function stepToStreet(step: ReplayStep): "preflop" | "flop" | "turn" | "river" | "showdown" {
  if (step.street === "summary") return "showdown";
  return step.street;
}
