import { and, asc, eq } from "drizzle-orm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import {
  centralHandActions,
  centralHands,
  centralTournaments,
  playerTournamentStats,
  showdownRecords,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  analyzeReplayTournament,
  refreshFieldAbiAggregates,
  refreshUserAbiAggregates,
  type ImportReplayInput,
} from "./centralMemory";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

function toDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

async function run() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available. Check DATABASE_URL.");
  }

  const tournaments = await db
    .select({
      id: centralTournaments.id,
      userId: centralTournaments.userId,
      externalTournamentId: centralTournaments.externalTournamentId,
      site: centralTournaments.site,
      format: centralTournaments.format,
      buyIn: centralTournaments.buyIn,
      fee: centralTournaments.fee,
      currency: centralTournaments.currency,
      importedAt: centralTournaments.importedAt,
      totalHands: centralTournaments.totalHands,
      finalPosition: centralTournaments.finalPosition,
      wasEliminated: centralTournaments.wasEliminated,
      rawSourceId: centralTournaments.rawSourceId,
      abiBucket: centralTournaments.abiBucket,
      totalCost: centralTournaments.totalCost,
    })
    .from(centralTournaments)
    .orderBy(asc(centralTournaments.id));

  if (tournaments.length === 0) {
    console.log("No tournaments found. Nothing to recalculate.");
    return;
  }

  console.log(`Found ${tournaments.length} tournament(s) to recalculate.`);

  const touchedUsers = new Set<number>();
  const touchedSiteBuckets = new Set<string>();
  const failed: Array<{ tournamentId: number; userId: number; reason: string }> = [];
  let successCount = 0;

  for (let i = 0; i < tournaments.length; i += 1) {
    const tournament = tournaments[i];
    if (!tournament) continue;

    try {
      const handsRows = await db
        .select({
          id: centralHands.id,
          externalHandId: centralHands.externalHandId,
          handNumber: centralHands.handNumber,
          datetimeOriginal: centralHands.datetimeOriginal,
          buttonSeat: centralHands.buttonSeat,
          heroSeat: centralHands.heroSeat,
          heroPosition: centralHands.heroPosition,
          smallBlind: centralHands.smallBlind,
          bigBlind: centralHands.bigBlind,
          ante: centralHands.ante,
          board: centralHands.board,
          heroCards: centralHands.heroCards,
          totalPot: centralHands.totalPot,
          rake: centralHands.rake,
          result: centralHands.result,
          showdown: centralHands.showdown,
        })
        .from(centralHands)
        .where(and(eq(centralHands.userId, tournament.userId), eq(centralHands.tournamentId, tournament.id)))
        .orderBy(asc(centralHands.id));

      const handRefById = new Map<number, string>();
      const hands = handsRows.map((hand) => {
        const handRef = String(hand.id);
        handRefById.set(hand.id, handRef);
        return {
          handRef,
          externalHandId: hand.externalHandId ?? undefined,
          handNumber: hand.handNumber ?? undefined,
          datetimeOriginal: toDate(hand.datetimeOriginal),
          buttonSeat: hand.buttonSeat ?? undefined,
          heroSeat: hand.heroSeat ?? undefined,
          heroPosition: hand.heroPosition ?? undefined,
          smallBlind: Number(hand.smallBlind ?? 0),
          bigBlind: Number(hand.bigBlind ?? 0),
          ante: Number(hand.ante ?? 0),
          board: hand.board ?? undefined,
          heroCards: hand.heroCards ?? undefined,
          totalPot: hand.totalPot ?? undefined,
          rake: hand.rake ?? undefined,
          result: hand.result ?? undefined,
          showdown: Number(hand.showdown ?? 0) === 1,
        };
      });

      const actionsRows = await db
        .select({
          handId: centralHandActions.handId,
          street: centralHandActions.street,
          actionOrder: centralHandActions.actionOrder,
          playerName: centralHandActions.playerName,
          seat: centralHandActions.seat,
          position: centralHandActions.position,
          actionType: centralHandActions.actionType,
          amount: centralHandActions.amount,
          toAmount: centralHandActions.toAmount,
          stackBefore: centralHandActions.stackBefore,
          stackAfter: centralHandActions.stackAfter,
          potBefore: centralHandActions.potBefore,
          potAfter: centralHandActions.potAfter,
          isAllIn: centralHandActions.isAllIn,
          isForced: centralHandActions.isForced,
          facingActionType: centralHandActions.facingActionType,
          facingSizeBb: centralHandActions.facingSizeBb,
          heroInHand: centralHandActions.heroInHand,
          showdownVisible: centralHandActions.showdownVisible,
          contextJson: centralHandActions.contextJson,
        })
        .from(centralHandActions)
        .where(and(eq(centralHandActions.userId, tournament.userId), eq(centralHandActions.tournamentId, tournament.id)))
        .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

      const actions = actionsRows
        .map((action) => {
          const handRef = handRefById.get(Number(action.handId));
          if (!handRef) return null;
          return {
            handRef,
            street: action.street,
            actionOrder: Number(action.actionOrder ?? 0),
            playerName: action.playerName,
            seat: action.seat ?? undefined,
            position: action.position ?? undefined,
            actionType: action.actionType,
            amount: action.amount ?? undefined,
            toAmount: action.toAmount ?? undefined,
            stackBefore: action.stackBefore ?? undefined,
            stackAfter: action.stackAfter ?? undefined,
            potBefore: action.potBefore ?? undefined,
            potAfter: action.potAfter ?? undefined,
            isAllIn: Number(action.isAllIn ?? 0) === 1,
            isForced: Number(action.isForced ?? 0) === 1,
            facingActionType: action.facingActionType ?? undefined,
            facingSizeBb: action.facingSizeBb ?? undefined,
            heroInHand: Number(action.heroInHand ?? 0) === 1,
            showdownVisible: Number(action.showdownVisible ?? 0) === 1,
            contextJson: action.contextJson ?? undefined,
          };
        })
        .filter((action): action is NonNullable<typeof action> => action !== null);

      const showdownRows = await db
        .select({
          handId: showdownRecords.handId,
          playerName: showdownRecords.playerName,
          seat: showdownRecords.seat,
          position: showdownRecords.position,
          holeCards: showdownRecords.holeCards,
          finalHandDescription: showdownRecords.finalHandDescription,
          wonPot: showdownRecords.wonPot,
          amountWon: showdownRecords.amountWon,
        })
        .from(showdownRecords)
        .where(and(eq(showdownRecords.userId, tournament.userId), eq(showdownRecords.tournamentId, tournament.id)))
        .orderBy(asc(showdownRecords.handId));

      const showdowns = showdownRows
        .map((show) => {
          const handRef = handRefById.get(Number(show.handId));
          if (!handRef) return null;
          return {
            handRef,
            playerName: show.playerName,
            seat: show.seat ?? undefined,
            position: show.position ?? undefined,
            holeCards: show.holeCards ?? undefined,
            finalHandDescription: show.finalHandDescription ?? undefined,
            wonPot: Number(show.wonPot ?? 0) === 1,
            amountWon: show.amountWon ?? undefined,
          };
        })
        .filter((show): show is NonNullable<typeof show> => show !== null);

      const input: ImportReplayInput = {
        tournament: {
          externalTournamentId: tournament.externalTournamentId ?? undefined,
          site: tournament.site,
          format: tournament.format,
          buyIn: Number(tournament.buyIn ?? 0),
          fee: Number(tournament.fee ?? 0),
          currency: tournament.currency,
          importedAt: toDate(tournament.importedAt),
          totalHands: Number(tournament.totalHands ?? hands.length),
          finalPosition: tournament.finalPosition ?? undefined,
          wasEliminated: Number(tournament.wasEliminated ?? 0) === 1,
          rawSourceId: tournament.rawSourceId ?? undefined,
        },
        hands,
        actions,
        showdowns,
      };

      const analysis = await analyzeReplayTournament(input);

      await db.delete(playerTournamentStats).where(
        and(
          eq(playerTournamentStats.userId, tournament.userId),
          eq(playerTournamentStats.tournamentId, tournament.id),
        ),
      );

      await db.insert(playerTournamentStats).values({
        userId: tournament.userId,
        tournamentId: tournament.id,
        handsPlayed: hands.length,
        vpip: Number(analysis.stats.vpip ?? 0),
        pfr: Number(analysis.stats.pfr ?? 0),
        threeBet: Number(analysis.stats.threeBet ?? 0),
        cbetFlop: Number(analysis.stats.cbetFlop ?? 0),
        cbetTurn: Number(analysis.stats.cbetTurn ?? 0),
        foldToCbet: Number(analysis.stats.foldToCbet ?? 0),
        bbDefense: Number(analysis.stats.bbDefense ?? 0),
        stealAttempt: Number(analysis.stats.attemptToSteal ?? 0),
        aggressionFactor: Math.round(Number(analysis.stats.aggressionFactor ?? 0)),
        wtsd: Number(analysis.stats.wtsd ?? 0),
        wsd: Number(analysis.stats.wsd ?? 0),
        finalPosition: tournament.finalPosition ?? null,
        abiBucket: tournament.abiBucket ?? "micro",
        totalCost: Number(tournament.totalCost ?? 0),
      });

      touchedUsers.add(Number(tournament.userId));
      touchedSiteBuckets.add(`${tournament.site}::${tournament.abiBucket ?? "micro"}`);
      successCount += 1;

      if ((i + 1) % 25 === 0 || i === tournaments.length - 1) {
        console.log(`Progress: ${i + 1}/${tournaments.length} tournaments processed.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ tournamentId: Number(tournament.id), userId: Number(tournament.userId), reason: message });
      console.error(`Failed tournament ${tournament.id} (user ${tournament.userId}): ${message}`);
    }
  }

  for (const userId of touchedUsers) {
    await refreshUserAbiAggregates(userId);
  }

  for (const pair of touchedSiteBuckets) {
    const [site, abiBucket] = pair.split("::");
    if (!site || !abiBucket) continue;
    await refreshFieldAbiAggregates(site, abiBucket);
  }

  console.log("\nRecalculation completed.");
  console.log(`- Successful tournaments: ${successCount}`);
  console.log(`- Failed tournaments: ${failed.length}`);
  console.log(`- Users refreshed: ${touchedUsers.size}`);
  console.log(`- Field buckets refreshed: ${touchedSiteBuckets.size}`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const item of failed) {
      console.log(`- tournamentId=${item.tournamentId}, userId=${item.userId}, reason=${item.reason}`);
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Fatal recalculation error:", error);
  process.exit(1);
});
