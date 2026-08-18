-- =============================================================================
-- Open Innings — proving an email address, and getting back into an account
-- =============================================================================
-- Nothing was ever verified. An account could be opened as `a@a.a`, score a
-- whole season, and there was no way to reach the person who owned it — which
-- also meant there was no way to reset a forgotten password, because there was
-- nowhere to send the link. For twelve testers over fourteen days that is not
-- a theoretical gap: somebody forgets, and today that account and every match
-- it created are unreachable forever.
--
-- ## One table, two purposes, and room for a third
--
-- Email verification and password reset are the same machine: a single-use
-- secret, an expiry, a limit on guessing, and a record that it was spent. They
-- are one table separated by `purpose` rather than two tables that would drift.
--
-- `phone_verify` is in the enum already and nothing issues it. Phone OTP needs
-- DLT registration with TRAI — a telecom approval queue measured in weeks, not
-- an afternoon — so the columns and the enum value are laid down now, while
-- they are free, and the SMS sender arrives whenever that clears. The token
-- store, the expiry, the attempt limiting and the consume path will already
-- exist and already be tested.
--
-- ## Why the token is hashed
--
-- Same reason `sessions.token_hash` is. A reset token is a bearer credential:
-- whoever holds it can take the account. Storing it in the clear means a
-- database dump — or a stray log line, or a backup on somebody's laptop —
-- hands over every account with a live reset in flight. The row proves a token
-- was issued; it cannot reproduce it.
-- =============================================================================

-- ── Users: what has actually been proven about this account ─────────────────
--
-- Deliberately nullable timestamps rather than booleans. "When was this
-- confirmed" answers "is it confirmed" for free, and a boolean throws the
-- answer away — which matters the first time somebody asks whether an address
-- was verified before or after a match was scored.

alter table users add column if not exists email_verified_at timestamptz;

-- Laid down for phone auth, unused until DLT clears. Nullable and unique
-- together mean many accounts may have no number, and no two may share one:
-- Postgres does not treat NULLs as equal in a unique index, which is exactly
-- the behaviour wanted here.
alter table users add column if not exists phone text;
alter table users add column if not exists phone_verified_at timestamptz;

create unique index if not exists users_phone_key on users (phone) where phone is not null;

-- ── The tokens ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_purpose') then
    create type verification_purpose as enum ('email_verify', 'password_reset', 'phone_verify');
  end if;
end
$$;

create table if not exists verification_tokens (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,
  purpose verification_purpose not null,

  -- SHA-256 of the token that was sent. See the note above.
  token_hash text not null,

  -- The address or number it was sent to, as it stood when it was issued.
  --
  -- Not read back from `users` at consume time on purpose: a reset link sent
  -- to an old address must not become valid for a new one, and "confirm this
  -- change of email" is the obvious next feature that would break if this
  -- were derived rather than recorded.
  sent_to text not null,

  expires_at timestamptz not null,

  -- Single use. Set at the moment it is spent, so a link forwarded, cached by
  -- a mail client's link scanner, or opened twice cannot be replayed.
  used_at timestamptz,

  -- Guesses against this token. A reset code is 32 random bytes and cannot be
  -- brute-forced, but this also counts *consume attempts with the wrong
  -- token by the same user*, which is the signal worth having.
  attempts smallint not null default 0,

  created_at timestamptz not null default now(),

  -- A token that expires before it is issued cannot be produced by any code
  -- path, and a row where it holds means something wrote to this table
  -- directly and got it wrong.
  constraint verification_tokens_expiry_after_creation check (expires_at > created_at),
  constraint verification_tokens_attempts_sane check (attempts >= 0 and attempts <= 100)
);

-- The consume path looks a token up by its hash and nothing else, so this is
-- the index that matters. Unique because two live tokens hashing the same
-- would make "which account does this open" ambiguous.
create unique index if not exists verification_tokens_hash_key
  on verification_tokens (token_hash);

-- Issuing a new token invalidates that user's earlier ones of the same
-- purpose, and sweeping expired rows scans by expiry. Both read this.
create index if not exists verification_tokens_user_purpose_idx
  on verification_tokens (user_id, purpose, expires_at desc);

create index if not exists verification_tokens_expiry_idx
  on verification_tokens (expires_at);

comment on table verification_tokens is
  'Single-use secrets for confirming an email address and resetting a password. Hashed, expiring, spent once. phone_verify is reserved and unissued until DLT registration clears.';
