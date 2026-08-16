# Built but not wired

Screens and surfaces that exist and look finished, but do nothing yet — and
what each one actually needs.

Kept because "not wired" is invisible from the outside. A screen that renders
perfectly and silently does nothing reaches a tester as a bug report, and
reaches a judge as a broken feature. Everything here is a known gap, written
down so it stays known.

**Last updated: 2026-08-17**

Legend: 🔴 needs a backend · 🟡 needs a decision · 🟢 cosmetic or trivial

---

## First-run flow (`apps/mobile/app/(auth)/`)

Five screens built from the A-series designs. Two work; three are UI only.

| Screen           | File                 | State                                                    |
| ---------------- | -------------------- | -------------------------------------------------------- |
| A1 Splash        | `app/index.tsx`      | ✅ real — launch route, holds while the session verifies |
| A2 What it does  | `(auth)/welcome.tsx` | ✅ real — static by nature                               |
| A3 Phone sign-in | `(auth)/phone.tsx`   | 🔴 UI only                                               |
| A4 Verify OTP    | `(auth)/verify.tsx`  | 🔴 UI only — any six digits advance                      |
| A5 Profile       | `(auth)/profile.tsx` | 🔴 UI only — nothing saves                               |

### 🔴 Phone + OTP is a different auth system

The app authenticates with **email and password** — argon2, server-side
sessions, `apps/web/lib/auth/local.ts`. The designed flow is **phone + OTP**.
These are not variations of each other. Making it real needs:

- a `phone` column on `users`, and a decision about whether email stays as a
  second factor, a fallback, or goes
- an OTP store with expiry **and attempt limiting** — an OTP endpoint without
  a rate limit is a free SMS bill paid to whoever finds it
- an SMS provider, billed per message
- **DLT registration with TRAI.** Transactional SMS to an Indian number is not
  possible without it. This is an external approval queue, like Play Console —
  the sort of thing that costs however long their queue is, so it wants
  starting well before it is needed.

`Send code` currently navigates to A4 without sending anything. **Deliberate**:
a button that silently pretends to have sent an SMS is worse than one that
visibly has not.

### 🔴 "Score without an account"

The escape hatch on A3, and the reason that screen is not a wall. It implies
matches stored **locally on the phone**, exportable, with no server.

Today every ball POSTs to the server and the replayed state comes back. So
this is the offline-first work from `FEATURES.md` Tier 3 wearing a different
hat — the same queue-and-sync machinery, reached from a different direction.
Build one and the other is nearly free.

### 🟡 Profile fields have nowhere to go

A5 collects name, role, batting hand, bowling style and club. `players` carries
a name, a role and the two styles — but:

- a player row is **not linked to a user account**; there is no notion of
  "this account is this player"
- there is no club field on a player
- the career page is addressed by **UUID**, and A5 promises a slug

Persisting any of it needs a schema change and a decision about what a profile
_is_: the account, a player row, or both joined.

### 🟡 Career URL is a slug in the design, a UUID in the code

A5 shows `openinnings.com/p/a-menon`. `/p/[playerId]` takes a UUID.

A slug means a uniqueness constraint, a collision rule (two A. Menons), and a
decision about whether slugs are stable when someone renames themselves. Not
hard, but not nothing, and links are forever.

### 🟢 The design says `openinnings.in`

You own `.com`. The screen uses `.com`.

### 🟡 Old auth screens still exist

`(auth)/login.tsx` and `(auth)/signup.tsx` still work, and are the only auth
that actually functions. Left in rather than deleting working code in favour of
non-working code. `/welcome` is the entry point for signed-out users, so they
are unreachable by default but one line from being restored.

---

## Starting a match (`apps/mobile/app/(app)/matches/`)

Four screens from the B-series designs. All four render and the flow works end
to end — a match created here is real. What is missing is detail the designs
show and the data does not support.

### 🟡 There is no match format

`matches` stores `oversPerInnings` and nothing else. There is no format field,
so "T20" and "ODI" are only ways of setting a number, and the match does not
remember which was chosen.

More seriously, three of the seven do not exist in the engine at all:

| Format           | Why not                                     |
| ---------------- | ------------------------------------------- |
| Test / multi-day | Two innings a side, declarations, follow-on |
| The Hundred      | Five-ball sets and 100 balls, not overs     |
| Box / indoor     | Zone runs and negative runs on dismissal    |

They are shown but **disabled** on B2. Letting someone pick Test and discover
mid-match that it cannot be scored would be much worse than saying so at the
toss.

⚠️ **The marketing site claims seven formats** — the landing page's spec sheet
and the whole `/formats` page. That claim is currently ahead of the engine.
Either the engine catches up or the copy does.

### 🟡 Balls per over is fixed at six

`BALLS_PER_OVER` is a constant in the engine, not a setting. B2 shows the field
because the design does, disabled because changing it would be a lie. Making it
real means touching every over-based calculation.

### 🟡 "Add a guest player"

On B3. Needs a player row created inline, attached to the squad, and a decision
about whether guests persist as real players afterwards.

### 🟢 Form figures are career, not this season

B4 says "SR 128 **this season**". `GET /api/players/briefs` returns career
totals, so the line reads career figures.

A season filter needs a season, and a picker showing nothing for everyone who
has not played since January is worse than one showing a career. Revisit if
"this season" turns out to be what captains actually want.

### 🟡 Followers and sync status

B1 shows "24 following" on a live match and "SYNCED 15:41" in the header.
Nothing counts followers, and there is no offline queue for a sync time to
describe. Both omitted rather than shown as zero — "0 following" reads as
nobody watching, which is a different claim from "we do not count yet".

### 🟡 B1 itself has no tab bar

The bar exists — `MatchTabs`, built with the D-series — but only on the
match-scoped screens, because Score and Card need a match id. B1 is the list of
all matches and has none, so it still carries its own buttons to Players,
Teams and More instead.

That is the unresolved half of the same question: what do **Score** and
**Card** point at when no match is open? Most recent, probably. Until that is
decided the list screen keeps its own footer.

---

## Scoring (`apps/mobile/app/(app)/matches/[id]/`)

The C-series. All five screens are real and the flow runs end to end — console,
wicket, end of over, innings break, result. What follows is what the designs
show that the data does not carry.

### 🔴 Swap ends is not buildable yet

C3 shows a **Swap ends** control beside the strike. The engine rotates the
strike itself at the end of an over, and there is no event that would let the
app override it — a correction would have to be a new kind of ball event, or a
mutation on the innings.

It is worth having: the reason a scorer wants it is that the players crossed on
the last ball and nobody noticed until the next over started. Until then the
only fix is undo, and the screen shows who is on strike as **information**
rather than offering a control that would silently do nothing.

### 🟡 The bowler quota is a UI-only guard

C3 shows "4 overs left" per bowler and greys out anyone who has bowled their
share. That limit — a fifth of the innings, rounded up — is a **playing
condition, not a Law**, and `applyBall` does not enforce it. `EndOfOver`
computes it in the UI.

Which means the block is a courtesy, and it is written not to be able to trap
anyone: a bowler is only disabled on quota **if somebody else still has overs
left**. In a game with four bowlers it gets out of the way. Law 16.2 — no two
overs in succession — is a real rule the engine does enforce, so that one is a
hard block.

If the quota should be real, it belongs in the engine with the rest of the
laws, not in a screen.

### 🟡 "10 minute break" and the follower count

C4 shows both. There is no break timer and nothing counts followers, so
neither is drawn — same call as on B1.

### 🟢 The full card is in-app now

Built as the D-series — `matches/[id]/card`. C4 and C5 point at it rather than
opening a browser.

### 🟢 Expo's typed routes mis-register `result.tsx`

`/matches/[id]/result` is generated as a **static** route while
`/matches/[id]/score` beside it is generated as dynamic, so the interpolated
form does not typecheck. Worked around with the object form —
`router.push({ pathname: '/matches/[id]/result', params: { id } })` — which is
the documented API anyway.

Same typegen also sweeps in files from outside `app/`, currently
`/../components/scorer/EndOfOver` and `/../../web/app/api/.../route`. Harmless
noise in the union, but it is what breaks the dynamic-segment grouping, so it
is worth an upstream look before more routes are added.

---

## The card and sharing (`apps/mobile/app/(app)/matches/[id]/`)

The D-series: `card` (scorecard + over by over), `share`, `cards` (per player).
All three are real and read from `GET /api/matches/[id]/card`, which replays
both innings and ships every delivery.

### 🟡 The share cards are the wrong shape for sharing

The designs label the card **1080 × 1080**. What exists is **1200 × 630** —
the Open Graph size, because these cards were built as the preview a _link_
unfurls into.

Those are different jobs. A link preview is landscape; an image sent to a
WhatsApp status or an Instagram post wants the square. Right now only the
first exists, so D3 and D4 preview at the real ratio and the size label says
1200 × 630 rather than repeating the design's number over a picture that is
not that shape.

Fixing it means a second size from the same renderer — the Satori layout would
need a square variant, not just a different canvas, because the current one is
composed for a wide frame.

### 🟡 "Save image" and "Save all 22" are not built

Both are on the designs. Writing to the gallery needs `expo-media-library`, a
runtime permission prompt, and — for "all 22" — downloading twenty-two PNGs
with some notion of progress and failure. That is a feature, not a wiring job.

**Copy live link** and **Share** are real, so nothing on these screens is a
dead end in the meantime.

### 🟡 Commentary is factual, and stops there

D2's feed comes from `describeBall` in the engine. It will say "Kamath to
Thomas, FOUR — 20 needed became 16", because every clause of that is derived
from the ball log. It will never say "through midwicket" or "bowled through
the gate", which the design shows, because nothing in the system watched the
game.

`BallEvent.commentary` exists and wins over the generated line when a scorer
writes one — but **no screen offers a way to write one**. That is the gap: an
optional note field on the scorer console, probably behind a long-press, so
colour is possible without being invented.

### 🟡 The bottom tab bar is presentational

`MatchTabs` is a strip that navigates, not an Expo Router `<Tabs>` layout.
Score and Card are match-scoped; Matches is global. A real tab navigator would
have to hold a match id in layout state and decide what its tabs point at when
no match is open — a routing problem invented to satisfy a visual one.

**More** is drawn and disabled. There is no settings screen.

---

## The record (E-series)

Career page, club page, add-a-player, and the public follower view. All four
are real. The gaps are things the designs show that nothing computes.

### 🟡 A player has no club

E1's identity line reads "Koramangala XI · Opener · Right-hand bat". Role and
batting style are now on the career response; **club is not a field on a
player**, so the line starts at the role.

This is the same schema question as the A5 profile: is a player's club a
column, or is it derived from the squads they appear in? Derived is more
honest — people move — but then "current club" needs a rule, probably the club
of their most recent match.

### 🟡 Milestones have no "when"

The design puts "2 ago" beside each milestone — how many matches back it was
reached. `milestonesFor` computes only _what_ has been achieved from career
totals; dating them means walking the innings in order and recording where
each threshold was crossed. Worth doing: "eighth fifty, two matches ago" is a
much better sentence than "8 fifties".

### 🟡 Two of the four club leaders are missing

E2 lists most runs, most wickets, best strike rate, and most catches.
`clubPageFor` ranks only runs and wickets. The other two are two more
aggregates across the squad.

### 🟡 Career context in the player search

E3 shows "Top order · 812 runs · 33 matches" beside each search result — which
is precisely what makes picking the _right_ S. Kurien possible, and it is the
reason the screen exists. Career figures are one request per player and there
is still no batch endpoint, so only what `PlayerListResponse` already carries
is shown.

This is now the **third** screen blocked on the same missing endpoint (B4's
form figures, D-series were fine, E3). Worth building.

### 🔴 "Invite by number so he claims his own career page"

On E3, and the mechanism by which a locally-created player becomes a real
person with an account. Needs phone auth (which does not exist — see A3) and a
claim flow (which does not either). Not drawn.

### 🟡 Nothing counts followers, and nothing can be followed

E4 shows "24 following" and a **Follow this match** button. There is no follow
table and no counter. Neither is drawn — the live page already does what
following would do, and it says so instead.

### 🟡 No ads on the web scorecard

E4 shows an ad bar. `react-native-google-mobile-ads` is a native SDK; web ads
would be AdSense, a separate product with its own account and review. Not
started.

### 🟢 "Get the app" points at /app

There is no Play listing to link to yet, so the pinned bar on E4 points at the
marketing page. Same gap as the button on `/app` itself.

---

## Monetisation

### 🟡 AdMob renders — the removal pitch does not

`AdBar` mounts a real `BannerAd` on the card, share and player-card screens,
and **on no scorer screen**, which is the rule the whole ad strategy rests on.
Units resolve through `adUnit()`, so a dev build can only ever load Google's
test unit.

Still to do:

- native ad in the match browse list (`match_list_native` is configured and
  unused)
- one interstitial at the innings break, capped at 1/hour
- a CI test that fails if an ad component ever appears on a scorer screen —
  the rule is currently held by a comment and by whoever is reviewing

**Remove ₹99** now opens the paywall, and `AdBar` checks the entitlement
before it renders anything — a supporter sees no ad bar at all.

### 🟡 RevenueCat is wired; the store is not stocked

`react-native-purchases` is installed and configured at launch,
`lib/purchases.ts` exposes the entitlement, the offering, purchase and
restore, and F2 is a real paywall that reads the **store's** localised price
rather than a hardcoded one. `AdBar` hides itself for a supporter.

Two things left, both outside the code:

1. **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is not set.** Without it the SDK is
   never configured and `useSupporter()` reports "purchases are not configured
   in this build yet". This is the public SDK key from the dashboard, not the
   secret one.
2. **The products do not exist in Play Console** with real pricing, linked
   back to the RevenueCat offering. Until they do, `getOfferings()` returns an
   empty current offering and the screen says "no plan is available from the
   store yet".

Neither can be finished from a dev build regardless — Play Billing needs a
signed build on a device with Play Services. This is still the one **hard
eligibility gate** for the hackathon; it is now a configuration task rather
than a build one. See `TODO.md`.

### 🟡 Two prices, one product

F2 shows ₹99 a month and mentions ₹899 a year as arithmetic. Only one package
is read — `availablePackages[0]`. If both a monthly and an annual product get
created, this needs to offer the choice rather than silently pick whichever
comes back first.

---

## Settings (`apps/mobile/app/(app)/more.tsx`)

### 🔴 There is no settings store

F1 shows four switches: live match links, keep screen awake, sound on each
ball, export scorebook. **None is backed by anything** — there is no
preferences store on the device and no user-settings table on the server.

They are drawn disabled with the reason on the row, because a switch that
flips back on next launch is a bug report while a greyed row that says "not
built yet" is information.

Worth ranking them, because they are not equal:

| Setting               | Verdict                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep screen awake** | The one that actually matters. A three-hour match on a phone that sleeps every 30s is miserable. `expo-keep-awake` is tiny.            |
| Export scorebook      | Real feature — needs a CSV/JSON endpoint. It is also on the F2 free list, so it is a promise.                                          |
| Sound on each ball    | Needs audio plus a store. Genuinely useful for eyes-up scoring.                                                                        |
| Live match links      | Not a switch. Scorecards are public and permanent by design; turning it off would break every link already sent. Shown as "always on". |

### 🟡 "My career" cannot resolve

F1's profile row shows the account, not a career page, because a user account
is not linked to a player row — the same gap as A5. Until it is, "my career"
has nothing to point at, so the row opens the player list instead.

---

## Web

### 🟡 The email signup form submits nowhere

`app/(marketing)/page.tsx`, the "Notify me" box. There is no list to subscribe
to. Marked with a `TODO` in the file. Either wire it to something or remove it
before launch — collecting addresses into the void is worse than not asking.

### 🟡 "Get it on Android" is a button, not a link

`app/(marketing)/app/page.tsx`. Stays a button until a Play listing exists to
point at, rather than linking to a 404.

### 🟢 `notFound()` returns HTTP 200 in dev

Both `/p/<unknown>` and `/m/<unknown>` render the 404 page with a 200 status
under `next dev`. Pre-existing — `/m/` did it before any of this was added — so
it looks like streaming committing the status before `notFound()` throws.

Worth confirming in a production build: a shared profile link that 404s should
return 404, or search engines index dead pages.

---

## Mobile

### 🟢 Sharing — done at the end of a match, missing everywhere else

The result screen shares the match, and **Player cards** there sends any one
player their own card, which is the twenty-two-shares-per-match arithmetic from
`FEATURES.md`. The innings break shares the half-time score.

Still nothing on the **career profile**, where `/p/[playerId]` is the card that
already exists and is arguably the most personal one. Links resolve through
`shareUrls` in `lib/config.ts` — the API origin, so they are the real domain in
production and the LAN address in dev.

### 🟢 The dev build on the device is stale

AdMob and the Barlow fonts are native additions, so the APK from the last
hardware test no longer matches the JS. Needs a fresh
`eas build --profile development` before the next device test.

---

## How to use this file

Delete entries as they get wired. If something here turns out to be wrong or
already done, delete it — a stale list of known gaps is worse than none,
because people stop trusting it and then stop reading it.
