# Open Innings — mobile

The Android app. Expo SDK 57, React Native 0.86, Expo Router, NativeWind.

Shares the scoring engine with the web app rather than reimplementing it:
`@open-innings/scoring` is pure TypeScript with no I/O and no framework, so it
runs unchanged here. That is the reason this app didn't need the cricket rules
written twice.

## Running it

```sh
# 1. the API, from the repo root
pnpm dev

# 2. the app, from here
pnpm start
```

Then open the **development build** on your phone — not Expo Go, which can't
run this project (see [Builds](#builds)). Scan the QR code or press `a` for an
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
(`react-native-purchases`) and AdMob are native modules, and Expo Go only ships
the modules Expo chose. You need a development build.

```sh
npm install -g eas-cli
eas login                 # free Expo account
eas init                  # writes extra.eas.projectId into app.json
eas build --profile development --platform android
```

Install the resulting APK on your phone, then `pnpm start` and it connects the
same way Expo Go did — fast refresh included, native modules working.

Three profiles in `eas.json`:

| Profile       | Output          | For                                   |
| ------------- | --------------- | ------------------------------------- |
| `development` | APK, dev client | Day-to-day work against a local Metro |
| `preview`     | APK             | Handing a build to testers            |
| `production`  | AAB             | Play Store upload                     |

⚠️ **`EXPO_PUBLIC_API_URL` is empty in every profile and must be filled in for
`preview` and `production`.** A `development` build is fine without it — it
derives the API host from Metro (see below). A standalone build has no Metro,
so with the variable unset it starts with no API URL at all and every request
fails with "No API URL". Set it to the deployed server before building anything
you hand to someone else.

### Environment variables

| Variable                             | Needed for           | Without it                                            |
| ------------------------------------ | -------------------- | ----------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                | Any standalone build | Every request fails with "No API URL"                 |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Purchases            | The paywall renders, the buy button says why it can't |

Both are `EXPO_PUBLIC_`, so both are compiled into the bundle and **neither is
a secret**. The RevenueCat one is the _public SDK key_ from the dashboard — it
identifies the app and authorises nothing. The secret key is a different string
and must never appear in this app.

Purchases degrade rather than crash: no key means `useSupporter()` reports
"purchases are not configured", the plan still renders, and the buy button is
visibly unavailable instead of appearing to take money it cannot take.

## Layout

```
app/
  _layout.tsx        Session provider + stack
  index.tsx          Launch route — redirects by auth state
  (auth)/            login, signup — bounces you out if already signed in
  (app)/             everything behind the auth guard
lib/
  api.ts             Typed client. Bearer auth, never cookies.
  session.tsx        Token in expo-secure-store + React context
  config.ts          API base URL resolution
components/
  ui.tsx             The Pavilion kit, RN edition
```

## Auth

The token lives in **expo-secure-store** (Android Keystore), not AsyncStorage —
AsyncStorage is plain unencrypted files, and this is a 30-day credential to
someone's scoring account.

On launch the stored token is **verified against the server**, not trusted. It
may have been revoked by a sign-out elsewhere, expiry, or account deletion, and
asking is the only way to know.

If that check fails because the device is offline, the token is deliberately
**not** cleared. A scorer standing in a field with no signal must not be logged
out because the network dropped.

The guards in `(app)/_layout.tsx` and `(auth)/_layout.tsx` decide what to
render — they are not security. Every endpoint re-verifies the bearer token
server-side and scopes rows to their owner.

## Gotchas worth knowing

**Metro + pnpm.** `metro.config.js` sets `watchFolders` and `nodeModulesPaths`
for the workspace. It deliberately does **not** set `disableHierarchicalLookup`,
which is the usual monorepo advice: that's for npm/yarn, where hoisting puts
everything in one root `node_modules`. pnpm resolves each package's
dependencies by walking up from the importing file, so disabling that breaks
Expo's own internals with errors like `Unable to resolve module whatwg-fetch`.

**`react-native-css-interop` is a real dependency.** It looks redundant next to
`nativewind`, but the Babel JSX transform emits that import from _application_
code, so this package has to resolve it directly. Don't remove it.

**Route types are generated, gitignored, and go stale.**
`.expo/types/router.d.ts` is written by `expo start` / `expo export`, so on a
fresh clone `tsc` accepts any `href` string without checking it.

The nastier case is staleness: **add a screen and the existing type file does
not update**, so every `href` to your new route fails typecheck against the old
route list — which looks like you wrote the path wrong. If that happens:

```sh
rm -rf .expo/types && pnpm start   # or: npx expo export --platform android
```

Regenerating on a schedule isn't automatic. Treat a sudden burst of "not
assignable to parameter of type" errors on routes you know exist as stale
types, not as a real error.

**iOS is not configured, and won't be.** AGPL-3.0 is incompatible with the App
Store's terms — Apple pulled VLC and GNU Go over exactly this. Google Play and
the Samsung Galaxy Store have no such conflict.
