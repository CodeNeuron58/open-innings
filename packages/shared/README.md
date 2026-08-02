# @open-innings/shared

The API contract. Everything the web backend and the mobile client must agree
on, in one place: enum values, request schemas, response types, and pure
helpers.

No I/O, no database driver, no framework — so it imports cleanly into a React
Native bundle.

## Why this exists

A REST boundary is exactly where a client and server drift apart. The server
renames a field, the client keeps sending the old one, and nothing complains
until a user hits it.

Here, both sides import the same Zod schema. The server validates with it; the
client infers its request types from it. A rename breaks compilation on both
sides at once.

## What's in it

| Module       | Contents                                                          |
| ------------ | ----------------------------------------------------------------- |
| `enums.ts`   | Canonical domain enum values — batting styles, wicket types, etc. |
| `schemas.ts` | Zod schemas for every API input, with user-facing messages        |
| `api.ts`     | Error contract, auth response shapes, named HTTP statuses         |
| `toss.ts`    | `resolveBattingSides` — who bats first, given the toss            |

## The enum duplication, and why it's safe

These enums are also defined as Postgres enums in `apps/web/lib/db/schema.ts`.
They're restated here because the mobile app can't import that file — doing so
would drag the `postgres` driver into a React Native bundle.

Restating means they can drift, and drift is nasty: the app offers a bowling
style the database rejects, and you find out in production.

So `apps/web/lib/db/enum-conformance.ts` asserts the two agree at the type
level. It emits no runtime code and exists only to turn drift into a `tsc`
failure. Add a value on one side only and `pnpm typecheck` names the enum that
broke.

## Where validation stops

These schemas prove **shape**, not authority and not cricket law.

- Squad membership needs a database round trip → the route handler checks it.
- Whether a bowler may bowl this over is Law 16.2 → `@open-innings/scoring`
  decides, and throws `ScoringError`.

Don't reimplement either here. Layers that disagree about what they own are
how a rule gets enforced in two places and then fixed in one.

## Tests

```sh
pnpm --filter @open-innings/shared test
```

Covers the rules that live only in the schema — toss all-or-nothing, blank
strings collapsing to `NULL`, duplicate openers — plus toss resolution.
