/**
 * GET  /api/teams — teams the signed-in user owns.
 * POST /api/teams — create a team, optionally seeding its squad.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTeamSchema, HTTP } from '@open-innings/shared';
import { listTeams } from '@/lib/db/queries';
import { createTeamFor } from '@/lib/services/squads';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';

/** Squad seeding is a create-time convenience, not part of the team itself. */
const createTeamBody = createTeamSchema.and(
  z.object({ playerIds: z.array(z.string().trim().min(1)).optional() }),
);

export const GET = handle(async () => {
  const teams = await listTeams();
  return NextResponse.json({ teams }, { status: HTTP.ok });
});

export const POST = handle(async (request: Request) => {
  // Auth before the schema — see requireUserId.
  await requireUserId('Sign in to create a team');
  const input = await readJson(request, createTeamBody);
  const team = await createTeamFor(
    { name: input.name, shortName: input.shortName, homeGround: input.homeGround },
    input.playerIds ?? [],
  );
  return NextResponse.json({ team }, { status: HTTP.created });
});
