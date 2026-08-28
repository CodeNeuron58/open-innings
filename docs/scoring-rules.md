# Cricket scoring rules — how each one is modelled

Open Innings follows the **MCC Laws of Cricket** for limited-overs matches.
This file explains _how_ the engine encodes them and _why_ each choice was
made.

> **`packages/scoring/src/rules.ts` is the source of truth.** Every set named
> below is exported from it, and the rest of the codebase — including the SQL
> that computes career figures — imports those sets rather than restating them.
> If this file and that one ever disagree, the code is right and this is a bug.
> Please file it.

The reason the rules live in exported sets rather than in `if` statements is
that they are needed in more than one place. "Which dismissals credit the
bowler" is asked by the engine, by the scorecard, and by a career-stats query
in SQL. Three copies would drift; one export cannot.

---

## The shape of a delivery

Every ball is a row in `ball_events`, and the scoring parts of it are these:

| Field             | Means                                                  |
| ----------------- | ------------------------------------------------------ |
| `runsOffBat`      | Credited to the striker                                |
| `extraRuns`       | Credited to the team, not the batter                   |
| `overthrowRuns`   | Runs from the fielding error, routed by the rule below |
| `totalRuns`       | The sum — derived, never sent by a client              |
| `isLegalDelivery` | Whether this ball counted toward the over — derived    |
| `isFreeHit`       | Whether the _next_ ball is a free hit — derived        |
| `battersCrossed`  | The scorer overruling run-parity for strike rotation   |

`isLegalDelivery` and `isFreeHit` are stripped from client payloads on purpose.
Accepting them would let a client mark an ordinary delivery illegal and stop
the over ever advancing.

---

## Law 18 — Scoring runs

A boundary is always `runsOffBat` and never an extra. `eventType: '4'` and
`'6'` name their own runs, so a payload claiming `'4'` with three off the bat
is refused rather than corrected.

### Law 18.6 — Overthrows

Overthrows are recorded in their own column, not folded into `runsOffBat`, so
the ball log can still say what happened. Where they are _credited_ depends on
whether the bat was involved:

```
OVERTHROW_TO_EXTRAS_TYPES = { wide, bye, leg_bye, penalty }
```

On those four the ball never touched the bat, so the overthrows are extras. On
anything else they go to the striker, because he hit it and they ran.

A four or a six cannot carry overthrows at all — the ball has reached the rope
and is dead — and neither can a penalty, which was never bowled. That set is
`OVERTHROW_IMPOSSIBLE_TYPES`, and the database enforces the arithmetic
independently with a `CHECK` on `total_runs`.

**Boundary counting excludes overthrows.** Four runs where two came from an
overthrow is not a four in the 4s column. The batter did not hit a boundary.

---

## Law 21 — No ball

One run penalty, recorded as `extraRuns`. Runs struck off a no-ball belong to
the batter, so a no-ball hit for four is `runsOffBat: 4, extraRuns: 1`. The
delivery is not legal, so it does not count toward the over.

### Law 21.18 — The free hit

The ball after a no-ball is a free hit, and the dismissals it permits are the
no-ball's own, not "run out only":

```
NO_BALL_VALID_WICKETS = FREE_HIT_VALID_WICKETS =
  { run_out, obstructing_field, handled_ball, hit_the_ball_twice, double_hit }
```

The free hit **survives an intervening wide**, because a wide is not a legal
delivery and the free hit is granted for the next _ball faced_. Getting this
wrong is the single most common bug in cricket scoring apps, and it is covered
both by example tests and by a property test over arbitrary innings.

---

## Law 22 — Wide

One run penalty. `runsOffBat` is always zero — a wide by definition was not
struck — and any byes run off it are extras. Not a legal delivery, and **not a
ball faced**, which is why the striker's strike rate is unaffected:

```
BATSMAN_FACING_EXCLUDED_TYPES = { wide, penalty }
```

### Law 22.6 — Dismissals off a wide

```
WIDE_VALID_WICKETS =
  { stumped, run_out, hit_wicket, obstructing_field, handled_ball }
```

Bowled and caught are impossible off a wide, and the engine refuses them rather
than recording a dismissal that could not have happened.

---

## Laws 23 and 24 — Byes and leg byes

Both are legal deliveries and both **are** balls faced, so they count toward
the striker's balls even though he scores nothing. Neither is charged to the
bowler's analysis:

```
BOWLER_EXEMPT_EXTRAS = { bye, leg_bye, penalty }
```

A leg bye cannot be taken if the ball struck the batter in line while no shot
was offered — that is an umpire's decision, and the engine does not enforce it.
The scorer records what the umpire signalled.

---

## Laws 41 and 42 — Penalty runs

Five runs, awarded rather than run. `eventType: 'penalty'`, `extraRuns: 5`.

The schema pins the number exactly: **not at least five and not at most five**.
Three runs is not a smaller penalty, it is a payload describing something else,
so it is refused. A penalty is not a delivery — it does not use up a ball, is
not a ball faced, and is not charged to the bowler.

---

## Law 25 — Which dismissals credit the bowler

```
BOWLER_CREDITED_WICKETS =
  { bowled, caught, caught_behind, lbw, stumped, hit_wicket }
```

A run out, an obstruction, handling the ball, hitting it twice, timing out and
a retirement all fall to the batting side's account. The bowler's figures are
unaffected, and the career-stats SQL imports this same set rather than listing
the five again in SQL.

### Which dismissals count as a team wicket

`TEAM_WICKET_COUNTED` is broader — it adds run out, obstruction, handled ball,
timed out, retired out and hit the ball twice. **`retired_hurt` is not in it.**
A batter who retires hurt has not been dismissed, may return at the fall of a
wicket, and does not advance the score's wicket count.

### Which dismissals need a fielder named

```
REQUIRES_FIELDER = { caught, caught_behind, run_out, stumped }
```

The engine also refuses a delivery where the same person bats and bowls, or
fields their own dismissal.

---

## Retirements are not deliveries

```
NON_DELIVERY_WICKETS = { retired_hurt, retired_out, timed_out }
```

All three are recorded as `eventType: 'wicket'`, which from the event type
alone looks like a fair ball — so `isLegalDelivery` has to be derived from this
set rather than from the event type.

Getting it wrong costs the batting side a ball off the over every time somebody
retires, and in a tight chase that is a ball they never got back. Law 40 is the
same argument for timing out: nothing was bowled.

---

## The over, and the innings

`BALLS_PER_OVER = 6`, and it is a constant rather than a setting. The Hundred
and some box formats need otherwise; making it real means touching every
over-based calculation, so the field is shown disabled rather than lying.

**Law 16.2 — no bowler bowls two consecutive overs.** Enforced, and it extends
to part-overs: a bowler who bowled any of the previous over cannot start this
one.

**Law 17.4 — the bowler may not change mid-over**, except when they cannot
continue. The engine cannot derive that from the ball log, so
`bowlerReplacedMidOver` is one of the few flags accepted from the client.

**An innings ends** when the overs run out, the target is passed, or the side
is all out — and "all out" is sized from the playing XI rather than fixed:

```
STANDARD_MAX_WICKETS  = 10
SUPER_OVER_MAX_WICKETS = 2
SUPER_OVER_OVERS       = 1
```

A six-a-side team is all out at five. `maxWickets` is computed from
`match_squads`, so a seven-a-side game out of a twelve-player roster ends the
way it was actually played.

**The super over** is innings 3 and 4, and is offered only when the scores are
level. A repeated super over — where the first is also tied — is not modelled.

---

## Strike rotation

Two things decide who is on strike, and they **compose**: whether the batters
crossed, and whether the over ended. A single off the last ball of an over
leaves the same batter facing, because both flips apply.

Rotation is normally derived from run parity. That cannot see a run out where
the batters crossed and no run was completed, so `battersCrossed` lets the
scorer overrule the arithmetic, and it is asked on the wicket sheet.

---

## Shot placement

Optional, and captured only when a scorer holds a runs key rather than tapping
it. `shotAngle` is degrees clockwise from straight down the ground in the
striker's own frame; `shotDistance` is a percentage of the way to the rope.

Both or neither — an angle with no distance is a direction with no length. The
schema and a database `CHECK` both say so.

Handedness is stored on the player and is meant to be applied when the wheel is
drawn. It is **not applied yet**, so a left-hander's wheel currently reads
mirrored. That is a display gap, not a data one: what is stored is correct.

---

## Not modelled

Short runs (18.5), dead ball (20), DLS, powerplays, substitutes and impact
players, balls per over other than six, and a repeated super over.

Powerplays are displayed where a match declares them, but the engine does not
enforce fielding restrictions — nothing in a ball log can see where the
fielders were standing.
