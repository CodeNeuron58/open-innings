/**
 * GET  /api/players — players the signed-in user created.
 * POST /api/players — add a player.
 */
import { NextResponse } from 'next/server';
import { createPlayerSchema, HTTP } from '@open-innings/shared';
import { listPlayers } from '@/lib/db/queries';
import { createPlayerFor } from '@/lib/services/squads';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

export const GET = handle(async () => {
  // Scoped to the session inside the query layer; returns [] when signed out.
  const players = await listPlayers();
  return NextResponse.json({ players }, { status: HTTP.ok });
});

export const POST = handle(async (request: Request) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to add a player');
  const input = await readJson(request, createPlayerSchema);
  const player = await createPlayerFor(input);
  return NextResponse.json({ player }, { status: HTTP.created });
});
