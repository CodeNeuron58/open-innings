# Pivot tracker

UX and interaction rework of the mobile app, read against CricHeroes. The full
audit with reasoning for each item lives in the artifact; this is the checklist.

**Branch:** `pivot` · **Commits:** 8 · **Diff:** 29 files, +3035 / −454
**Tests:** 371 passing (shared 40 · scoring 179 · mobile 61 · web 91)
**Findings:** 61 total — **24 closed**, 4 part done, 33 open

The visual language is unchanged throughout. Nothing here rewrote the palette,
the type families or the Industry design system — the work is flow, interaction
and information architecture.

---

## Before any of this runs

- [ ] `pnpm db:migrate` — migration 0018 creates `match_squads`. Additive and
      idempotent; no existing table changes shape.
- [ ] `npx expo prebuild` and rebuild the dev client — offline scoring adds
      `expo-sqlite`, a native module. A JS reload will not pick it up.

### Not runtime-verified

There is no device in this environment and no React renderer in the workspace
(see `apps/mobile/vitest.config.ts`). Everything below is typecheck-, lint- and
unit-test-verified only. Two things want smoking on hardware before they are
trusted with a real match:

- [ ] **Offline scoring** — aeroplane mode, a full over, then reconnect. Check
      the queue drains in order and the score does not jump.
- [ ] **Force-quit mid-over** — kill the app with balls pending, reopen, and
      confirm the queue is still there.

---

## Done

### `7269b0d` A stumping off a wide kept the stumping and lost the wide

- [x] **C3** Carry the armed extra into the wicket payload. `scoreWicket` nulled
      `pendingExtra` and sent `eventType: 'wicket'` with `extraRuns: 0`, so a
      stumping off a wide or a run-out off a no-ball silently lost the penalty
      run — on a card that had usually been shared already.
- [x] The wicket sheet asks what the delivery was, opening on whatever was armed.
- [x] Arithmetic moved into `wicketDeliveryFor` beside `splitExtra`, with every
      payload it can build asserted against the real shared schema.
- [x] Allowed dismissals now come from the engine's own rule sets. The
      hand-written array they replaced had already drifted — it omitted
      `handled_ball` and `double_hit`, so two dismissals the engine permits on a
      free hit were unreachable from the sheet.
- [x] Changing the delivery re-checks the dismissal against it.

### `b749cbf` The playing XI is a thing that exists

- [x] **B2** `match_squads` (migration 0018). The wizard's "Pick the XI" step was
      never sent; the server read the whole club roster for both sides, so
      `sizeMaxWickets` and `sizeBowlerQuota` were sized from people who were not
      at the ground. A seven-a-side game out of a twelve-player roster got ten
      wickets and could not end the way it was played.
- [x] Absence still means "the whole roster", so every match scored before this
      replays unchanged.
- [x] **B3** Both XIs are named. Only the batting side was ever picked, which is
      why the wicket sheet offered the whole club as fielders.
- [x] **B1** Title and ground asked for at creation. The schema had accepted both
      all along; every row in the list read "Match".
- [x] **B4** Step 2 says whose XI it is instead of just a team name.
- [x] **B5** Test, The Hundred and Box removed from the format row.
- [x] **B6** An empty state where the "no teams" dead end was.
- [x] **B7** "No toss" is a control, not the absence of two answers.
- [x] **B8** Team chips carry ids. They carried names, so two teams with the same
      name resolved to whichever came first.
- [x] An XI may only name players already on that club's books.

### `543b67a` A batter retiring hurt was costing the over a ball

- [x] **Not in the audit** — found while building the retirement flow.
      `isLegalDelivery` answers for the delivery, and a retirement is recorded as
      `eventType: 'wicket'`, so it looked like a fair ball. Every retirement
      advanced `ballsBowled`: the over ended a ball early and the bowler was
      charged one they did not bowl.
- [x] Derived in the engine from `NON_DELIVERY_WICKETS`, which already existed
      and already knew. Five tests; four fail without the fix.

### `c1161f3` The console gets a way out, and a place for everything else

- [x] **C7** Scorecard is a button in the match bar. It was unreachable from the
      console — this screen never rendered the match tabs.
- [x] **C8** `router.back()` instead of `router.replace('/matches')`, so Android's
      hardware back stops being a guess.
- [x] **C9** Abandon moves onto the console. It was behind a long-press on a row
      in the match list, a screen away.
- [x] **C10** Replace bowler named in the menu instead of hidden behind a tap on
      the bowler row.
- [x] **C12** Retire a batter is its own entry, using the wicket sheet in a mode
      offering only the three outcomes that are not dismissals.
- [x] **C15** The five-run penalty asks before awarding. It was a single
      unconfirmed tap next to Wide.
- [x] Overthrows move out of the cryptic `+OT` button into the menu.
- [x] **C6** Undo names the ball it will remove, in the over strip's own notation.
- [x] **C22** Ball chips to 44pt, extras row to four equal 48pt targets.
- [x] **C24** The static "Live" square is gone (replaced by sync state in `d70b5d4`).

### `1f06f4d` The list shows the score

- [x] **F3** A live row reads its score at 22px with the chase under it. The list
      carried no runs, wickets or overs at all.
- [x] Team names in the list response — it had only ids, so an untitled match had
      nothing to call itself but "Match".
- [x] Three grouped queries for the whole list, not three per row.

### `d70b5d4` Score the whole match with no signal

- [x] **C1** Offline scoring. A tap writes to SQLite and to the screen and
      returns; a drain loop handles the network.
- [x] **C2** The keypad no longer dies for the length of every round trip.
- [x] `display = pending.reduce(applyBall, serverState)` — the same engine the
      API runs, on the API's own last answer. Not an optimistic guess.
- [x] Asserted both ways: folding six deliveries locally reaches a state
      identical to the server taking all six, and acknowledging one does not move
      the score.
- [x] Undo drops the last pending delivery and never touches the network — and
      offline, every delivery is pending.
- [x] One delivery at a time in `seq` order, never in parallel.
- [x] Retry policy split from refusals, so the queue cannot spin forever.
- [x] A local `applyBall` refusal is caught and shown rather than crashing the
      console — and it arrives before the ball is queued, so there is nothing to
      undo.
- [x] Sync state on the console: how many balls are still on this phone, and that
      they are safe there.
- [x] No NetInfo. Failing to reach the server _is_ the offline signal.

### `1980efe` Stop sending people away to come back

- [x] **A3** A player can be created from inside the squad picker that needs one.
      The screen used to read "No players yet — add some first, then come back".
- [x] **A2** The Matches empty state gets the action it was missing.
- [x] **F1** `players/index.tsx` and `teams/index.tsx` move onto the Industry
      design language. They were still on the old one — rounded cards, filled
      surfaces, `text-muted-foreground` — and they are the two screens a new user
      must visit before scoring anything.

### `e8561d6` Seed names both XIs

- [x] Dev data goes down the new path rather than the compatibility fallback.

---

## Part done

- [ ] **A1** — _Critical._ Cold start. Inline player creation and real empty
      states landed, but there is still no single guided "first match" flow that
      creates teams and players without leaving the wizard.
- [ ] **C20** — _Major._ The batters block is still 9px headers and 12–15px
      figures. Chips and the extras row were sized up; this was not.
- [ ] **C21** — _Major._ Type scale. Several sizes below 14px were raised, but the
      console still has no single scale with a floor.
- [ ] **F5** — _Major._ Contrast. Some `text-neutral-600` moved to `700`; the
      opacity ladder (`/45` … `/70`) has not been audited against a budget.

---

## Open

### Cold start

- [ ] **A4** — _Critical._ A guest lands on a box asking them to paste a URL.
      No discovery, no live matches, nothing to do without a link.
- [ ] **A5** — _Major._ "Start a match" on the welcome screen opens a signup form.

### Match setup

- [ ] **B9** — _Minor._ Step 3 is three stacked full-length player lists.
- [ ] **B10** — _Minor._ No scheduling. Matches can only start now, though
      `startedAt` and a `scheduled` status both exist.
- [ ] **B11** — _Minor._ The share link is never offered at creation, which is the
      moment the scorer is standing next to the people who want it.

### Scoring console

- [ ] **C4** — _Major._ The armed-extra model means two different things
      (`Wide + 4` = 4, `No ball + 4` = 5) and shows neither total before commit.
- [ ] **C5** — _Minor._ Nothing confirms what was just recorded.
- [ ] **C11** — _Minor._ No manual strike swap.
- [ ] **C13** — _Minor._ No extras total, partnership or last wicket on the plate.
- [ ] **C14** — _Minor._ No shot direction captured, so no wagon wheel is possible
      later. Worth reserving a field on the ball schema now.
- [ ] **C16** — _Minor._ Ball history is six chips deep.
- [ ] **C17** — _Minor._ Only the current over can be corrected.
- [ ] **C18** — _Minor._ Law citations printed on the live console.
- [ ] **C19** — _Minor._ Haptics are a raw `Vibration.vibrate`, duplicated in three
      files. Wants one helper over `expo-haptics` with different weights for a
      run, a boundary and a wicket.
- [ ] **C23** — _Minor._ "Refresh" is a developer's escape hatch shown as a user
      control.

### Fixing mistakes

- [ ] **D1** — _Major._ A wicket cannot be corrected. The most consequential
      mis-tap on the console has no fix short of undoing every ball since.
- [ ] **D2** — _Minor._ Undo is one ball at a time. No "undo to here".
- [ ] **D3** — _Minor._ A corrected ball is indistinguishable from an original.

### Overs, breaks and endings

- [ ] **E1** — _Major._ A full blocking modal after every over — forty per T20.
      Wants a compact sheet so the score stays visible.
- [ ] **E2** — _Major._ Choosing the next bowler is never one tap. No memory of
      the rotation, no ordering by who bowled from that end.
- [ ] **E3** — _Minor._ The innings break repeats the step-3 problem. Three copies
      of the "who's on" interaction exist.
- [ ] **E4** — _Minor._ The result screen's `share()` is `eslint-disable`d dead
      code; sharing routes elsewhere. Two half-built implementations.
- [ ] **E5** — _Minor._ A tie gives no prompt toward the Super Over.

### Across the app

- [ ] **F2** — _Major._ No dark mode. Evening matches under floodlights on a
      full-brightness white screen. The token layer is already the right shape.
- [ ] **F4** — _Major._ Long-press is load-bearing for match settings and delete.
- [ ] **F6** — _Minor._ Every load is a full-screen spinner; no skeletons.
- [ ] **F7** — _Minor._ Errors render above the fold you are not looking at.
- [ ] **F8** — _Minor._ The More screen advertises four features that do not exist.
- [ ] **F9** — _Minor._ No search, filter or season grouping on the match list.
- [ ] **F10** — _Minor._ Multi-device scoring is handled server-side but never
      shown. Nothing says who holds the book.
- [ ] **F11** — _Minor._ No landscape or tablet layout.
- [ ] **F12** — _Minor._ The score never announces itself to a screen reader.
- [ ] **F13** — _Minor._ No help anywhere. C4, F4 and the bowler-row shortcut are
      all undiscoverable without it.

---

## Suggested order from here

Ranked by what each unblocks, not by size.

1. **Dark mode (F2)** — a scoring app used at 7pm has to have it, and the token
   layer in `tailwind.config.js` is already shaped for a second set.
2. **End of over (E1, E2)** — forty forced full-screen interruptions per T20 is
   the biggest remaining tax on the core loop.
3. **Correcting a wicket (D1)** — the server can already replay from any ball;
   the sheet just needs opening pre-filled.
4. **Type scale and contrast (C20, C21, F5)** — no palette changes, sizes and
   weights only. Cheapest visible win left.
5. **Guest discovery (A4)** — the endpoints and public scorecards exist; only a
   listing is missing. It is also the whole top of the funnel.
6. **The armed-extra total (C4)** — show the arithmetic before it commits and the
   model stops being a memory test.
