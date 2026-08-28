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
sides at once, at build time, instead of at runtime on somebody's phone in a
field.

## What's in it

| Module       | Contents                                                          |
| ------------ | ----------------------------------------------------------------- |
| `enums.ts`   | Canonical domain enum values — batting styles, wicket types, etc. |
| `schemas.ts` | Zod schemas for every API input, with user-facing messages        |
| `api.ts`     | Error contract, auth and response shapes, named HTTP statuses     |
| `toss.ts`    | `resolveBattingSides` — who bats first, given the toss            |

## The enum duplication, and why it's safe

These enums are also Postgres enums in `apps/web/lib/db/schema.ts`. They are
restated here because the mobile app cannot import that file — doing so would
drag the `postgres` driver into a React Native bundle.

Restating means they can drift, and drift is nasty: the app offers a bowling
style the database rejects, and you find out in production.

So `apps/web/lib/db/enum-conformance.ts` asserts the two agree **at the type
level**. It emits no runtime code and exists only to turn drift into a `tsc`
failure. Add a value on one side and `pnpm typecheck` names the enum that
broke.

## Cross-field rules live in `superRefine`

Some rules are about a payload as a whole rather than any one field: a penalty
is exactly five runs, a boundary cannot carry overthrows, an `eventType` that
names its own runs must agree with `runsOffBat`, and shot placement is both
values or neither.

Those live in `refineBallConsistency`, applied by both
`consistentBallEventSchema` (recording) and `patchBallSchema` (correcting) —
because a correction has to be as internally consistent as the delivery it
replaces.

> **Order matters in that function**, and getting it wrong is silent. One
> branch returns early for every event type that names its own runs, so any
> rule placed after it never applies to a scoring shot. That is exactly how the
> shot-placement check sat dormant for weeks: live for extras, which never
> carry a placement, and dead for the deliveries that do. Unconditional rules
> go at the top.

## Where validation stops

These schemas prove **shape**, not authority and not cricket law.

- Squad membership needs a database round trip → the route handler checks it.
- Whether a bowler may bowl this over is Law 16.2 → `@open-innings/scoring`
  decides, and throws `ScoringError`.

Don't reimplement either here. Layers that disagree about what they own are how
a rule gets enforced in two places and then fixed in one.

## Tests

```sh
pnpm --filter @open-innings/shared test    # 45 tests
```

Covers the rules that live only in the schema — toss all-or-nothing, blank
strings collapsing to `NULL`, duplicate openers, penalty runs, overthrow
impossibility and shot-placement pairing — plus toss resolution.

The ball-consistency tests are **grouped by event type on purpose**, because a
rule that applies to only one branch of that function looks perfectly fine to a
test that uses only one event type.
