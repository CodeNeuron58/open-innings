# Open Innings — mobile

The Android app. Expo SDK 57, React Native 0.86, Expo Router, NativeWind.

Shares the scoring engine with the web app rather than reimplementing it:
`@open-innings/scoring` is pure TypeScript with no I/O and no framework, so it
runs unchanged here. That is why this app did not need the cricket rules
written twice — and why offline scoring is honest rather than optimistic. A tap
folds the pending deliveries through the same `applyBall` the server runs,
against the server's own last answer.

## Running it

```sh
# 1. the API, from the repo root
pnpm dev

# 2. the app, from here
pnpm start
```

Then open the **development build** on your phone — not Expo Go, which cannot
run this project (see [Builds](#builds)). Scan the QR code, or press `a` for an
emulator.

**You don't need to configure an API URL for local development.** A phone can't
reach `localhost` — that's the phone itself — but it is on the same wifi as
your machine, and Metro already knows your machine's LAN address.
`lib/config.ts` derives the API host from it, so there's no IP to hardcode and
later forget about.

If the app loads but every request fails, check Windows Firewall isn't blocking
port 3000 from the LAN. Open `http://<your-PC-IP>:3000` in the phone's browser
to tell the two apart.

## Builds

**Expo Go does not work for this project and never will.** RevenueCat
(`react-native-purchases`), AdMob and `expo-sqlite` are native modules, and
Expo Go only ships the modules Expo chose. You need a development build.

```sh
npm install -g eas-cli
eas login                 # free Expo account
eas build --profile development --platform android
```

Install the resulting APK, then `pnpm start` and it connects the way Expo Go
did — fast refresh included, native modules working.

Four profiles in `eas.json`:

| Profile       | Output          | For                                    |
| ------------- | --------------- | -------------------------------------- |
| `development` | APK, dev client | Day-to-day work against a local Metro  |
| `preview`     | APK             | Handing a build to testers             |
| `testing`     | AAB             | Play testing tracks, with ads off      |
| `production`  | AAB             | Play Store release, with live ad units |

`appVersionSource` is `remote`, so **EAS owns `versionCode`** and increments it
on the `testing` and `production` profiles. A number written into `app.json`
would be ignored. `expo.version` is the versionName, and is the only half of
the pair that belongs in the repo.

### A native module means a new dev client

Adding any native dependency — not just a JS one — invalidates every dev build
on every device. If a change needs `react-native-svg` or similar, everyone
testing has to install a fresh APK before they can run it. That constraint is
why the wagon wheel is drawn with plain views.

### Environment variables

| Variable                             | Needed for           | Without it                                            |
| ------------------------------------ | -------------------- | ----------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                | Any standalone build | Every request fails with "No API URL"                 |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Purchases            | The paywall renders, the buy button says why it can't |
| `EXPO_PUBLIC_ADS_MODE`               | Live ad units        | Google's test units, which is the safe default        |

Both `EXPO_PUBLIC_` values are compiled into the bundle and **neither is a
secret**. The RevenueCat one is the _public SDK key_ — it identifies the app and
authorises nothing. The secret key is a different string and must never appear
in this app.

`EXPO_PUBLIC_API_URL` points at `https://openinnings.com` in the standalone
profiles. Use the custom domain rather than the `herokuapp.com` hostname, and
not just for tidiness: a released binary has its API URL **baked in**, and the
herokuapp hostname is tied to the Heroku app's name. Renaming or recreating
that app would strand every installed copy with no way to reach a server.

`EXPO_PUBLIC_ADS_MODE=live` is set by the `production` profile only. `__DEV__`
was once the only guard, and it is false in a _preview_ build — so an APK built
purely to hand to testers served real ads against the real publisher id.
Testers tap things, and clicks on your own inventory suspend accounts. The
default costs nothing when forgotten.

## Layout

```
app/
  _layout.tsx        Session + settings providers, fonts, stack
  index.tsx          Launch route — redirects by auth state
  (auth)/            welcome, signup, login, reset — signed out
  (app)/             everything behind the auth guard
lib/
  api.ts             Typed client. Bearer auth, never cookies.
  session.tsx        Token in expo-secure-store + React context
  gate.ts            Which screen an auth state is allowed — a pure function
  config.ts          API base URL resolution
  outbox.ts          The offline queue, as pure functions
  use-outbox.ts      The drain loop around it
  wagon-wheel.ts     Shot-placement geometry
components/
  ui.tsx             The Industry kit, RN edition
```

`lib/` holds the parts that can be tested. `vitest.config.ts` runs over that
directory only, because there is **no React renderer in this workspace** — so
anything that is layout, gesture or device behaviour is typecheck-, lint- and
unit-test-verified and nothing more. That is why the pure logic keeps getting
pulled out of screens: it is the only half a test can reach.

## Auth

The token lives in **expo-secure-store** (Android Keystore), not AsyncStorage —
AsyncStorage is plain unencrypted files, and this is a 30-day credential to
somebody's scoring account.

On launch the stored token is **verified against the server**, not trusted. It
may have been revoked by a sign-out elsewhere, expiry, or account deletion, and
asking is the only way to know.

If that check fails because the device is offline, the token is deliberately
**not** cleared. A scorer standing in a field with no signal must not be logged
out because the network dropped.

An account is not finished until its address is confirmed: `gateFor` sends
every unverified account to the six-digit screen and lets nothing else past.
The guards in `(app)/_layout.tsx` and `(auth)/_layout.tsx` decide what to
render — they are **not security**. Every endpoint re-verifies the bearer token
server-side and scopes rows to their owner.

## Gotchas worth knowing

**Metro + pnpm.** `metro.config.js` sets `watchFolders` and `nodeModulesPaths`
for the workspace. It deliberately does **not** set
`disableHierarchicalLookup`, which is the usual monorepo advice: that's for
npm/yarn, where hoisting puts everything in one root `node_modules`. pnpm
resolves each package's dependencies by walking up from the importing file, so
disabling that breaks Expo's own internals with errors like
`Unable to resolve module whatwg-fetch`.

**`react-native-css-interop` is a real dependency.** It looks redundant next to
`nativewind`, but the Babel JSX transform emits that import from _application_
code, so this package has to resolve it directly. Don't remove it.

**Dark mode hangs off `.dark:root`.** `tailwind.config.js` sets
`darkMode: 'class'`, and `react-native-css-interop` matches that selector
**structurally** — `:root.dark` or a descendant selector will not do, and
getting it wrong fails silently: the variables never apply and every dark
screen renders in light colours.

**New Tailwind classes need Metro to rebuild the CSS.** A fast refresh picks up
a JSX change but can miss a brand-new arbitrary class like `text-[12.5px]`. If
structure updates and styling doesn't, restart with
`npx expo start --dev-client --clear`. It is a cold rebuild and takes minutes,
so don't reach for it first.

**Route types are generated, gitignored, and go stale.**
`.expo/types/router.d.ts` is written by `expo start` / `expo export`, so on a
fresh clone `tsc` accepts any `href` string without checking it. The nastier
case is staleness: **add a screen and the existing type file does not update**,
so every `href` to your new route fails typecheck against the old route list —
which looks like you wrote the path wrong.

```sh
rm -rf .expo/types && pnpm start
```

Treat a sudden burst of "not assignable to parameter of type" errors on routes
you know exist as stale types, not a real error.

**Every `Text` needs a font class.** React Native does not inherit
`fontFamily` from a parent `View` — only from a parent `Text`. There is no
cascade, so a `<Text>` without `font-sans` or `font-heading` silently renders
in Android's system font instead of Barlow.

**iOS is not configured, and won't be.** AGPL-3.0 is incompatible with the App
Store's terms — Apple pulled VLC and GNU Go over exactly this. Google Play and
the Samsung Galaxy Store have no such conflict.
