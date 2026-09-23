## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The problem it solves. For a scoring change, cite the Law. -->

## Checks

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` and `pnpm format` pass
- [ ] New behaviour has a test, and a scoring change has one per Law affected

## If this touches the engine

- [ ] The rule lives in `packages/scoring/src/rules.ts`, not restated elsewhere
- [ ] Stored deliveries still replay — validation tightened on write, not on read

## If this touches the app

- [ ] Every new `<Text>` names a font class (React Native does not inherit `fontFamily`)
- [ ] Screenshot attached for anything visual
