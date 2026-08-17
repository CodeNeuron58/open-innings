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
 * Drizzle client for the Open Innings web app. Connects directly to
 * Postgres — no pooler service, self-hosted or otherwise.
 *
 * TLS is decided by `sslFor` rather than by the connection string, because a
 * managed provider owns that string and rewrites it on credential rotation.
 * See lib/db/ssl.ts.
 *
 * The client is cached on `globalThis` in development to survive Next.js
 * hot reloads without leaking a new connection pool on every edit.
 */
function getClient() {
  // Matches .env.example's default local setup — keep these in sync.
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/open_innings';

  const options = { prepare: false, max: 10, ssl: sslFor(connectionString) } as const;

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
