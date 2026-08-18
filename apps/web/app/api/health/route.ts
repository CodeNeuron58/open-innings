/**
 * GET /api/health — is this instance actually able to serve?
 *
 * It answered `{ status: 'ok' }` without touching Postgres, which made it a
 * liveness check wearing a readiness check's name. CI uses this as the gate
 * before all three smoke suites, so a server that was up with an unreachable
 * database reported healthy and the suites failed further along, where the
 * cause is much harder to read.
 *
 * One trivial round trip. If the database cannot answer that, nothing this
 * app does will work, because every figure it serves is derived from the ball
 * log.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const body = {
    status: 'ok',
    service: 'open-innings-web',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    // 503, not 500: the instance is fine and its dependency is not, which is
    // the distinction a load balancer and a CI wait-loop both act on.
    console.error('[health] database unreachable', error);
    return Response.json({ ...body, status: 'degraded', database: 'unreachable' }, { status: 503 });
  }

  return Response.json({ ...body, database: 'ok' });
}
