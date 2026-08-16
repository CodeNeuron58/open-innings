/**
 * GET /api/players/briefs?ids=a,b,c — career context for a list of players.
 *
 * Exists because three screens want a line beside each name in a list: the XI
 * picker, the openers picker, and the add-a-player search. Reaching for
 * `/api/players/[id]/stats` per row is twenty-two round trips on a screen
 * someone is trying to get past, at a ground, on mobile data.
 *
 * Deliberately **not** a shrunken career page. It answers a different
 * question — "is this the right S. Kurien?" — and carries only the figures
 * that separate two people with the same name.
 *
 * Authenticated, unlike `/stats`. A career page is a shareable artifact and
 * has to open for anyone; this is a bulk lookup and there is no reason to let
 * a stranger enumerate figures for arbitrary id lists.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { careerBriefsFor } from '@/lib/db/stats';
import { getUserId } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';
import { invalid, unauthorized } from '@/lib/services/errors';

/**
 * A generous squad and then some. The cap is here so one request cannot ask
 * about every player in the database — the query is cheap per id, but
 * unbounded is unbounded.
 */
const MAX_IDS = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = handle(async (request: Request) => {
  const userId = await getUserId();
  if (!userId) throw unauthorized();

  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  if (ids.length === 0) return NextResponse.json({ briefs: [] }, { status: HTTP.ok });
  if (ids.length > MAX_IDS) {
    throw invalid(`Too many ids — ${MAX_IDS} at a time.`, 'ids');
  }
  // Interpolated into `::uuid` casts, so a malformed id is a database error
  // rather than a 400. Rejected here where the message can say what is wrong.
  if (ids.some((id) => !UUID.test(id))) {
    throw invalid('Every id must be a UUID.', 'ids');
  }

  const briefs = await careerBriefsFor(ids);
  return NextResponse.json({ briefs }, { status: HTTP.ok });
});
