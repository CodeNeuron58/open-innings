# Security

Open Innings holds real accounts: an email address, a password hash, and the
scorebook of every match somebody has recorded. If you find a way to reach any
of that, we want to hear from you before anyone else does.

## Reporting a vulnerability

**Email <support@openinnings.com>.** Please don't open a public issue for
anything that could be exploited — an issue is world-readable the moment it is
filed, and a scoring app has no way to protect its users between the report and
the fix.

Include enough to reproduce it: the endpoint or screen, what you sent, what
came back, and what you expected instead. A curl command is ideal.

You'll get a reply within a few days. This is a project with one maintainer and
no security team, so the honest promise is attention rather than a service
level: an acknowledgement that a human has read it, then a fix or an
explanation of why it isn't one.

If you'd like credit in the release that fixes it, say so and how you'd like to
be named. If you'd rather not be named, that's fine too.

## What is in scope

The deployed app at **openinnings.com**, the REST API under `/api`, the Android
app, and this repository.

Things worth looking at, because they are where the risk actually lives:

- **Authentication** — argon2id hashes, server-side sessions, bearer tokens
  that are the same opaque value as the session cookie. `apps/web/lib/auth/`.
- **Authorisation** — every mutating route calls `requireUserId` and scopes
  rows to their owner. A route that forgets is the bug class that matters most
  here.
- **The public endpoints** — the scorecard, career, club, summary, card and
  export routes take no credential by design. They should disclose exactly what
  a shared link already discloses and nothing more.
- **Account deletion** — `DELETE /api/me` anonymises rather than deletes, so
  that historical matches keep working. Anything it leaves behind that still
  identifies a person is a bug.

## What is out of scope

- Reports from automated scanners with no demonstrated impact.
- Missing headers or TLS configuration on hosts we don't control.
- Anything requiring physical access to an unlocked device, or a compromised
  Google account.
- Social engineering, and denial of service by volume.
- Self-hosted deployments configured differently from this repository's
  defaults. If you self-host, `SESSION_SECRET` and your database credentials
  are yours to protect.

## Things we already know

Stated up front so nobody spends an evening on them:

- **`EXPO_PUBLIC_*` variables are compiled into the Android bundle and are not
  secret.** That includes the RevenueCat _public_ SDK key, which identifies the
  app and authorises nothing. The secret key is a different string and must
  never appear in this repository or in a build.
- **`pnpm db:seed` creates `dev@local` with a password published in this
  repository.** It refuses to run against a non-local database or with
  `NODE_ENV=production`. It is a development fixture, not a backdoor.
- **Public scorecards are permanent and unlisted, not private.** Anyone with
  the link can read the match. That is what sharing a scorecard means, and it
  is stated on the screen that offers the link.

## Supported versions

The deployed app and the tip of `master`. There are no maintained release
branches, and no backports — a fix ships forward.
