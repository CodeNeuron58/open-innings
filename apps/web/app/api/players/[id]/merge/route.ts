/**
 * POST /api/players/[id]/merge
 * Merge a duplicate player into this one. You can only dissolve a duplicate you created.
 * Refused if players appeared in the same innings.
 */
import { NextResponse } from 'next/server';
import { mergePlayersSchema, HTTP, type MergePlayersResponse } from '@open-innings/shared';
import { getPlayer, mergePlayerInto } from '@/lib/db/queries';
import { readJson, handle, assertId } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';
import { ServiceError } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

/** Generic failure message to prevent ID probing. */
const REFUSED =
  'That merge is not possible. You can only merge a player you added, into one who has not played in the same innings.';

export const POST = handle(async (request: Request, ctx: RouteParams) => {
  // Auth before schema validation to prevent anonymous probing.
  const userId = await requireUserId('Sign in to merge players');
  const { id: keepId } = await ctx.params;
  assertId(keepId);
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
