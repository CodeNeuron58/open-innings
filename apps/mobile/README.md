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

Then scan the QR code with Expo Go, or press `a` for an emulator.

**You don't need to configure an API URL for local development.** A phone can't
reach `localhost` — that's the phone itself — but it is on the same wifi as
your machine, and Metro already knows your machine's LAN address. `lib/config.ts`
derives the API host from it.

For a real build, set `EXPO_PUBLIC_API_URL` to the deployed server. Expo inlines
`EXPO_PUBLIC_*` at build time.

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

**Route types are generated, and gitignored.** `.expo/types/router.d.ts` is
written by the dev server, so on a fresh clone `tsc` accepts any `href` string
without checking it. Run `pnpm start` once before trusting a typecheck to catch
a bad route.

**iOS is not configured, and won't be.** AGPL-3.0 is incompatible with the App
Store's terms — Apple pulled VLC and GNU Go over exactly this. Google Play and
the Samsung Galaxy Store have no such conflict.
