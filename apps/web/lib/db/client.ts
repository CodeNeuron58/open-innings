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
