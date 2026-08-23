/**
 * A delivery, in words.
 *
 * The over-by-over feed reads like commentary, but nothing here is invented.
 * "Kamath to Thomas, SIX" is a restatement of the ball log; "over long-on,
 * into the second tier" is a human watching the game, and this file will never
 * produce it. Every clause below is derived from a field on the event or from
 * the state the ball landed in.
 *
 * That boundary matters more than it looks. A generated line that guesses
 * where a shot went is a lie printed next to a real scorecard, and it poisons
 * the one thing this app is for — being the record people trust. If a scorer
 * types a note, `BallEvent.commentary` carries it and it wins over anything
 * here.
 */
import { BALLS_PER_OVER } from './rules';
import type { BallEvent, WicketType } from './types';

/** How a dismissal reads in a commentary line, not on a scorecard. */
const DISMISSAL_PHRASE: Record<WicketType, string> = {
  bowled: 'bowled',
  caught: 'caught',
  caught_behind: 'caught behind',
  lbw: 'lbw',
  run_out: 'run out',
  stumped: 'stumped',
  hit_wicket: 'hit wicket',
  handled_ball: 'handled the ball',
  obstructing_field: 'obstructing the field',
  timed_out: 'timed out',
  retired_hurt: 'retired hurt',
  retired_out: 'retired out',
  double_hit: 'hit the ball twice',
  hit_the_ball_twice: 'hit the ball twice',
};

/** "19.2" — the over and the ball within it, as a scorer would say it. */
export function ballLabel(ball: BallEvent, ballInOver: number): string {
  return `${ball.overNumber + 1}.${ballInOver}`;
}

/**
 * What happened off the bat, or off the pads, or past everybody.
 *
 * Deliberately flat: FOUR and SIX are shouted because that is how they are
 * called, everything else is stated. A "no run" is not a failure worth
 * decorating.
 */
function outcomePhrase(ball: BallEvent): string {
  if (ball.wicketType) {
    return `OUT — ${DISMISSAL_PHRASE[ball.wicketType]}`;
  }

  switch (ball.eventType) {
    case 'wide':
      // The penalty is one; anything above it ran or went to the fence.
      return ball.totalRuns > 1 ? `wide, ${ball.totalRuns} runs` : 'wide';
    case 'no_ball':
      return ball.totalRuns > 1 ? `no ball, ${ball.totalRuns} runs` : 'no ball';
    case 'bye':
      return `${ball.totalRuns} bye${ball.totalRuns === 1 ? '' : 's'}`;
    case 'leg_bye':
      return `${ball.totalRuns} leg bye${ball.totalRuns === 1 ? '' : 's'}`;
    case 'penalty':
      return `${ball.extraRuns} penalty runs`;
    case 'dot':
      return 'no run';
    case '4':
      return 'FOUR';
    case '6':
      return 'SIX';
    default:
      if (ball.overthrowRuns > 0) {
        return `${ball.runsOffBat} run${ball.runsOffBat === 1 ? '' : 's'} + ${ball.overthrowRuns} overthrows`;
      }
      return `${ball.runsOffBat} run${ball.runsOffBat === 1 ? '' : 's'}`;
  }
}

export type BallContext = {
  bowlerName: string;
  batterName: string;
  /** Who was dismissed — only differs from the striker on a run-out. */
  outBatterName?: string;
  fielderName?: string;
  /** Runs the chasing side still needed *before* this ball. Omit in innings 1. */
  runsNeededBefore?: number;
  /** Balls left in the innings before this ball. */
  ballsRemainingBefore?: number;
  /** True when this delivery ended the match. */
  endsMatch?: boolean;
};

/**
 * One line of commentary for one delivery.
 *
 * Reads "Kamath to Thomas, FOUR". A scorer's own note replaces the outcome
 * entirely — they were there and this function was not.
 */
export function describeBall(ball: BallEvent, ctx: BallContext): string {
  if (ball.commentary && ball.commentary.trim().length > 0) {
    return `${ctx.bowlerName} to ${ctx.batterName}, ${ball.commentary.trim()}`;
  }

  let line = `${ctx.bowlerName} to ${ctx.batterName}, ${outcomePhrase(ball)}`;

  // Who took it. Only where a fielder is genuinely credited — naming one on a
  // bowled would be inventing a participant.
  if (ball.wicketType && ctx.fielderName) {
    if (ball.wicketType === 'run_out') line += ` (${ctx.fielderName})`;
    else if (ball.wicketType === 'caught' || ball.wicketType === 'caught_behind')
      line += ` by ${ctx.fielderName}`;
    else if (ball.wicketType === 'stumped') line += ` by ${ctx.fielderName}`;
  }

  // A run-out can take the batter who was not facing, and the line is wrong
  // without saying so.
  if (ball.wicketType === 'run_out' && ctx.outBatterName && ctx.outBatterName !== ctx.batterName) {
    line += ` — ${ctx.outBatterName} out at the other end`;
  }

  if (ctx.endsMatch) return `${line} — and that is the match`;

  // The equation, but only when it moved. Repeating "16 needed off 18" under
  // every dot ball is noise; showing it when runs came is the story.
  if (
    ctx.runsNeededBefore !== undefined &&
    ctx.ballsRemainingBefore !== undefined &&
    ball.totalRuns > 0 &&
    ctx.runsNeededBefore > 0
  ) {
    const after = Math.max(0, ctx.runsNeededBefore - ball.totalRuns);
    if (after > 0) line += ` — ${ctx.runsNeededBefore} needed became ${after}`;
  }

  return line;
}

export type OverSummary = {
  /** 1-indexed, as people say it: "over 20". */
  overNumber: number;
  bowlerName: string;
  runs: number;
  wickets: number;
  balls: BallEvent[];
};

/**
 * Balls grouped into overs, newest over first.
 *
 * Newest first because the only person reading this during a match wants the
 * ball that just happened, and the only person reading it afterwards is
 * scrolling anyway.
 */
export function groupIntoOvers(
  balls: BallEvent[],
  resolveName: (playerId: string) => string,
): OverSummary[] {
  const byOver = new Map<number, BallEvent[]>();
  for (const ball of balls) {
    const list = byOver.get(ball.overNumber);
    if (list) list.push(ball);
    else byOver.set(ball.overNumber, [ball]);
  }

  return [...byOver.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([overNumber, overBalls]) => ({
      overNumber: overNumber + 1,
      // The bowler of an over is whoever bowled its deliveries. Taken from the
      // first ball rather than from innings state, which only knows *now*.
      bowlerName: resolveName(String(overBalls[0]?.bowlerId ?? '')),
      runs: overBalls.reduce((sum, b) => sum + b.totalRuns, 0),
      wickets: overBalls.filter((b) => b.wicketType).length,
      balls: overBalls,
    }));
}

/**
 * Which ball of its over a delivery was.
 *
 * Not `ballNumber`, which counts the whole innings, and not the array index,
 * which counts wides. A scorer says "19.2" meaning the second *legal* ball —
 * so an illegal delivery carries the count of the legal ball it precedes.
 */
export function ballInOverFor(overBalls: BallEvent[], index: number): number {
  let legal = 0;
  for (let i = 0; i <= index && i < overBalls.length; i++) {
    if (overBalls[i]?.isLegalDelivery) legal += 1;
  }
  // A wide before any legal ball is still "19.1" — the ball it delays.
  return Math.min(Math.max(legal, 1), BALLS_PER_OVER);
}
