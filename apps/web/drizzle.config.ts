import { defineConfig } from 'drizzle-kit';

// drizzle.config.ts — used by drizzle-kit CLI (generate/migrate/push/studio).
// Reads DATABASE_URL from the web app's .env.local.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Matches lib/db/client.ts's fallback and .env.example — keep in sync.
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/open_innings',
  },
  verbose: true,
  strict: true,
});
