/**
 * Correcting a delivery that is not the last one.
 *
 * The whole innings is recomputed from the seed because a single correction
 * (like inserting a wide) can shift the strike and over counts for every
 * subsequent ball. Invalid states are safely rejected with actionable errors.
 */
import {
  applyBall,
  replayEvents,
  ScoringError,
  asInningsId,
  asPlayerId,
  BATTER_LEAVES_FIELD,
  type BallEvent,
  type BallEventInput,
  type MatchState,
} from '@open-innings/scoring';
import type { BallCorrectionChange, PatchBallInput } from '@open-innings/shared';
import { HTTP } from '@open-innings/shared';
import { ServiceError } from './errors';

const BALLS_PER_OVER = 6;

/** A `ball_events` row, as the query layer hands it over. */
export type StoredBall = {
  id: string;
  inningsId: string;
  overNumber: number;
  ballNumber: number;
  eventType: string;
  runsOffBat: number;
  overthrowRuns?: number;
  extraRuns: number;
  totalRuns: number;
  isLegalDelivery: boolean;
  isFreeHit: boolean;
  batsmanId: string;
  nonStrikerId: string;
  bowlerId: string;
  wicketType: string | null;
  wicketPlayerId: string | null;
  fielderId: string | null;
  bowlerReplacedMidOver: boolean;
  commentary: string | null;
};

/**
 * A rejection that names the delivery it broke.
 *
 * `ServiceError` carries a message and a status and nothing else, which is
 * right for "that email is taken" and useless here — the scorer needs to know
 * which ball to look at.
 */
export class BallCorrectionError extends ServiceError {
  readonly code: string;
  readonly ballNumber?: number;
  readonly over?: string;

  constructor(
    message: string,
    opts: { code: string; status?: number; ballNumber?: number; over?: string } = {
      code: 'CORRECTION_IMPOSSIBLE',
    },
  ) {
    super(message, opts.status ?? HTTP.badRequest);
    this.name = 'BallCorrectionError';
    this.code = opts.code;
    this.ballNumber = opts.ballNumber;
    this.over = opts.over;
  }
}

export type CorrectionResult = {
  /** The innings as it now stands. */
  state: MatchState;
  /** Every delivery from the edit onward, rewritten. In sequence order. */
  rewritten: BallEvent[];
  /** Index into the stored list where the rewrite begins. */
  fromIndex: number;
  /** What moved as a consequence, in the scorer's language. */
  changes: BallCorrectionChange[];
};

/**
 * Replace one delivery and recompute everything after it.
 *
 * Pure: no database, no clock. The caller supplies the seed and the stored
 * deliveries and writes back whatever comes out, which is what makes this
 * testable against the real engine rather than against a mock of it.
 */
export function correctBall(
  seed: MatchState,
  stored: readonly StoredBall[],
  ballId: string,
  patch: PatchBallInput,
  nameOf: (id: string) => string = (id) => id,
): CorrectionResult {
  const index = stored.findIndex((b) => b.id === ballId);
  if (index === -1) {
    throw new BallCorrectionError('That delivery is not in this innings', {
      code: 'BALL_NOT_FOUND',
      status: HTTP.notFound,
    });
  }

  /*
   * The innings as it stands, replayed once.
   *
   * Two things come from it. The violations already present — so an old
   * unlawful delivery does not veto a correction somewhere else — and the
   * before-and-after comparison that produces `changes`.
   */
  const before = replayEvents(seed, stored.map(toInput));
  const priorViolations = new Set(before.violations.map((v) => `${v.ballNumber}:${v.code}`));

  // Everything before the edit is untouched, so its state is the starting
  // point and does not need recomputing per delivery.
  const prefix = stored.slice(0, index);
  let state = replayEvents(seed, prefix.map(toInput));

  const edited = stored[index]!;
  const rewritten: BallEvent[] = [];

  /*
   * Correcting the bowler corrects the over, not the ball.
   *
   * A scorer who says "Rahul bowled that, not Imran" is telling you about the
   * over. Applying it to one delivery would leave the other five with the
   * wrong bowler and the engine objecting that the bowler changed mid-over —
   * a refusal produced entirely by taking them too literally.
   */
  const bowlerChanged = patch.bowlerId !== edited.bowlerId;
  const editedOver = edited.overNumber;

  // ── The edited delivery ────────────────────────────────────────────────
  const pair = derivePair(state, edited, patch.batsmanId, patch.nonStrikerId);
  const editedInput: BallEventInput = {
    ...baseInput(edited),
    eventType: patch.eventType as BallEventInput['eventType'],
    runsOffBat: patch.runsOffBat,
    extraRuns: patch.extraRuns,
    batsmanId: asPlayerId(pair.strikerId),
    nonStrikerId: asPlayerId(pair.nonStrikerId),
    bowlerId: asPlayerId(patch.bowlerId),
    wicketType: patch.wicketType,
    wicketPlayerId: resolveWicketPlayer(patch.wicketPlayerId, edited, pair),
    fielderId: patch.fielderId ? asPlayerId(patch.fielderId) : undefined,
    bowlerReplacedMidOver: patch.bowlerReplacedMidOver,
    commentary: patch.commentary,
    // Derived fields are deliberately absent: the engine recomputes
    // totalRuns, isLegalDelivery, isFreeHit and the over number, and taking
    // the stored ones would carry the mistake forward.
  };

  state = step(state, editedInput, priorViolations, edited.ballNumber, rewritten, 'edit');

  // ── Everything after it ────────────────────────────────────────────────
  for (let i = index + 1; i < stored.length; i += 1) {
    const row = stored[i]!;
    const nextPair = derivePair(state, row);

    const input: BallEventInput = {
      ...baseInput(row),
      eventType: row.eventType as BallEventInput['eventType'],
      runsOffBat: row.runsOffBat,
      extraRuns: row.extraRuns,
      batsmanId: asPlayerId(nextPair.strikerId),
      nonStrikerId: asPlayerId(nextPair.nonStrikerId),
      bowlerId: asPlayerId(
        bowlerChanged && row.overNumber === editedOver ? patch.bowlerId : row.bowlerId,
      ),
      wicketType: (row.wicketType ?? undefined) as BallEventInput['wicketType'],
      wicketPlayerId: resolveWicketPlayer(row.wicketPlayerId ?? undefined, row, nextPair),
      fielderId: row.fielderId ? asPlayerId(row.fielderId) : undefined,
      bowlerReplacedMidOver: row.bowlerReplacedMidOver,
      commentary: row.commentary ?? undefined,
    };

    state = step(state, input, priorViolations, row.ballNumber, rewritten, 'cascade');
  }

  return {
    state,
    rewritten,
    fromIndex: index,
    changes: describeChanges(stored, index, rewritten, before, state, nameOf),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// One delivery, applied
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a delivery strictly; fall back to tolerance only for a fault that was
 * already there.
 *
 * The fallback is the difference between a feature and a trap. Without it,
 * one delivery scored under an older rule would make every later correction
 * in that match impossible — and the matches most likely to need correcting
 * are exactly the ones scored while the rules were being tightened.
 */
function step(
  state: MatchState,
  input: BallEventInput,
  priorViolations: ReadonlySet<string>,
  ballNumber: number,
  out: BallEvent[],
  phase: 'edit' | 'cascade',
): MatchState {
  try {
    const next = applyBall(state, input);
    out.push(next.balls[next.balls.length - 1]!);
    return next;
  } catch (error) {
    if (!(error instanceof ScoringError)) throw error;

    if (priorViolations.has(`${ballNumber}:${error.code}`)) {
      // Already wrong before this correction, and not made worse by it. It
      // stays on `state.violations` where a repair can find it.
      const next = applyBall(state, input, { mode: 'replay' });
      out.push(next.balls[next.balls.length - 1]!);
      return next;
    }

    if (phase === 'edit') {
      throw new BallCorrectionError(error.message, {
        code: error.code,
        ballNumber,
        over: overLabel(state, input),
      });
    }

    throw new BallCorrectionError(
      `This correction makes ball ${ballNumber} impossible: ${lowerFirst(error.message)}. ` +
        `Correct that delivery instead, or undo back to it.`,
      { code: error.code, ballNumber, over: overLabel(state, input) },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who is at each end for this delivery.
 *
 * Derived from the engine, except for the one thing the engine cannot know.
 * After a wicket the engine leaves the dismissed batter in their slot,
 * because only the scorer knows who walked in — so that single choice is read
 * back off the delivery as it was originally recorded and carried into the
 * new timeline.
 *
 * The consequence worth being explicit about: if a correction **removes** a
 * wicket, the batter who came in for it never comes in, and every delivery
 * they faced is re-credited to whoever was actually still batting. That looks
 * drastic and is correct — it is precisely what "that was not a wicket" means.
 */
function derivePair(
  state: MatchState,
  row: StoredBall,
  assertedStriker?: string,
  assertedNonStriker?: string,
): { strikerId: string; nonStrikerId: string } {
  if (assertedStriker && assertedNonStriker) {
    return { strikerId: assertedStriker, nonStrikerId: assertedNonStriker };
  }

  const inn = state.currentInnings;
  const strikerId = String(inn.strikerId);
  const nonStrikerId = String(inn.nonStrikerId);

  const last = state.balls[state.balls.length - 1];
  const departed =
    last?.wicketType && last.wicketPlayerId && BATTER_LEAVES_FIELD.has(last.wicketType)
      ? String(last.wicketPlayerId)
      : undefined;

  if (!departed) return { strikerId, nonStrikerId };

  // One slot is vacant. Whoever the scorer sent in is the id on this delivery
  // that is not the batter still standing.
  const survivor = strikerId === departed ? nonStrikerId : strikerId;
  const incoming = [row.batsmanId, row.nonStrikerId].find((p) => p !== survivor) ?? row.batsmanId;

  return {
    strikerId: strikerId === departed ? incoming : strikerId,
    nonStrikerId: nonStrikerId === departed ? incoming : nonStrikerId,
  };
}

/**
 * Which end the wicket falls at, after the strike may have moved.
 *
 * A dismissal is recorded against a person, but what the scorer observed is a
 * **slot**: the striker was bowled, the non-striker was run out. If a
 * correction upstream swapped the ends, following the person would credit the
 * dismissal to whoever is now at the other end — so the slot is what travels.
 */
function resolveWicketPlayer(
  stored: string | undefined,
  row: StoredBall,
  pair: { strikerId: string; nonStrikerId: string },
) {
  if (!stored) return undefined;
  if (stored === row.batsmanId) return asPlayerId(pair.strikerId);
  if (stored === row.nonStrikerId) return asPlayerId(pair.nonStrikerId);
  // Neither end — the engine will refuse it, and should.
  return asPlayerId(stored);
}

// ─────────────────────────────────────────────────────────────────────────────
// Explaining the result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the scorer is about to accept.
 *
 * A correction whose consequences are invisible is worse than no correction:
 * the card silently changes and nobody knows whether it changed the right
 * way. The comparison is cheap — both timelines have already been replayed —
 * and it is the thing that makes the feature trustworthy at a ground.
 */
function describeChanges(
  stored: readonly StoredBall[],
  index: number,
  rewritten: readonly BallEvent[],
  before: MatchState,
  after: MatchState,
  nameOf: (id: string) => string,
): BallCorrectionChange[] {
  const changes: BallCorrectionChange[] = [];

  for (let i = 0; i < rewritten.length; i += 1) {
    const old = stored[index + i]!;
    const now = rewritten[i]!;
    const at = { ballNumber: old.ballNumber, over: labelFor(rewritten, i) };

    if (i === 0) {
      if (old.eventType !== now.eventType || old.totalRuns !== now.totalRuns) {
        changes.push({
          ...at,
          what: 'runs',
          detail: `${describeBall(old)} → ${describeBall(now)}`,
        });
      }
      if ((old.wicketType ?? null) !== (now.wicketType ?? null)) {
        changes.push({
          ...at,
          what: 'wicket',
          detail: now.wicketType
            ? `now a wicket (${now.wicketType.replace(/_/g, ' ')})`
            : 'no longer a wicket',
        });
      }
    }

    if (old.batsmanId !== String(now.batsmanId)) {
      changes.push({
        ...at,
        what: 'strike',
        detail: `faced by ${nameOf(String(now.batsmanId))}, not ${nameOf(old.batsmanId)}`,
      });
    }
    if (old.bowlerId !== String(now.bowlerId)) {
      changes.push({
        ...at,
        what: 'bowler',
        detail: `bowled by ${nameOf(String(now.bowlerId))}, not ${nameOf(old.bowlerId)}`,
      });
    }
    if (old.overNumber !== now.overNumber) {
      changes.push({
        ...at,
        what: 'over_position',
        detail: `moves from over ${old.overNumber + 1} to over ${now.overNumber + 1}`,
      });
    }
  }

  // A batter who came in for a wicket that no longer happened.
  for (const id of Object.keys(before.batting)) {
    if (!after.batting[id]) {
      changes.push({
        ballNumber: stored[index]!.ballNumber,
        over: labelFor(rewritten, 0),
        what: 'removed_batter',
        detail: `${nameOf(id)} no longer bats in this innings`,
      });
    }
  }

  return changes;
}

function describeBall(b: {
  eventType: string;
  runsOffBat: number;
  extraRuns: number;
  totalRuns: number;
}): string {
  if (b.eventType === 'penalty') {
    return `${b.extraRuns} penalty runs`;
  }
  if (b.eventType === 'wide' || b.eventType === 'no_ball') {
    return `${b.eventType.replace('_', '-')} (${b.totalRuns})`;
  }
  if (b.eventType === 'bye' || b.eventType === 'leg_bye') {
    return `${b.extraRuns} ${b.eventType.replace('_', '-')}`;
  }
  if (b.eventType === 'dot') return 'dot';
  return `${b.runsOffBat} off the bat`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `1.4` — the position a scorer would call out.
 *
 * Counted from the rewritten sequence rather than stored, because the whole
 * reason a correction is dangerous is that these move.
 */
function labelFor(events: readonly BallEvent[], upTo: number): string {
  const over = events[upTo]!.overNumber;
  let legal = 0;
  for (let i = 0; i <= upTo; i += 1) {
    const e = events[i]!;
    if (e.overNumber === over && e.isLegalDelivery) legal += 1;
  }
  return `${over + 1}.${Math.max(1, Math.min(legal, BALLS_PER_OVER))}`;
}

/** The same label for a delivery that was refused, so it never landed in a list. */
function overLabel(state: MatchState, _input: BallEventInput): string {
  const bowled = state.currentInnings.ballsBowled;
  return `${Math.floor(bowled / BALLS_PER_OVER) + 1}.${(bowled % BALLS_PER_OVER) + 1}`;
}

function baseInput(row: StoredBall) {
  return { inningsId: asInningsId(row.inningsId), id: row.id };
}

function toInput(row: StoredBall): BallEventInput {
  return {
    ...baseInput(row),
    eventType: row.eventType as BallEventInput['eventType'],
    runsOffBat: row.runsOffBat,
    overthrowRuns: row.overthrowRuns ?? 0,
    extraRuns: row.extraRuns,
    totalRuns: row.totalRuns,
    isLegalDelivery: row.isLegalDelivery,
    isFreeHit: row.isFreeHit,
    batsmanId: asPlayerId(row.batsmanId),
    nonStrikerId: asPlayerId(row.nonStrikerId),
    bowlerId: asPlayerId(row.bowlerId),
    wicketType: (row.wicketType ?? undefined) as BallEventInput['wicketType'],
    wicketPlayerId: row.wicketPlayerId ? asPlayerId(row.wicketPlayerId) : undefined,
    fielderId: row.fielderId ? asPlayerId(row.fielderId) : undefined,
    bowlerReplacedMidOver: row.bowlerReplacedMidOver,
    commentary: row.commentary ?? undefined,
  };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
