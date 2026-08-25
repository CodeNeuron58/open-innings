/**
 * A stored delivery, as the engine wants it.
 *
 * Three files held a byte-identical copy of this — the scorer route, the public
 * match page, and the match summary service — each spreading the row and then
 * converting the same six fields from null to undefined.
 *
 * That is not merely untidy. Every one of them is a **replay**: the ball log is
 * the source of truth, and these functions are how it is read back. A field
 * missing from one of the three copies is a field silently dropped on whatever
 * that copy renders — and because a replay produces a plausible-looking
 * scorecard either way, nothing would say so.
 *
 * Adding `shotAngle` (migration 0019) is what made it obvious: the typechecker
 * pointed at all three at once, and the choice was to patch three copies or
 * stop having three. Anything added to `ball_events` from here on has exactly
 * one place to be carried.
 *
 * ## null → undefined
 *
 * Postgres says "no value" with null; the engine's optional fields say it with
 * undefined. That is the whole of the conversion, plus branding the ids so a
 * player id cannot be passed where an innings id belongs.
 */
import { asInningsId, asPlayerId, type BallEventInput } from '@open-innings/scoring';
import type { BallEvent as BallRow } from '@/lib/db/schema';

export function toBallEventInput(row: BallRow): BallEventInput {
  return {
    ...row,
    inningsId: asInningsId(row.inningsId),
    batsmanId: asPlayerId(row.batsmanId),
    nonStrikerId: asPlayerId(row.nonStrikerId),
    bowlerId: asPlayerId(row.bowlerId),
    wicketPlayerId: row.wicketPlayerId ? asPlayerId(row.wicketPlayerId) : undefined,
    fielderId: row.fielderId ? asPlayerId(row.fielderId) : undefined,
    wicketType: row.wicketType ?? undefined,
    commentary: row.commentary ?? undefined,
    // Reserved, and carried. A replay that dropped these would erase the
    // placement of every delivery it touched. See migration 0019.
    shotAngle: row.shotAngle ?? undefined,
    shotDistance: row.shotDistance ?? undefined,
  };
}

/** The same, for a whole innings. */
export function toBallEventInputs(rows: BallRow[]): BallEventInput[] {
  return rows.map(toBallEventInput);
}
