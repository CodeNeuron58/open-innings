/**
 * The moments the console announces on its own.
 *
 * The claim under test: a milestone fires exactly when the scorecard says it
 * should — on the delivery that crossed the line, not the one after, and not
 * again on every re-render that follows. The hat-trick half pins the
 * convention the banner is named for: three credited wickets, three
 * consecutive legal deliveries, one bowler.
 */
import { describe, it, expect } from 'vitest';
import {
  applyBall,
  initialState,
  type BallEventInput,
  type MatchState,
  type PlayerId,
} from '@open-innings/scoring';
import { milestoneLabel, milestonesFor } from './milestones';

const seed = (): MatchState =>
  initialState({
    matchId: 'm1',
    oversPerInnings: 20,
    teamAId: 'A',
    teamBId: 'B',
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    inningsId: 'i1',
    inningsNumber: 1,
    strikerId: 'b1',
    nonStrikerId: 'b2',
    bowlerId: 'w1',
  });

/**
 * A delivery from the crease, with the bowling Laws already obeyed: the
 * bowler alternates by over, so driving a batter's score past the over
 * boundary never runs into Law 16.2.
 */
// Overrides are plain strings — the ids are cast once, here, rather than at
// every call site of a test that is about milestones, not about brands.
function ball(state: MatchState, over: Record<string, unknown> = {}): BallEventInput {
  const inn = state.currentInnings;
  const overIndex = Math.floor(inn.ballsBowled / 6);
  return {
    inningsId: inn.id,
    eventType: 'dot',
    runsOffBat: 0,
    extraRuns: 0,
    batsmanId: inn.strikerId,
    nonStrikerId: inn.nonStrikerId,
    bowlerId: over.bowlerId ?? (overIndex % 2 === 0 ? 'w1' : 'w2'),
    ...over,
  } as BallEventInput;
}

const play = (state: MatchState, over: Record<string, unknown> = {}): MatchState =>
  applyBall(state, ball(state, over));

/** The striker's score so far — the table is empty before the first ball. */
const runsOf = (state: MatchState): number => state.batting.b1?.runs ?? 0;

describe('batting milestones', () => {
  it('fires the fifty on the delivery that crossed it', () => {
    // Twos only: even runs never rotate the strike mid-over, so the drive is
    // arithmetic nobody disputes. The striker still alternates at over ends,
    // so the final loop runs until b1's own score crosses.
    let s = seed();
    while (runsOf(s) < 48) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    expect(runsOf(s)).toBe(48);

    const notYet = milestonesFor(s, s.balls[s.balls.length - 1]!);
    expect(notYet).toHaveLength(0);

    while (runsOf(s) < 50) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    expect(runsOf(s)).toBe(50);
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toEqual([{ kind: 'fifty', playerId: 'b1' }]);
  });

  it('does not refire while the batter adds to a fifty', () => {
    let s = seed();
    while (runsOf(s) < 50) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toEqual([{ kind: 'fifty', playerId: 'b1' }]);

    // The next crossing of b1's own score is the century; a two off anybody
    // else's bat between them is nothing.
    while (runsOf(s) < 52) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    const nextEvent = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, nextEvent)).toHaveLength(0);
  });

  it('fires the century, and not a second fifty beside it', () => {
    let s = seed();
    while (runsOf(s) < 98) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    while (runsOf(s) < 100) s = play(s, { eventType: '2', runsOffBat: 2, totalRuns: 2 });
    expect(runsOf(s)).toBe(100);
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toEqual([{ kind: 'century', playerId: 'b1' }]);
  });
});

describe('the hat-trick', () => {
  it('fires on the third credited wicket in three consecutive legal deliveries', () => {
    // Each wicket ball names the previous dismissal's replacement in the same
    // stroke — the pair on the event is how the engine learns who came in —
    // so three legal deliveries in a row can carry three bowled.
    let s = seed();
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b1',
    });
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b3',
      batsmanId: 'b3',
    });
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b4',
      batsmanId: 'b4',
    });
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toEqual([{ kind: 'hat_trick', playerId: 'w1' }]);
  });

  it('does not fire when the wickets are not consecutive', () => {
    let s = seed();
    for (const next of ['b3', 'b4', 'b5']) {
      s = play(s, {
        eventType: 'wicket',
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        wicketPlayerId: s.currentInnings.strikerId,
      });
      const slot =
        s.currentInnings.strikerId === s.balls[s.balls.length - 1]!.wicketPlayerId
          ? 'batsmanId'
          : 'nonStrikerId';
      s = play(s, { [slot]: next });
      // An ordinary delivery between each wicket breaks the run.
      s = play(s, { eventType: '1', runsOffBat: 1, totalRuns: 1 });
    }
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toHaveLength(0);
  });

  it('does not reach across an over break to a different bowler', () => {
    let s = seed();
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b1',
    });
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b3',
      batsmanId: 'b3',
    });
    // Fill the over — the first ball names b3's replacement, the rest are
    // ordinary — so the next over belongs to a different bowler (Law 16.2),
    // whose first wicket is not the third in a row.
    s = play(s, { batsmanId: 'b4' });
    for (let i = 0; i < 3; i += 1) s = play(s);
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b4',
    });
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toHaveLength(0);
  });

  it('a run out between the wickets breaks the run — the bowler gets no credit for it', () => {
    let s = seed();
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b1',
    });
    s = play(s, { batsmanId: 'b3' });
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'run_out',
      wicketPlayerId: 'b3',
      fielderId: 'f1',
    });
    s = play(s, { batsmanId: 'b4' });
    s = play(s, {
      eventType: 'wicket',
      runsOffBat: 0,
      totalRuns: 0,
      wicketType: 'bowled',
      wicketPlayerId: 'b4',
    });
    const event = s.balls[s.balls.length - 1]!;
    expect(milestonesFor(s, event)).toHaveLength(0);
  });
});

describe('milestoneLabel', () => {
  it('names the player and the moment', () => {
    const pid = (x: string): PlayerId => x as PlayerId;
    expect(milestoneLabel({ kind: 'fifty', playerId: pid('b1') }, 'Ramesh')).toBe(
      'Fifty for Ramesh!',
    );
    expect(milestoneLabel({ kind: 'century', playerId: pid('b1') }, 'Ramesh')).toBe(
      'Century for Ramesh!',
    );
    expect(milestoneLabel({ kind: 'hat_trick', playerId: pid('w1') }, 'Sunil')).toBe(
      'Hat-trick for Sunil!',
    );
  });
});
