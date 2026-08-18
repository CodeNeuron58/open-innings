/**
 * Replay every innings in the database and report what the rules object to.
 *
 * ## Why this exists
 *
 * Every figure in this app is derived by replaying `ball_events` through the
 * engine, and the engine validates as it replays. So a rule tightened today is
 * applied retroactively to every delivery ever recorded — including ones
 * scored when the rule did not exist, or when a screen allowed something it no
 * longer allows.
 *
 * A concrete case: the wicket sheet used to offer both squads as fielders, so
 * a catch could be credited to a batter. `validateRoles` refuses that now.
 * Deliveries like it are already in the ball log, and no amount of correctness
 * in the engine can un-bowl them.
 *
 * `replayEvents` therefore runs in **replay mode** — it applies stored
 * deliveries and records objections on `state.violations` rather than
 * throwing, so a scorecard always renders. This script is the other half of
 * that bargain: the objections are only useful if somebody reads them.
 *
 * ## Run it before deploying a rules change
 *
 *     pnpm db:verify
 *     DATABASE_URL="…" pnpm db:verify   # against any other database
 *
 * **Read-only.** It opens no transaction and writes nothing, so it is safe to
 * point at production — which is the whole point, since production is the
 * database whose history nobody has checked.
 *
 * Exits non-zero when anything is reported, so CI can run it too.
 */
import { asc, eq } from 'drizzle-orm';
import { replayInnings, type BallViolation } from '@open-innings/scoring';
import { db } from '../lib/db/client';
import { matches, innings as inningsTable, ballEvents } from '../lib/db/schema';

type Report = {
  matchId: string;
  title: string | null;
  inningsNumber: number;
  violations: BallViolation[];
};

async function main() {
  const allMatches = await db.select().from(matches).orderBy(asc(matches.createdAt));
  console.log(`→ Replaying ${allMatches.length} match(es)…\n`);

  const reports: Report[] = [];
  let inningsChecked = 0;
  let ballsChecked = 0;

  for (const match of allMatches) {
    const allInnings = await db
      .select()
      .from(inningsTable)
      .where(eq(inningsTable.matchId, match.id))
      .orderBy(asc(inningsTable.inningsNumber));

    for (const inn of allInnings) {
      const balls = await db
        .select()
        .from(ballEvents)
        .where(eq(ballEvents.inningsId, inn.id))
        .orderBy(asc(ballEvents.ballNumber));

      inningsChecked += 1;
      ballsChecked += balls.length;

      /*
       * The same seed the application builds, including the playing
       * conditions. Replaying under different conditions than the deliveries
       * were validated against would invent violations that do not exist.
       */
      let state;
      try {
        state = replayInnings(
          {
            matchId: match.id,
            oversPerInnings: match.oversPerInnings,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            battingTeamId: inn.battingTeamId,
            bowlingTeamId: inn.bowlingTeamId,
            inningsId: inn.id,
            inningsNumber: inn.inningsNumber as 1 | 2 | 3 | 4,
            strikerId: inn.openingStrikerId ?? '',
            nonStrikerId: inn.openingNonStrikerId ?? '',
            bowlerId: inn.openingBowlerId ?? '',
            maxWickets: inn.maxWickets,
            target: inn.target ?? undefined,
            maxOversPerBowler: match.maxOversPerBowler ?? undefined,
          },
          balls.map((b) => ({
            ...b,
            inningsId: b.inningsId as never,
            batsmanId: b.batsmanId as never,
            nonStrikerId: b.nonStrikerId as never,
            bowlerId: b.bowlerId as never,
            wicketPlayerId: (b.wicketPlayerId ?? undefined) as never,
            fielderId: (b.fielderId ?? undefined) as never,
            wicketType: b.wicketType ?? undefined,
            commentary: b.commentary ?? undefined,
          })),
        );
      } catch (error) {
        /*
         * Replay mode should make this unreachable — it is here because an
         * unreachable failure that takes down every scorecard is exactly the
         * thing this script exists to find out about early.
         */
        console.error(
          `✗ ${match.title ?? match.id} innings ${inn.inningsNumber} — replay THREW, which replay mode should prevent:`,
        );
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
        continue;
      }

      if (state.violations.length > 0) {
        reports.push({
          matchId: match.id,
          title: match.title,
          inningsNumber: inn.inningsNumber,
          violations: state.violations,
        });
      }

      // The cached columns should agree with what the deliveries say. They are
      // rewritten on every scoring write, so a mismatch means something wrote
      // one without the other — which is what the transactions added in
      // recordBall and removeLastBall are there to prevent.
      const drift: string[] = [];
      if (state.currentInnings.runs !== inn.runs) {
        drift.push(`runs: cached ${inn.runs}, replayed ${state.currentInnings.runs}`);
      }
      if (state.currentInnings.wickets !== inn.wickets) {
        drift.push(`wickets: cached ${inn.wickets}, replayed ${state.currentInnings.wickets}`);
      }
      if (state.currentInnings.ballsBowled !== inn.ballsBowled) {
        drift.push(
          `balls: cached ${inn.ballsBowled}, replayed ${state.currentInnings.ballsBowled}`,
        );
      }
      if (drift.length > 0) {
        console.error(`⚠ ${match.title ?? match.id} innings ${inn.inningsNumber} — cache drift:`);
        for (const d of drift) console.error(`    ${d}`);
        process.exitCode = 1;
      }
    }
  }

  console.log(`  ${inningsChecked} innings, ${ballsChecked} deliveries.\n`);

  if (reports.length === 0) {
    console.log('✓ Every stored delivery satisfies the rules as they now stand.');
    return;
  }

  console.error(`✗ ${reports.length} innings contain deliveries the current rules refuse:\n`);
  for (const r of reports) {
    console.error(`  ${r.title ?? r.matchId} — innings ${r.inningsNumber}`);
    console.error(`  match ${r.matchId}`);
    for (const v of r.violations) {
      console.error(`    ball ${v.ballNumber}: ${v.code} — ${v.message}`);
    }
    console.error('');
  }
  console.error(
    'These render correctly — replay mode applies them and records the objection.\n' +
      'They are listed so somebody can decide whether to correct the ball or the rule.',
  );
  process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('✗ verify-replay failed:', err);
    process.exit(1);
  });
