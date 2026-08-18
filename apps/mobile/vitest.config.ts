/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the mobile app's **pure logic**, and deliberately nothing
 * else.
 *
 * Until now `apps/mobile` had no tests at all — `typecheck` and `lint` were
 * the whole of its verification, and neither can see a rule that is expressed
 * correctly in TypeScript and wrongly in cricket. That is not a hypothetical:
 * the correction sheet shipped a no-ball split that gave the batter nothing,
 * and it typechecked, linted, and would have been accepted by the schema and
 * the engine alike.
 *
 * No React renderer, no jest-expo, no testing-library. Rendering a React
 * Native tree in CI is a different and much heavier problem, and it would not
 * have caught the bug above either. What catches that bug is putting the rule
 * in a function and asserting it against the shared schema — so the rules get
 * pulled out of components into `lib/`, and this runs over `lib/`.
 *
 * The gap that remains is real and stated in `checklist.md`: layout, gesture
 * and device behaviour are still only verifiable on hardware.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/**/*.test.ts'],
  },
});
