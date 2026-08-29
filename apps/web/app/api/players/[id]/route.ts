/**
 * PATCH  /api/players/[id] — correct a player's name or what they do.
 * DELETE /api/players/[id] — remove a player who has never played.
 *
 * This file did not exist, so a player was write-once: a name typed wrong at
 * the ground stayed wrong on a public career page forever, and a player added
 * by mistake could not be taken back out.
 *
 * Both are scoped to whoever created the row. Squad membership is deliberately
 * open — anyone may put anybody in their side, because a cricketer who plays
 * for two clubs is one person — but editing the player themselves is not the
 * same act as picking them.
 */
import { NextResponse } from 'next/server';
import { updatePlayerSchema, HTTP } from '@open-innings/shared';
import { getPlayer } from '@/lib/db/queries';
import { updateOwnedPlayer, deleteOwnedPlayer } from '@/lib/services/squads';
import { readJson, handle, assertId } from '@/lib/api/respond';

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

  const input = await readJson(request, updatePlayerSchema);
  await updateOwnedPlayer(id, input);

  const player = await getPlayer(id);
  return NextResponse.json({ player }, { status: HTTP.ok });
});

export const DELETE = handle(async (_request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  assertId(id);

  // Refuses with a 409 and a sentence when the player has appeared in a match
  // — see `deleteOwnedPlayer`, which names merge as the alternative.
  await deleteOwnedPlayer(id);

  return NextResponse.json({ deleted: true }, { status: HTTP.ok });
});
