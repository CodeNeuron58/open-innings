-- =============================================================================
-- Open Innings — sessions table for local email/password auth
-- =============================================================================
-- Adds the `sessions` table. The Drizzle schema (lib/db/schema.ts) creates
-- this automatically via `drizzle-kit migrate`, so this file is currently a
-- no-op placeholder.
--
-- It exists for two reasons:
--   1. Keeps migration numbering consistent with v0.1 history.
--   2. Reserves a slot for future auth-related schema changes that can't
--      be expressed in TypeScript (e.g. a partial index for cleanup jobs).
-- =============================================================================

-- Reserved for future use. No-op.
select 1;