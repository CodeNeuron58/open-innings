# Built but not wired

Screens and surfaces that exist and look finished, but do nothing yet — and
what each one actually needs.

Kept because "not wired" is invisible from the outside. A screen that renders
perfectly and silently does nothing reaches a tester as a bug report, and
reaches a judge as a broken feature. Everything here is a known gap, written
down so it stays known.

**Last updated: 2026-08-16**

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

### 🟡 Captain and keeper are not in the API

B3 marks the captain `(c)` and the keeper `†`, and footers the screen with both
names. `team_members` **has** `is_captain` and `is_wicket_keeper` columns — but
`PlayerSummary` does not carry them, so the API never sends them.

Small fix: add the two fields to the shared type and the team route. Dropped
from the UI for now rather than guessed.

### 🟡 "Add a guest player"

On B3. Needs a player row created inline, attached to the squad, and a decision
about whether guests persist as real players afterwards.

### 🟡 Form figures beside each name

B4 shows "SR 128 this season" beside a batter and "Econ 6.8" beside a bowler.
Both exist behind `GET /api/players/[id]/stats` — but rendering them would be
one request per row on a screen someone is trying to get past. Needs a batch
endpoint before it is worth doing.

### 🟡 Followers and sync status

B1 shows "24 following" on a live match and "SYNCED 15:41" in the header.
Nothing counts followers, and there is no offline queue for a sync time to
describe. Both omitted rather than shown as zero — "0 following" reads as
nobody watching, which is a different claim from "we do not count yet".

### 🟡 The bottom tab bar

B1 shows tabs: Matches / Score / Card / More. Not built, because it needs a
decision first: what do **Score** and **Card** show when no match is live? A
tab bar with two dead tabs is worse than no tab bar. Buttons to Players and
Teams sit at the bottom of B1 in the meantime.

---

## Monetisation

### 🔴 AdMob renders nothing

SDK installed, app ID in `app.json`, both ad unit IDs in `lib/ads.ts`, account
review passed. **No ad component is mounted anywhere.** Placement is decided —
see the ad strategy in `FEATURES.md` — but not built:

- banner on public scorecards
- native in the match list
- one interstitial at the innings break, capped at 1/hour
- **nothing on any scorer screen**, and a CI test that fails if one appears

### 🔴 RevenueCat sells nothing

Project exists with the `supporter` entitlement and three products. Nothing is
purchasable: each product still needs creating in Play Console with real
pricing and linking back, and `react-native-purchases` is not installed.

This is the one **hard eligibility gate** for the hackathon — see `TODO.md`.

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

### 🟡 Nothing in the app offers to share anything

Three card types exist on the web — match, player career, per-player match —
and the Android app has **no share button**. The cards are real and nobody can
send them from the place people finish a match.

Small change, and it is the tap that turns one scorer into twenty-two shares.

### 🟢 The dev build on the device is stale

AdMob and the Barlow fonts are native additions, so the APK from the last
hardware test no longer matches the JS. Needs a fresh
`eas build --profile development` before the next device test.

---

## How to use this file

Delete entries as they get wired. If something here turns out to be wrong or
already done, delete it — a stale list of known gaps is worse than none,
because people stop trusting it and then stop reading it.
