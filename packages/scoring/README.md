# @open-innings/scoring

The cricket scoring engine. Pure functions, no I/O, no framework, no DOM — it
runs unchanged in Next.js on the server, in a browser, and in React Native.

That portability is the point: this package is the reason the Android app did
not need the rules written twice, and the reason offline scoring works. The
console folds pending deliveries through this same function against the
server's last answer, so what a scorer sees with no signal is not an optimistic
guess — it is the same arithmetic the API would have done.

**This package has no dependencies, deliberately.** Anything it needs that is
not in the language, it owns.

## The model

**`BallEvent` is the source of truth. `MatchState` is derived.**

```ts
applyBall(state: MatchState, event: BallEventInput): MatchState
```

Every ball is an immutable event appended to a log. Match state is a fold over
that log. Undo is not a reverse operation — it drops the last event and
replays, which is why it can never leave the scorecard in a corrupt state, and
why correcting the third ball of an over rotates the strike for every delivery
after it without anyone writing code to do that.

## Usage

```ts
import { applyBall, initialState, replayEvents, buildScorecard } from '@open-innings/scoring';

const state = replayEvents(initialState(seed), events);
const next = applyBall(state, { eventType: '4', runsOffBat: 4 /* … */ });
const view = buildScorecard(next);
```

Invalid input throws `ScoringError` with a code and a message written for a
scorer, not a developer. Catch it and show the message rather than trusting
client-side validation.

### Two modes, and the distinction matters

```ts
applyBall(state, event); // strict — recording a delivery
applyBall(state, event, { mode: 'replay' }); // lenient — reading the log back
```

Replay runs on **every read**, so a rule tightened today would otherwise be
applied retroactively to deliveries recorded before it existed, and a match
containing one would stop rendering. In `replay` mode the delivery is applied
anyway and the objection is recorded on `state.violations`.

**Validate on write, tolerate on read.** A shared scorecard never breaks
because the laws improved.

## Rules covered

The laws are encoded as **exported sets** in `rules.ts` rather than as `if`
statements, because the same question gets asked in more than one place — the
engine, the scorecard, and a career-stats query in SQL all need to know which
dismissals credit a bowler. Three copies would drift; one export cannot.

`docs/scoring-rules.md` in the repository root explains each one and why it is
modelled the way it is.

The two most common bugs in cricket scoring software are both covered by tests
here: a wide is never touched by the bat, so its runs are always extras; and a
no-ball's one-run penalty is an extra while runs struck off it belong to the
batter.

## Tests

```sh
pnpm --filter @open-innings/scoring test    # 190 tests
```

Two kinds, deliberately:

- **Example tests** for the cases somebody thought of.
- **Property tests** (`fast-check`) for the ones nobody did — laws asserted
  over _any_ sequence of deliveries, shrinking a failure to the smallest input
  that still breaks it.

The property file **restates the Laws rather than importing this package's own
rule sets**. A test that asks the code under test what the rule is will pass
however wrong the rule is.

> Tests here run under Node, where `globalThis.crypto` exists. `uuid.ts` takes
> it away on purpose, because Hermes has no WebCrypto global and a bare
> `crypto.randomUUID()` in this package once meant the first ball scored on a
> phone threw. Any environment assumption added here wants the same treatment.

**Do not modify this package except to fix a proven rules bug**, with a test
that fails without the fix. If a change elsewhere seems to require touching the
engine, the change is probably wrong.
