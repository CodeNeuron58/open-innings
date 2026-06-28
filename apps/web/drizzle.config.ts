import { defineConfig } from 'drizzle-kit';

// drizzle.config.ts — used by drizzle-kit CLI (generate/migrate/push/studio).
// Reads DATABASE_URL from the web app's .env.local.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
  },
  verbose: true,
  strict: true,
});
