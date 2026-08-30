/**
 * The moments worth stopping the scroll for.
 *
 * A fifty, a century, a hat-trick — the three things a scorer's phone should
 * announce on its own, because they are the three things the whole ground
 * notices. Everything the detector needs is already in the engine's state,
 * so this is a pure read with no second bookkeeping to drift.
 */
import {
  BOWLER_CREDITED_WICKETS,
  OVERTHROW_TO_EXTRAS_TYPES,
  type BallEvent,
  type MatchState,
  type PlayerId,
} from '@open-innings/scoring';

export type Milestone =
  | { kind: 'fifty'; playerId: PlayerId }
  | { kind: 'century'; playerId: PlayerId }
  | { kind: 'hat_trick'; playerId: PlayerId };

/**
 * What this delivery just created, judged against the state as it stood
 * *after* the delivery — the shape the projection already holds.
 *
 * Batting crossings subtract what the delivery credited from the total that
 * stands now, because there is no "before" state to ask. The credited figure
 * routes overthrows exactly as the engine's own scoring does, so a batter
 * reaching fifty with an overthrow agrees with the scorecard that says so.
 */
export function milestonesFor(state: MatchState, ball: BallEvent): Milestone[] {
  const out: Milestone[] = [];

  const striker = state.batting[String(ball.batsmanId)];
  if (striker) {
    const overthrowToBatter = OVERTHROW_TO_EXTRAS_TYPES.has(ball.eventType)
      ? 0
      : ball.overthrowRuns;
    const credited = ball.runsOffBat + overthrowToBatter;
    if (credited > 0) {
      const before = striker.runs - credited;
      if (before < 50 && striker.runs >= 50) out.push({ kind: 'fifty', playerId: ball.batsmanId });
      if (before < 100 && striker.runs >= 100) {
        out.push({ kind: 'century', playerId: ball.batsmanId });
      }
    }
  }

  /*
   * Hat-trick: three wickets credited to one bowler in three consecutive
   * deliveries. "Consecutive" is counted in legal deliveries — a wide between
   * them is a ball the batter could not have been out on, and the convention
   * every scorebook follows is that it does not break the run. Deliveries
   * across the over boundary count; that is where the third one usually falls.
   */
  if (ball.wicketType && BOWLER_CREDITED_WICKETS.has(ball.wicketType)) {
    const legal = state.balls.filter((b) => b.isLegalDelivery);
    if (legal.length >= 3) {
      const [a, b, c] = legal.slice(-3) as [BallEvent, BallEvent, BallEvent];
      const creditedWicket = (x: BallEvent): boolean =>
        x.wicketType !== undefined && BOWLER_CREDITED_WICKETS.has(x.wicketType);
      if (
        String(a.bowlerId) === String(b.bowlerId) &&
        String(b.bowlerId) === String(c.bowlerId) &&
        creditedWicket(a) &&
        creditedWicket(b)
      ) {
        out.push({ kind: 'hat_trick', playerId: c.bowlerId });
      }
    }
  }

  return out;
}

/** The sentence the banner shows, in the voice the app already uses. */
export function milestoneLabel(milestone: Milestone, name: string): string {
  switch (milestone.kind) {
    case 'fifty':
      return `Fifty for ${name}!`;
    case 'century':
      return `Century for ${name}!`;
    case 'hat_trick':
      return `Hat-trick for ${name}!`;
  }
}
