/**
 * GET /api/players/briefs?ids=a,b,c
 * Bulk lookup for basic career context to disambiguate names. Authenticated.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { careerBriefsFor } from '@/lib/db/stats';
import { getUserId } from '@/lib/auth/local';
import { handle } from '@/lib/api/respond';
import { invalid, unauthorized } from '@/lib/services/errors';

/** Maximum ids per request to prevent unbounded queries. */
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
  // Validate UUIDs before database query to return 400 instead of 500.
  if (ids.some((id) => !UUID.test(id))) {
    throw invalid('Every id must be a UUID.', 'ids');
  }

  const briefs = await careerBriefsFor(ids);
  return NextResponse.json({ briefs }, { status: HTTP.ok });
});
