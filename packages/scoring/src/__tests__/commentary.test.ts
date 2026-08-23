/**
 * Commentary is generated text sitting next to a real scorecard, so the thing
 * worth testing is that it never says something the ball log does not.
 */
import { describe, it, expect } from 'vitest';
import { describeBall, groupIntoOvers, ballInOverFor } from '../commentary';
import { asInningsId, asPlayerId, type BallEvent } from '../types';

function ball(overrides: Partial<BallEvent> = {}): BallEvent {
  return {
    id: 'b1',
    inningsId: asInningsId('i1'),
    overNumber: 18,
    ballNumber: 114,
    eventType: 'dot',
    runsOffBat: 0,
    overthrowRuns: 0,
    extraRuns: 0,
    totalRuns: 0,
    isLegalDelivery: true,
    isFreeHit: false,
    batsmanId: asPlayerId('thomas'),
    nonStrikerId: asPlayerId('shetty'),
    bowlerId: asPlayerId('kamath'),
    ...overrides,
  };
}

const ctx = { bowlerName: 'Kamath', batterName: 'Thomas' };

describe('describeBall', () => {
  it('states the plain outcomes', () => {
    expect(describeBall(ball(), ctx)).toBe('Kamath to Thomas, no run');
    expect(describeBall(ball({ eventType: '1', runsOffBat: 1, totalRuns: 1 }), ctx)).toBe(
      'Kamath to Thomas, 1 run',
    );
    expect(describeBall(ball({ eventType: '4', runsOffBat: 4, totalRuns: 4 }), ctx)).toBe(
      'Kamath to Thomas, FOUR',
    );
    expect(describeBall(ball({ eventType: '6', runsOffBat: 6, totalRuns: 6 }), ctx)).toBe(
      'Kamath to Thomas, SIX',
    );
  });

  it('separates the extras, and pluralises them', () => {
    const wide = ball({ eventType: 'wide', extraRuns: 1, totalRuns: 1, isLegalDelivery: false });
    expect(describeBall(wide, ctx)).toBe('Kamath to Thomas, wide');
    expect(describeBall({ ...wide, extraRuns: 5, totalRuns: 5 }, ctx)).toBe(
      'Kamath to Thomas, wide, 5 runs',
    );
    expect(describeBall(ball({ eventType: 'leg_bye', extraRuns: 1, totalRuns: 1 }), ctx)).toBe(
      'Kamath to Thomas, 1 leg bye',
    );
    expect(describeBall(ball({ eventType: 'bye', extraRuns: 2, totalRuns: 2 }), ctx)).toBe(
      'Kamath to Thomas, 2 byes',
    );
  });

  it('credits a fielder only where one is genuinely credited', () => {
    const caught = ball({ eventType: 'wicket', wicketType: 'caught' });
    expect(describeBall(caught, { ...ctx, fielderName: 'Bose' })).toBe(
      'Kamath to Thomas, OUT — caught by Bose',
    );

    // A bowled has no fielder. Passing one must not invent a participant.
    const bowled = ball({ eventType: 'wicket', wicketType: 'bowled' });
    expect(describeBall(bowled, { ...ctx, fielderName: 'Bose' })).toBe(
      'Kamath to Thomas, OUT — bowled',
    );
  });

  it('says so when a run-out took the batter at the other end', () => {
    const runOut = ball({ eventType: 'wicket', wicketType: 'run_out' });
    expect(describeBall(runOut, { ...ctx, fielderName: 'Nair', outBatterName: 'Shetty' })).toBe(
      'Kamath to Thomas, OUT — run out (Nair) — Shetty out at the other end',
    );

    // Striker run out: no "other end" clause, because there isn't one.
    expect(describeBall(runOut, { ...ctx, fielderName: 'Nair', outBatterName: 'Thomas' })).toBe(
      'Kamath to Thomas, OUT — run out (Nair)',
    );
  });

  it('moves the equation only when runs were actually scored', () => {
    const four = ball({ eventType: '4', runsOffBat: 4, totalRuns: 4 });
    expect(describeBall(four, { ...ctx, runsNeededBefore: 20, ballsRemainingBefore: 18 })).toBe(
      'Kamath to Thomas, FOUR — 20 needed became 16',
    );

    // A dot does not move it, so it is not mentioned.
    expect(describeBall(ball(), { ...ctx, runsNeededBefore: 20, ballsRemainingBefore: 18 })).toBe(
      'Kamath to Thomas, no run',
    );
  });

  it('calls the match when the match is over', () => {
    const four = ball({ eventType: '4', runsOffBat: 4, totalRuns: 4 });
    expect(
      describeBall(four, {
        ...ctx,
        endsMatch: true,
        runsNeededBefore: 3,
        ballsRemainingBefore: 4,
      }),
    ).toBe('Kamath to Thomas, FOUR — and that is the match');
  });

  it("prefers a scorer's own note over anything generated", () => {
    const four = ball({
      eventType: '4',
      runsOffBat: 4,
      totalRuns: 4,
      commentary: 'through midwicket, off the toe end',
    });
    expect(describeBall(four, ctx)).toBe('Kamath to Thomas, through midwicket, off the toe end');
  });
});

describe('ballInOverFor', () => {
  it('counts legal deliveries, so a wide does not advance the ball number', () => {
    const over = [
      ball({ eventType: '1', isLegalDelivery: true }),
      ball({ eventType: 'wide', isLegalDelivery: false }),
      ball({ eventType: 'dot', isLegalDelivery: true }),
    ];
    expect(ballInOverFor(over, 0)).toBe(1);
    // The wide is announced as the ball it delays, not as a new one.
    expect(ballInOverFor(over, 1)).toBe(1);
    expect(ballInOverFor(over, 2)).toBe(2);
  });

  it('reads a wide before any legal ball as the first ball, not the zeroth', () => {
    const over = [ball({ eventType: 'wide', isLegalDelivery: false })];
    expect(ballInOverFor(over, 0)).toBe(1);
  });
});

describe('groupIntoOvers', () => {
  it('groups by over, newest first, and totals each one', () => {
    const balls = [
      ball({ overNumber: 0, eventType: '1', runsOffBat: 1, totalRuns: 1 }),
      ball({ overNumber: 0, eventType: 'wicket', wicketType: 'bowled' }),
      ball({
        overNumber: 1,
        eventType: '4',
        runsOffBat: 4,
        totalRuns: 4,
        bowlerId: asPlayerId('bose'),
      }),
    ];
    const overs = groupIntoOvers(balls, (id) => (id === 'bose' ? 'Bose' : 'Kamath'));

    expect(overs).toHaveLength(2);
    expect(overs[0]?.overNumber).toBe(2);
    expect(overs[0]?.bowlerName).toBe('Bose');
    expect(overs[0]?.runs).toBe(4);
    expect(overs[1]?.overNumber).toBe(1);
    expect(overs[1]?.runs).toBe(1);
    expect(overs[1]?.wickets).toBe(1);
  });
});
