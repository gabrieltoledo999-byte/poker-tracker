import { parseGGHandHistory, isGGHandHistory } from "./ggHandHistory";
import { ggHandHistoryToSessionData } from "./ggIntegration";

// Exemplo de hand history simples do GG
const testGGHandHistory = `
GGPoker #1234567890 | NLHE | Sb 0.50 Bb 1.00 | 6-max

Seat 1: Dealer (12.50)
Seat 2: SmallBlind (15.75)
Seat 3: BigBlind (20.00)
Seat 4: UTG (11.25)
Seat 5: HJ (Hero) (18.50)
Seat 6: CO (22.30)

Pre-flop:
UTG: folds
Hero: raises to 3.00
CO: calls 3.00

Flop: [As Kh Qd]
Hero: bets 5.00
CO: raises to 12.00

Total pot: 91.00
`;

console.log("=== GG Hand History Parser Test ===\n");

// Test 1: Detection
console.log("Test 1: Detect GG Hand History");
const isGG = isGGHandHistory(testGGHandHistory);
console.log(`Result: ${isGG ? "✓ PASSED" : "✗ FAILED"}`);
console.log(`Detected as GG: ${isGG}\n`);

// Test 2: Parse Hand History
console.log("Test 2: Parse GG Hand History");
const parsed = parseGGHandHistory(testGGHandHistory);
if (parsed) {
  console.log("✓ PASSED");
  console.log(`Hand ID: ${parsed.handId}`);
  console.log(`Stakes: ${parsed.stakes}`);
  console.log(`Hero: ${parsed.hero}`);
  console.log(`Hero Position: ${parsed.heroPosicao}`);
  console.log(`Hero Cards: ${parsed.heroCards?.join("-")}`);
  console.log(`Start Stack: $${(parsed.heroStartStack / 100).toFixed(2)}`);
  console.log(`Final Stack: $${(parsed.heroFinalStack / 100).toFixed(2)}`);
  console.log(`Pot Size: $${(parsed.potSize / 100).toFixed(2)}`);
  console.log(`Result: ${parsed.result}`);
  console.log(`Streets: ${parsed.streets?.length}\n`);
} else {
  console.log("✗ FAILED - Parsing returned null\n");
}

// Test 3: Convert to Session Data
console.log("Test 3: Convert to Session Data");
const sessionData = ggHandHistoryToSessionData(testGGHandHistory);
if (sessionData) {
  console.log("✓ PASSED");
  console.log(`Buy-in: $${(sessionData.buyIn / 100).toFixed(2)}`);
  console.log(`Cash-out: $${(sessionData.cashOut / 100).toFixed(2)}`);
  console.log(`Stakes: ${sessionData.stakes}`);
  console.log(`Warnings: ${sessionData.warnings.length}`);
  sessionData.warnings.forEach((w) => console.log(`  - ${w}`));
  console.log(`Notes (first 200 chars): ${sessionData.notes.substring(0, 200)}...\n`);
} else {
  console.log("✗ FAILED - Conversion returned null\n");
}

console.log("=== All Tests Complete ===");
