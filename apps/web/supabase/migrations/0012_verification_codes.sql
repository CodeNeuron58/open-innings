-- =============================================================================
-- Open Innings — a six-digit code is not a token, and cannot be stored like one
-- =============================================================================
-- Email confirmation moves from a link to a code typed into the app. The
-- reason is the phone in your hand: a link sends you out to a mail client and
-- back, on the one screen where you have just finished signing up and want to
-- start scoring. A code keeps you where you are.
--
-- ## Why this needs a column rather than reusing `token_hash`
--
-- A 32-byte link token is unguessable, so SHA-256 is a perfectly good way to
-- store it: an attacker holding the hash has nothing to try.
--
-- A six-digit code has **one million** possibilities. Against SHA-256 that is
-- not a search, it is a lookup table somebody built years ago — a leaked row
-- would give up the code in the time it takes to read it. Sessions and reset
-- tokens are safe from a database leak today, and adding a weakly-hashed
-- credential beside them would put that back.
--
-- So codes are hashed with **Argon2**, the same function as passwords, which
-- is deliberately slow. A million guesses at roughly 80ms each is about a day
-- of work against a code that expires in ten minutes.
--
-- Argon2 needs its salt, hence the column. It is nullable because link tokens
-- do not use it, and both kinds of secret live in the same table for the same
-- reason they always did: they are one mechanism with two shapes.
-- =============================================================================

alter table verification_tokens add column if not exists code_salt text;

-- A row is one or the other, never both and never neither in a way that would
-- make it unverifiable. A code carries a salt; a link token does not.
--
-- NOT VALID for the reason migration 0010 explains: this runs in Heroku's
-- release phase, and a scan that fails over a row written last week would take
-- the deploy down with it. New and updated rows are checked from now on, which
-- is the part that matters.
alter table verification_tokens
  add constraint verification_tokens_code_salt_shape
  check (
    (purpose = 'email_verify' and code_salt is not null)
    or (purpose <> 'email_verify' and code_salt is null)
  ) not valid;

comment on column verification_tokens.code_salt is
  'Argon2 salt, set only for short numeric codes. A six-digit secret cannot be stored under a fast hash: one million possibilities is a lookup table, not a search.';
