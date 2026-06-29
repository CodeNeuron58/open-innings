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
  // eslint-disable-next-line no-var
  var __openInningsPgClient: ReturnType<typeof postgres> | undefined;
}

/**
 * Drizzle client for the Open Innings web app.
 *
 * - In production, uses the Supabase transaction pooler URL.
 * - In development, falls back to a local Postgres if DATABASE_URL is unset.
 * - The client is cached on `globalThis` to survive Next.js hot reloads.
 */
function getClient() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';

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
