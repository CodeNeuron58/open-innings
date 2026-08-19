import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { sslFor } from './ssl';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env.local in dev / scripts when run outside Next.js.
// Safe to call multiple times — dotenv caches by path.
if (!process.env.DATABASE_URL) {
  config({ path: resolve(process.cwd(), '.env.local') });
}

declare global {
  var __openInningsPgClient: ReturnType<typeof postgres> | undefined;
}

/**
 * Drizzle client for the Open Innings web app. Connects directly to Postgres.
 * Client is cached on `globalThis` in development for Next.js hot reloads.
 */
function getClient() {
  const configured = process.env.DATABASE_URL;

  /*
   * In production, refuse rather than guess.
   *
   * Falling back to a localhost default when `DATABASE_URL` is missing means a
   * misconfigured deploy connects to nothing in particular and fails somewhere
   * later, with an error about a refused connection rather than about the
   * variable that is actually absent. `scripts/migrate.ts` already exits on
   * this; the app should too.
   */
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is not set. Refusing to fall back to localhost in production.');
  }

  // Matches .env.example's default local setup — keep these in sync.
  const connectionString = configured ?? 'postgresql://postgres:postgres@localhost:5432/open_innings';

  const options = {
    /*
     * Prepared statements are worth having.
     *
     * `prepare: false` is what you need in front of a transaction-mode
     * pooler like pgBouncer, which can hand the second half of a prepared
     * statement to a different backend. There is no pooler in this stack —
     * the app connects straight to Postgres, which is the whole reason
     * `sslFor` exists — so this was a pure cost: every query re-planned,
     * every time, including the per-ball ones on the scoring path.
     *
     * If a pooler is ever put in front of this, set it back to false in the
     * same change.
     */
    prepare: true,

    /*
     * A ceiling, not a reservation — with `idle_timeout` below, connections
     * are handed back rather than held. Overridable because the right number
     * is a function of dyno count and the plan's total, and scaling out should
     * not need a code change: two dynos at 10 each is the whole Essential
     * allowance.
     */
    max: Math.max(1, Number(process.env.DATABASE_POOL_MAX) || 10),

    /*
     * Heroku Essential allows roughly twenty connections in total. Two dynos
     * at `max: 10` is the entire budget, which leaves nothing for
     * `scripts/migrate.ts` in the release phase, nothing for `heroku pg:psql`,
     * and nothing for a third dyno — which simply fails to connect.
     *
     * Idle connections were previously held for ever, so a traffic spike
     * permanently claimed the whole allowance. These three settings are what
     * hand it back.
     */
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 10,

    ssl: sslFor(connectionString),
  } as const;

  if (process.env.NODE_ENV === 'production') {
    return postgres(connectionString, options);
  }

  if (!global.__openInningsPgClient) {
    global.__openInningsPgClient = postgres(connectionString, options);
  }
  return global.__openInningsPgClient;
}

export const db = drizzle(getClient(), { schema });
export type Database = typeof db;
export { schema };
