# Pivot tracker

UX and interaction rework of the mobile app, read against CricHeroes. The full
audit with reasoning for each item lives in the artifact; this is the checklist.

**Branch:** `pivot` · **Commits:** 23
**Tests:** 413 passing (shared 40 · scoring 179 · mobile 103 · web 91)
**Smoke:** 376 checks green against a real database
(score 51 · api 283 · p1 19 · xi 6 · correct 10 · browse 7)
**Findings:** 61 total — **40 closed**, 1 part done, 20 open

The visual language is unchanged throughout. Nothing here rewrote the palette,
the type families or the Industry design system — the work is flow, interaction
and information architecture.

---

## Before any of this runs

- [ ] `pnpm db:migrate` — migration 0018 creates `match_squads`. Additive and
      idempotent; no existing table changes shape.
- [ ] `npx expo prebuild` and rebuild the dev client — offline scoring adds
      `expo-sqlite` and the haptics work adds `expo-haptics`. Both are native
      modules; a JS reload will not pick either up.

### What has and has not been run

The **server** half is verified against a real Postgres. Migration 0018 applies
from scratch, and 359 smoke checks pass through the live API — including six
that prove the playing XI end to end on a club of twelve of which seven play.

The **mobile** half is not. There is no device here and no React renderer in
the workspace (see `apps/mobile/vitest.config.ts`), so anything that is layout,
gesture or device behaviour is typecheck-, lint- and unit-test-verified only.
Three things want smoking on hardware:

- [ ] **Offline scoring** — aeroplane mode, a full over, then reconnect. Check
      the queue drains in order and the score does not jump.
- [ ] **Force-quit mid-over** — kill the app with balls pending, reopen, and
      confirm the queue is still there.
- [ ] **Dark mode** — the CSS compiles with both palettes and the contrast is
      measured, but "does it look right" is not a thing this environment can
      answer. Check the score plate still reads as a panel and the over strip
      is still scannable.

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

### `c6ac3ec` The playing XI, proved end to end

- [x] Six smoke checks against a real database: the XI reaches `match_squads`,
      the innings is sized for seven rather than the twelve on the books, the
      scorer endpoint returns the XI for both squads, a stranger's id is
      refused, and omitting the XI still falls back to the roster.

### `3a37581` A type scale, and the end of over stops taking the screen

- [x] **E1** The end of over is a sheet over the console, not a full-screen
      takeover forty times a match. The "Peek board" mode goes with it — it
      existed only to undo the harm of hiding the board.
- [x] **E2** The bowler who bowled from this end last over is sorted first,
      labelled, and preselected. One tap instead of three.
- [x] **C21** Four type sizes below the display sizes instead of fourteen, with
      a floor at 11px. Nine of the fourteen were 9px.
- [x] **C20** The batting block is the second-most-read thing on the screen and
      was 9px headers over 12–15px figures. Runs are now 18px, columns widened
      to match.
- [x] **F5** `text-neutral-600` (4.0:1) → `700` (6.4:1), and the two faintest
      opacity rungs raised.

### `511101b` Dark mode

- [x] **F2** The palette moves to `global.css` as CSS variables with a light and
      a dark set. NativeWind 4 resolves them, so not one className changed.
- [x] The dark set is designed rather than inverted: both ramps reverse, the
      accent moves up its ramp, the score plate stays put and becomes a raised
      panel, and a wicket chip inverts because the darkest mark on paper has to
      be the lightest on a dark ground.
- [x] The eight hard-coded hex values that are props rather than classes —
      placeholders, spinners, the switch, the status bar — now follow the theme.
- [x] `theme.test.ts` parses the CSS, asserts the two copies of the palette
      agree, and measures WCAG contrast across both themes.

### `c6ef8a5` A wicket can be corrected

- [x] **D1** The correction sheet's `W` hands over to the wicket sheet,
      pre-filled from the delivery being corrected. `patchBallSchema` has
      accepted the fields all along — it is `ballEventSchema` minus three.
- [x] The batters are not sent: a patch derives them, and asserting who was at
      the crease from memory is how a correction puts somebody at the wrong end.
- [x] `smoke:correct` — ten checks over HTTP in three directions. Changing a
      dismissal, adding one to a delivery recorded as four runs, and taking one
      away. The endpoint's wicket path had never been exercised end to end,
      because no client could send a wicket patch.

### `587a208` The keypad says what an armed extra will score

- [x] **C4** With Wide armed the 4 key reads "4 wd"; with No ball armed it reads
      "5 nb". Same gesture, different arithmetic, and nothing on screen used to
      say which.
- [x] The banner explains the model rather than naming the mode — "No ball —
      tap the runs off the bat, the penalty is added".
- [x] The rule moves into `armedTotal` beside the rest of the extras
      vocabulary, so the number shown and the number recorded are one function.

### `ef7f1c4` The options are on the row

- [x] **F4** A visible 44pt options button on both row kinds. Settings, edit,
      abandon and delete were reachable only by a long-press nothing advertised.
- [x] The type scale and contrast floor reach the match list, which they had not.

### `a759b52` A guest lands on cricket, not on a text field

- [x] **A4** `GET /api/matches/public` — live matches first, abandoned ones
      left out, capped at thirty. It discloses nothing new: `matches` is
      publicly readable, `/m/<id>` is the link people send, and the card
      endpoint takes no token. Only the listing was missing.
- [x] The rows move to `components/MatchCard.tsx`, shared with the owner's
      list. Two lists showing a live score is two chances to be wrong about the
      same match.
- [x] `smoke:browse` — seven checks: no session needed, somebody else's live
      match visible, an abandoned one absent, live above finished, rows
      carrying names and innings, listing capped.

### `0b2019e` The plate answers, and the strip reaches back

- [x] **C13** Extras, the current stand, and how the last wicket fell. All
      three were already in state and shown nowhere.
- [x] **C16** The over strip is the last eight overs, scrolled horizontally and
      pinned to the newest, each labelled with its bowler.
- [x] **C17** Every chip in it is correctable. The handler was wired only to
      the current over, so a mistake noticed three overs later could not be
      reached — though the server has always replayed from any delivery.

### `e0872df` One rule for who's on

- [x] **E3** Match creation, the innings break and the Super Over sheet each had
      their own answer to "are these three acceptable". One checked and wrote
      its own strings, one prevented the collision by filtering and never
      explained it, one left the pair rule to the server. The rule is now in
      `lib/openers.ts`, with a test asserting every draft it accepts parses
      against `openersSchema`.
- [x] The two chip pickers become one component. Match creation keeps its richer
      full-screen rows but takes the rule from the same place, so the pair
      collision is caught before the request rather than after it.

### `27d52a6` A wicket stops feeling like a dot ball

- [x] **C19** Four identical `hapticFeedback()` copies over
      `Vibration.vibrate`, all buzzing the same for a dot, a six and a wicket.
      Now one helper over `expo-haptics` with a vocabulary named for what
      happened — runs light, boundaries medium, a wicket a notification, undo
      its own.
- [x] The sameness was the bug, not the duplication: a scorer watching the
      cricket has one channel telling them the tap landed, and it could say
      _what_ rather than just _something_.

### `57f4887` The ball that just landed is marked

- [x] **C5** The newest chip carries a ring — drawn, outside the chip, so it
      does not borrow the colour channel that tells a four from a wicket. The
      only previous acknowledgement was `Last: 4` in small grey type at the
      foot of the console.

---

## Part done

- [ ] **A1** — _Critical._ Cold start. Inline player creation and real empty
      states landed, but there is still no single guided "first match" flow that
      creates teams and players without leaving the wizard.

---

## Open

### Cold start

- [ ] **A5** — _Major._ "Start a match" on the welcome screen opens a signup form.

### Match setup

- [ ] **B9** — _Minor._ Step 3 is three stacked full-length player lists.
- [ ] **B10** — _Minor._ No scheduling. Matches can only start now, though
      `startedAt` and a `scheduled` status both exist.
- [ ] **B11** — _Minor._ The share link is never offered at creation, which is the
      moment the scorer is standing next to the people who want it.

### Scoring console

- [ ] **C11** — _Minor._ No manual strike swap.
- [ ] **C14** — _Minor._ No shot direction captured, so no wagon wheel is possible
      later. Worth reserving a field on the ball schema now.
- [ ] **C18** — _Minor._ Law citations printed on the live console.
- [ ] **C23** — _Minor._ "Refresh" is a developer's escape hatch shown as a user
      control.

### Fixing mistakes

- [ ] **D2** — _Minor._ Undo is one ball at a time. No "undo to here".
- [ ] **D3** — _Minor._ A corrected ball is indistinguishable from an original.

### Overs, breaks and endings

- [ ] **E4** — _Minor._ The result screen's `share()` is `eslint-disable`d dead
      code; sharing routes elsewhere. Two half-built implementations.
- [ ] **E5** — _Minor._ A tie gives no prompt toward the Super Over.

### Across the app

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

**No Critical findings remain open.**

1. **Skeletons (F6)** — every load is still a full-screen spinner that replaces
   the UI and jumps the layout when data lands. The query hook already
   distinguishes `isLoading` from `isRefreshing`, so the information is there.
2. **Law citations on the console (C18)** — plain language while scoring; the
   clause numbers belong in help, which does not exist yet either (F13).
3. **Errors where the thumb is (F7)** — a failure renders near the top of a
   scroll view while the scorer is looking at the keypad.
4. **The More screen (F8)** — four rows advertising features that do not exist.
   Ship it with what works.
5. **A manual strike swap (C11)** — rotation is entirely derived, with no
   override for the cases where a scorer knows the batters crossed.
6. **The primary button's contrast** — `theme.test.ts` records paper-on-steel at
   3.71:1, under AA. Steel-700 reaches 6.1:1 and is one step down the same ramp.
   Left alone because the accent is yours to change, not the test's.
