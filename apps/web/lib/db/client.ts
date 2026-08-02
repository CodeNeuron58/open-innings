import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
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
 * Postgres — no pooler service, self-hosted or otherwise. For a remote
 * database, add `?sslmode=require` to DATABASE_URL; postgres.js reads that
 * straight off the connection string, no extra config needed here.
 *
 * The client is cached on `globalThis` in development to survive Next.js
 * hot reloads without leaking a new connection pool on every edit.
 */
function getClient() {
  // Matches .env.example's default local setup — keep these in sync.
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/open_innings';

  if (process.env.NODE_ENV === 'production') {
    return postgres(connectionString, { prepare: false, max: 10 });
  }

  if (!global.__openInningsPgClient) {
    global.__openInningsPgClient = postgres(connectionString, { prepare: false, max: 10 });
  }
  return global.__openInningsPgClient;
}

export const db = drizzle(getClient(), { schema });
export type Database = typeof db;
export { schema };
