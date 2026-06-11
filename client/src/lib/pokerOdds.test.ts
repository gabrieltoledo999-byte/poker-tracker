import { describe, expect, it } from "vitest";
import {
  cardCodeToCard,
  compareHands,
  evaluateFiveCards,
  evaluateSevenCards,
  simulateEquity,
  type CardCode,
} from "./pokerOdds";

function toCards(codes: CardCode[]) {
  return codes.map(cardCodeToCard);
}

describe("poker hand evaluator", () => {
  it("evaluates royal flush as highest category", () => {
    const hand = evaluateFiveCards(toCards(["Ah", "Kh", "Qh", "Jh", "Th"]));
    expect(hand.category).toBe(9);
    expect(hand.tiebreakers).toEqual([14]);
  });

  it("evaluates wheel straight with high card 5", () => {
    const hand = evaluateFiveCards(toCards(["Ah", "2d", "3c", "4s", "5h"]));
    expect(hand.category).toBe(4);
    expect(hand.tiebreakers).toEqual([5]);
  });

  it("evaluates full house from seven cards with two trips", () => {
    const hand = evaluateSevenCards(toCards(["Ah", "Ad", "Ac", "Kh", "Kd", "Kc", "2s"]));
    expect(hand.category).toBe(6);
    expect(hand.tiebreakers).toEqual([14, 13]);
  });

  it("compares tiebreakers when categories are equal", () => {
    const a = evaluateFiveCards(toCards(["Ah", "Ad", "Kc", "9d", "4s"]));
    const b = evaluateFiveCards(toCards(["Ah", "As", "Qc", "Jd", "8s"]));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });
});

describe("equity simulation", () => {
  it("returns 100% win and equity for locked unbeatable hero hand", () => {
    const result = simulateEquity({
      heroCards: ["Ah", "Ad"],
      boardCards: ["As", "Ac", "2d", "2c", "3h"],
      opponents: [{ cards: ["Kd", "Qd"] }],
      iterations: 300,
    });

    expect(result.ok).toBe(true);
    expect(result.heroWinsPct).toBe(100);
    expect(result.heroTiesPct).toBe(0);
    expect(result.heroEquityPct).toBe(100);
  });
});
