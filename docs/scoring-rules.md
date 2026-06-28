# Cricket scoring rules — reference

Open Innings follows the **MCC Laws of Cricket** (2022 edition) for limited-overs matches (T20, T10, ODI). This document is the source of truth for how the scoring engine implements each rule.

> ⚠️ The scoring engine (`lib/scoring/engine.ts`) is the actual source of truth for *implementation*. This document explains the *intent*. When they conflict, the code wins — but file a bug.

## Law 1–20: The players, umpires, equipment

Out of scope for the scoring engine. We track:

- Teams (squad of 11 in ODI/T20, 6–8 in T10)
- Captain, wicketkeeper
- Substitute players (post v0.1)

## Law 17: Practice on the field

Out of scope.

## Law 18: Scoring runs

### Law 18.1 — A run is scored

A run is credited to the batsman when they:
- Hit the ball and run to the other end
- Run without hitting (called a "bye")
- Run after hitting but ball didn't touch the bat (still a run off the bat)

**In our schema:**
- `runsOffBat` = runs credited to the batsman (0–6)
- `extraRuns` = any extras (wides, no-balls, byes, leg-byes)
- `totalRuns` = `runsOffBat + extraRuns`

### Law 18.5 — Boundaries

A "four" is when the ball touches the ground before crossing the boundary. A "six" is when it passes over the boundary on the full.

- `eventType: '4'` → ball reached boundary after bouncing, +4 to batsman
- `eventType: '6'` → ball cleared boundary, +6 to batsman
- A boundary is always `runsOffBat`; never `extraRuns`

### Law 18.6 — Overthrows

Runs completed plus any from overthrows. In our engine, this is modelled as `runsOffBat: N` where N includes the overthrow runs. (We could split into `runsOffBat` and `overthrowRuns` for finer stats, but for v0.1 we aggregate.)

## Law 19 — Boundaries

A ball that crosses the boundary without bouncing is a 6. A ball that bounces first is a 4. All runs awarded.

## Law 20 — Dead ball

When the ball is "dead" (lost, strike called, etc.), the ball doesn't count. **In our engine:** dead-ball situations are not currently modelled. We treat all balls as live. v0.2 will add support for umpire-call dead balls.

## Law 21 — No ball

A no-ball is a delivery that is illegal (overstepping, breaking the popping crease, etc.). The batting team gets +1 penalty plus any runs off the bat. The batsman faces the next ball again ("free hit" in limited-overs).

**In our schema:**
- `eventType: 'no_ball'`
- `extraRuns: 1 + runsOffBat` (penalty + runs)
- `isLegalDelivery: false` (doesn't count toward the over)
- The **next ball** has `isFreeHit: true` (in limited-overs)
- Wicket on a free hit = only run-out counts (Law 21.18)

**Edge case:** batsman can be run out on a free hit. Our engine allows this.

## Law 22 — Wide ball

A ball too wide or too high to be reachable. +1 penalty plus any runs off the bat. Re-bowled.

**In our schema:**
- `eventType: 'wide'`
- `extraRuns: 1 + runsOffBat` (penalty + runs)
- `isLegalDelivery: false`
- `runsOffBat: 0` (wide means batsman didn't hit it)
- If byes are taken on a wide, they go in `extraRuns`, not `runsOffBat`

## Law 23 — Bye

Runs completed when the ball hasn't been hit by the bat or hand. Not credited to the batsman.

**In our schema:**
- `eventType: 'bye'`
- `runsOffBat: 0`
- `extraRuns: N` (the bye runs)
- `isLegalDelivery: true`

## Law 24 — Leg bye

Same as bye, but the ball hit the batsman's body (not the bat) and they ran.

**In our schema:**
- `eventType: 'leg_bye'`
- `runsOffBat: 0`
- `extraRuns: N`
- `isLegalDelivery: true`

**Important:** leg-byes cannot be taken if the ball hits the batsman in line with the stumps (potential LBW) — umpire's call. Our engine doesn't enforce this; the scorer decides.

## Law 25 — Penalty runs

Penalty runs awarded for various infractions (time-wasting, ball tampering, etc.). v0.1 doesn't model these.

## Law 26 — Lost ball

If the ball is lost, the ball is dead and a new ball is taken. Runs scored before the ball was lost count. We model this as separate ball events in the same over.

## Law 27 — Batsman returning to original end

When a batsman crosses and returns. The non-striker becomes striker, and vice versa. We model this in `batsmanId` and `nonStrikerId` of the next ball.

## Law 28 — The follow-on (Test cricket)

Not implemented in v0.1 (Test cricket is v0.3+).

## Law 29 — The wicket

A wicket is one of:

- **Bowled** — the ball hits the stumps
- **Caught** — batsman hits the ball and a fielder catches before it bounces
- **Caught behind** — same as caught, but the wicketkeeper caught it
- **LBW** — Leg Before Wicket (would have hit the stumps)
- **Run out** — batsman fails to make the crease
- **Stumped** — wicketkeeper breaks the stumps while batsman is out of crease
- **Hit wicket** — batsman breaks their own stumps
- **Handled the ball** — batsman deliberately touches the ball
- **Obstructing the field** — batsman deliberately obstructs a fielder
- **Timed out** — next batsman fails to arrive in 3 minutes
- **Retired hurt** — batsman retires due to injury, can return
- **Retired out** — batsman retires voluntarily, cannot return
- **Double hit / hit the ball twice** — batsman hits the ball twice

**In our schema:**
- `wicketType` enum
- `wicketPlayerId` = who got out (for run-out, this could be either batsman)
- `fielderId` = who took the catch / threw the ball (nullable)
- **Important:** run-out is a wicket type, not a ball event. We attach it to the ball where the run-out happened.

**Free hit rule (Law 21.18):** On a free hit, only run-out counts. The engine rejects other wicket types when `isFreeHit: true`.

## Law 30 — Bowled

A ball that hits the stumps. Batsman is out.

## Law 31 — Timed out

Not enforced in v0.1.

## Law 32 — Caught

A fielder catches the ball before it bounces after the batsman hit it. The bowler gets credit (counts toward bowler's wickets).

**In our schema:** `wicketType: 'caught'`, `fielderId: <fielder>`. The `bowlerId` on the same ball gets the wicket.

## Law 33 — Handled the ball

Rare. Batsman deliberately touches the ball. The bowler does **NOT** get credit for this wicket.

**In our engine:** we count it as a wicket but exclude it from bowler wickets.

## Law 34 — Hit the ball twice

Rare. Similar to handled the ball.

## Law 35 — Hit wicket

Batsman hits their own stumps with bat or body while playing the ball. Bowler gets credit.

## Law 36 — Leg Before Wicket (LBW)

Complex decision rule involving pitch, impact, and stumps. Our engine doesn't enforce — the scorer records the umpire's call.

## Law 37 — Obstructing the field

Rare. Batsman deliberately obstructs.

## Law 38 — Run out

Batsman fails to make the crease while the ball is in play. **Crucially:** the bowler does NOT get credit for this wicket.

**In our engine:** run-out is excluded from bowler wickets.

## Law 39 — Stumped

Wicketkeeper breaks the stumps while the batsman is out of their crease and not attempting a run. Bowler gets credit.

**In our schema:** `wicketType: 'stumped'`, `fielderId: <wicketkeeper>`.

## Law 40 — Retired out / retired not out

**Retired hurt:** batsman leaves the field due to injury. Can return later. The "retired hurt" entry is NOT counted as a wicket in bowling stats. They return when ready.

**Retired out:** batsman retires voluntarily without injury. Counts as a wicket. Cannot return.

**In our engine:**
- `wicketType: 'retired_hurt'` → no wicket counted, batsman marked as "retired", can resume
- `wicketType: 'retired_out'` → wicket counted (does NOT count for bowler)

## Free hit (Law 21.18)

On the ball immediately following a no-ball in limited-overs cricket, the batsman cannot be dismissed (except by run-out). This is automatically tracked in our schema:

- After a `no_ball` event, the next ball event has `isFreeHit: true`
- When a wicket is recorded on a `isFreeHit` ball, the engine validates that only `run_out` is allowed

## End of an over

After 6 legal deliveries, the over is complete. Batsmen swap ends (striker becomes non-striker, and vice versa). A new bowler bowls the next over.

**In our engine:** the engine tracks `ballsBowled` per innings. When the 6th legal ball is recorded:
- The bowler changes (scorer must pick a new bowler)
- The batsmen swap ends

## End of an innings

An innings ends when:
- 10 wickets fall (all out)
- The overs run out
- The target is reached (2nd innings only)
- The captain declares (Test only — v0.3)
- The team forfeits

**In our engine:** innings is marked `completed` automatically when any of these conditions are met.

## End of a match

A match ends when:
- 2nd innings is completed (one team has more runs)
- Tied — goes to Super Over (white-ball) or is a draw (Test)
- Abandoned — no result

**Super Over:** in a tied limited-overs match, each team plays 1 over to break the tie. We model this as a 3rd + 4th innings. v0.1 supports this.

## Powerplay (fielding restrictions)

Limited-overs matches restrict where fielders can stand for the first few overs. We display which powerplay is active, but the engine does NOT enforce fielder positions.

## DLS (Duckworth-Lewis-Stern)

Used in rain-affected matches to adjust the target. **Not implemented in v0.1** — requires the full DLS resource table, which is proprietary. Will be a v0.2 feature.
