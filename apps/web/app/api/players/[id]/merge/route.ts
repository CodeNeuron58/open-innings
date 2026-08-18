/**
 * POST /api/players/[id]/merge — fold a duplicate into this player.
 *
 * The repair half of portable identity. Global search stops new duplicates
 * being created; this joins up the ones that already exist, and there will be
 * plenty — every player created before the search existed is a candidate.
 *
 * The id in the path is the player who **keeps** their career. `duplicateId`
 * is the row that disappears, with every reference to it moving across first:
 * five columns on `ball_events`, the squad memberships, and the innings'
 * opening trio.
 *
 * ## Who may do this
 *
 * You may only dissolve a row **you created**. The asymmetry is the whole
 * safety model: merging *into* someone else's player is how a career gets
 * joined across clubs and is exactly the point, while merging someone else's
 * row *away* would let anyone erase another club's player and redirect their
 * history.
 *
 * ## Why it can refuse
 *
 * Two players who appear in the same innings cannot be one person — they
 * would be batting at both ends, or bowling to themselves. Merging them would
 * write a ball log describing a match that cannot happen, and every replay of
 * it afterwards would object, forever.
 *
 * Every refusal returns the same message. Which of "no such player", "not
 * yours" and "already claimed by someone else" applies is exactly the set of
 * facts an id-probing caller would like to learn.
 */
import { NextResponse } from 'next/server';
import { mergePlayersSchema, HTTP, type MergePlayersResponse } from '@open-innings/shared';
import { getPlayer, mergePlayerInto } from '@/lib/db/queries';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';
import { ServiceError } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

/** One message for every way this can fail. See the note above. */
const REFUSED =
  'That merge is not possible. You can only merge a player you added, into one who has not played in the same innings.';

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before the schema, so an anonymous caller gets 401 rather than
  // schema feedback describing the shape of the request.
  const userId = await requireUserId('Sign in to merge players');
  const { id: keepId } = await ctx.params;
  const { duplicateId } = await readJson(request, mergePlayersSchema);

  const moved = await mergePlayerInto(keepId, duplicateId, userId);
  if (!moved) throw new ServiceError(REFUSED, HTTP.conflict);

  const player = await getPlayer(keepId);
  if (!player) throw new ServiceError(REFUSED, HTTP.conflict);

  const body: MergePlayersResponse = {
    player: {
      id: player.id,
      fullName: player.fullName,
      shortName: player.shortName,
      battingStyle: player.battingStyle,
      bowlingStyle: player.bowlingStyle,
      role: player.role,
    },
    moved,
  };
  return NextResponse.json(body, { status: HTTP.ok });
});
