import { describe, expect, it } from "vitest";

import { parsePokerStarsTranscript } from "@/lib/pokerstars-transcript";

describe("parsePokerStarsTranscript", () => {
  it("parses hero seats and positions when seat lines include bounty text", () => {
    const transcript = `Transcript for tournament #3994841634 requested by Hugo Vigil (hugoa_vigil@hotmail.com)

*********** # 1 **************
PokerStars Hand #260610472796: Tournament #3994841634, $2.50+$2.40+$0.60 USD Hold'em No Limit - Level VIII (100/200) - 2026/04/27 12:42:33 BRT [2026/04/27 11:42:33 ET]
Table '3994841634 27' 5-max Seat #2 is the button
Seat 1: NickTrikala$ (6476 in chips, $2.40 bounty)
Seat 2: Hugo Vigil (5425 in chips, $2.40 bounty)
Seat 3: superguga46 (5000 in chips) out of hand (moved from another table into small blind)
Seat 4: chaparritaaa (9571 in chips, $3.60 bounty)
Seat 5: JLL.Kerouac (2098 in chips, $2.40 bounty)
superguga46 will be allowed to play after the button
NickTrikala$: posts the ante 25
Hugo Vigil: posts the ante 25
chaparritaaa: posts the ante 25
JLL.Kerouac: posts the ante 25
chaparritaaa: posts small blind 100
JLL.Kerouac: posts big blind 200
*** HOLE CARDS ***
Dealt to Hugo Vigil [Ac Th]
NickTrikala$: folds
Hugo Vigil: raises 240 to 440
chaparritaaa: folds
JLL.Kerouac: folds
Uncalled bet (240) returned to Hugo Vigil
Hugo Vigil collected 600 from pot
Hugo Vigil: doesn't show hand
*** SUMMARY ***
Total pot 600 | Rake 0
Seat 1: NickTrikala$ folded before Flop (didn't bet)
Seat 2: Hugo Vigil (button) collected (600)
Seat 4: chaparritaaa (small blind) folded before Flop
Seat 5: JLL.Kerouac (big blind) folded before Flop
`;

    const parsed = parsePokerStarsTranscript(transcript);
    expect(parsed.header.heroName).toBe("Hugo Vigil");
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.hands[0]?.heroSeat).toBe(2);
    expect(parsed.hands[0]?.heroPosition).toBe("BTN");
    expect(parsed.hands[0]?.seats).toHaveLength(5);
    expect(parsed.hands[0]?.seats.find((seat) => seat.playerName === "Hugo Vigil")?.position).toBe("BTN");
    expect(parsed.hands[0]?.seats.find((seat) => seat.playerName === "superguga46")?.position).toBe("");
  });

  it("marks hero as lost when folding after voluntary investment", () => {
    const transcript = `Transcript for tournament #123 requested by Hugo Vigil (hugoa_vigil@hotmail.com)

*********** # 1 **************
PokerStars Hand #1: Tournament #123, $2.50+$2.40+$0.60 USD Hold'em No Limit - Level I (50/100) - 2026/04/27 12:00:00 BRT [2026/04/27 11:00:00 ET]
Table '123 1' 3-max Seat #1 is the button
Seat 1: Hugo Vigil (5000 in chips)
Seat 2: VillainA (5000 in chips)
Seat 3: VillainB (5000 in chips)
VillainA: posts small blind 50
VillainB: posts big blind 100
*** HOLE CARDS ***
Dealt to Hugo Vigil [Ah Qh]
Hugo Vigil: raises 200 to 300
VillainA: calls 250
VillainB: folds
*** FLOP *** [Ks 7d 2c]
VillainA: checks
Hugo Vigil: bets 200
VillainA: calls 200
*** TURN *** [Ks 7d 2c] [9s]
VillainA: bets 500
Hugo Vigil: folds
Uncalled bet (500) returned to VillainA
VillainA collected 1100 from pot
*** SUMMARY ***
Total pot 1100 | Rake 0
Seat 1: Hugo Vigil (button) folded on the Turn
Seat 2: VillainA (small blind) collected (1100)
Seat 3: VillainB (big blind) folded before Flop
`;

    const parsed = parsePokerStarsTranscript(transcript);
    expect(parsed.hands[0]?.summary.heroResult).toBe("lost");
  });

  it("keeps pure preflop no-investment fold as folded", () => {
    const transcript = `Transcript for tournament #123 requested by Hugo Vigil (hugoa_vigil@hotmail.com)

*********** # 1 **************
PokerStars Hand #2: Tournament #123, $2.50+$2.40+$0.60 USD Hold'em No Limit - Level I (50/100) - 2026/04/27 12:01:00 BRT [2026/04/27 11:01:00 ET]
Table '123 1' 3-max Seat #1 is the button
Seat 1: Hugo Vigil (5000 in chips)
Seat 2: VillainA (5000 in chips)
Seat 3: VillainB (5000 in chips)
VillainA: posts small blind 50
VillainB: posts big blind 100
*** HOLE CARDS ***
Dealt to Hugo Vigil [7c 2d]
Hugo Vigil: folds
VillainA: folds
Uncalled bet (100) returned to VillainB
VillainB collected 150 from pot
*** SUMMARY ***
Total pot 150 | Rake 0
Seat 1: Hugo Vigil (button) folded before Flop (didn't bet)
Seat 2: VillainA (small blind) folded before Flop
Seat 3: VillainB (big blind) collected (150)
`;

    const parsed = parsePokerStarsTranscript(transcript);
    expect(parsed.hands[0]?.summary.heroResult).toBe("folded");
  });
});
