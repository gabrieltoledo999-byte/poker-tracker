import { drizzle } from "drizzle-orm/mysql2";
import { eq, like, inArray, asc } from "drizzle-orm";
import {
  users,
  centralTournaments,
  playerTournamentStats,
  centralHands,
  centralHandActions,
} from "../drizzle/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");
  const db = drizzle(databaseUrl);

  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [207, 208]));

  for (const user of allUsers) {
    console.log("\n==============================");
    console.log(`USER: ${user.name} (id=${user.id})`);

    const tStats = await db
      .select({
        tournamentId: playerTournamentStats.tournamentId,
        steal: playerTournamentStats.stealAttempt,
        hands: playerTournamentStats.handsPlayed,
        updatedAt: playerTournamentStats.updatedAt,
      })
      .from(playerTournamentStats)
      .where(eq(playerTournamentStats.userId, user.id))
      .orderBy(asc(playerTournamentStats.tournamentId));

    console.log("playerTournamentStats stealAttempt rows:");
    console.table(tStats);

    // Recompute ATS by-position from raw hands/actions (strict definition)
    const tournaments = await db
      .select({ id: centralTournaments.id })
      .from(centralTournaments)
      .where(eq(centralTournaments.userId, user.id));
    const tIds = tournaments.map((t) => t.id);
    if (tIds.length === 0) continue;

    const hands = await db
      .select({
        id: centralHands.id,
        heroSeat: centralHands.heroSeat,
        heroPosition: centralHands.heroPosition,
      })
      .from(centralHands)
      .where(inArray(centralHands.tournamentId, tIds));

    const handIds = hands.map((h) => h.id);
    const actions = handIds.length === 0 ? [] : await db
      .select({
        handId: centralHandActions.handId,
        street: centralHandActions.street,
        actionOrder: centralHandActions.actionOrder,
        seat: centralHandActions.seat,
        position: centralHandActions.position,
        actionType: centralHandActions.actionType,
        isForced: centralHandActions.isForced,
        heroInHand: centralHandActions.heroInHand,
      })
      .from(centralHandActions)
      .where(inArray(centralHandActions.handId, handIds))
      .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

    const actionsByHand = new Map<number, typeof actions>();
    for (const a of actions) {
      const list = actionsByHand.get(Number(a.handId)) ?? [];
      list.push(a);
      actionsByHand.set(Number(a.handId), list);
    }

    const norm = (p: string | null | undefined) => {
      const s = String(p ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/\+/g, "");
      if (s === "MP" || s === "MP1" || s === "LJ") return "LJ";
      if (s === "MP2" || s === "HJ") return "HJ";
      if (s === "BU" || s === "BTN") return "BTN";
      if (s === "UTG1" || s === "EP") return "UTG1";
      if (s === "UTG2" || s === "EP1") return "UTG2";
      if (["UTG", "CO", "SB", "BB"].includes(s)) return s;
      return "UNKNOWN";
    };

    const isAggr = (t?: string | null) => {
      const x = String(t ?? "").toLowerCase();
      return x === "raise" || x === "all_in" || x === "bet" || x === "allin" || x === "all-in";
    };

    const breakdown = new Map<string, { opp: number; att: number }>();

    for (const h of hands) {
      const handId = Number(h.id);
      const heroSeat = Number(h.heroSeat ?? 0);
      const acts = (actionsByHand.get(handId) ?? []).filter(
        (a) => String(a.street ?? "").toLowerCase() === "preflop",
      );

      const isHero = (a: { seat: number | null; heroInHand: number | null }) =>
        Number(a.heroInHand ?? 0) === 1 || (heroSeat > 0 && Number(a.seat ?? 0) === heroSeat);

      // hero position
      let pos = norm(h.heroPosition);
      if (pos === "UNKNOWN") {
        const heroFirst = acts.find((a) => isHero(a) && norm(a.position) !== "UNKNOWN");
        pos = norm(heroFirst?.position);
      }

      if (pos !== "CO" && pos !== "BTN" && pos !== "SB") continue;

      const heroFirstIdx = acts.findIndex((a) => isHero(a) && Number(a.isForced ?? 0) !== 1);
      if (heroFirstIdx < 0) continue;

      const prior = acts.slice(0, heroFirstIdx).filter((a) => !isHero(a));
      const allFoldsOrChecks = prior.every((a) => {
        const t = String(a.actionType ?? "").toLowerCase();
        return Number(a.isForced ?? 0) === 1 || t === "fold" || t === "check" || t === "muck" || t === "show" || t === "other";
      });
      if (!allFoldsOrChecks) continue;

      const heroAct = acts[heroFirstIdx];
      const cur = breakdown.get(pos) ?? { opp: 0, att: 0 };
      cur.opp += 1;
      if (isAggr(heroAct?.actionType)) cur.att += 1;
      breakdown.set(pos, cur);
    }

    let totOpp = 0;
    let totAtt = 0;
    const rows: Array<{ position: string; opp: number; att: number; pct: string }> = [];
    for (const pos of ["CO", "BTN", "SB"]) {
      const v = breakdown.get(pos) ?? { opp: 0, att: 0 };
      totOpp += v.opp;
      totAtt += v.att;
      rows.push({ position: pos, opp: v.opp, att: v.att, pct: v.opp > 0 ? ((v.att / v.opp) * 100).toFixed(1) + "%" : "-" });
    }
    rows.push({ position: "TOTAL", opp: totOpp, att: totAtt, pct: totOpp > 0 ? ((totAtt / totOpp) * 100).toFixed(1) + "%" : "-" });

    console.log("Strict ATS by position (recomputed live from hands/actions):");
    console.table(rows);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
