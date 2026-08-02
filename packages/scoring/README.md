# @open-innings/scoring

The cricket scoring engine. Pure functions, no I/O, no framework, no DOM —
it runs unchanged in Next.js on the server, in a browser, and in React Native.

That portability is deliberate: this package is the reason the Android app
did not need the rules rewritten.

## The model

**`BallEvent` is the source of truth. `MatchState` is derived.**

```ts
applyBall(state: MatchState, event: BallEventInput): MatchState
```

Every ball is an immutable event appended to a log. Match state is a fold over
that log. Undo is not a reverse operation — it drops the last event and
replays, which is why it can never leave the scorecard in a corrupt state.

## Usage

```ts
import { applyBall, initialState, replayEvents, buildScorecard } from '@open-innings/scoring';

const state = replayEvents(initialState(seed), events);
const next = applyBall(state, { type: 'runs', runs: 4 /* … */ });
const view = buildScorecard(next);
```

Invalid input throws `ScoringError` — callers should catch it and surface the
message rather than trusting client-side validation.

## Rules covered

Laws implemented include no-ball and wide penalties, byes and leg byes,
strike rotation, end-of-over bowler change (Law 16.2, no consecutive overs),
all dismissal types, run-outs on either batter, maiden-over detection, fall of
wicket, partnerships, and second-innings target chasing.

A wide is never touched by the bat, so its runs are always extras and never
credited to the batter. A no-ball's one-run penalty is an extra; runs scored
off the bat on a no-ball belong to the batter. These two cases are the most
common source of bugs in cricket scorers — both are covered by tests.

## Tests

```sh
pnpm --filter @open-innings/scoring test
```

This package is the most thoroughly tested part of the codebase and the only
part with full unit coverage. **Do not modify it except to fix a proven rules
bug** — if a change elsewhere seems to require touching the engine, the change
is probably wrong.
