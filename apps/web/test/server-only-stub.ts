/**
 * Stands in for the `server-only` package under vitest.
 *
 * `server-only` exists to break the build if a server module is pulled into a
 * client bundle — it has no runtime behaviour, just a resolution error aimed
 * at bundlers. Vitest is neither, so importing it fails for a reason that has
 * nothing to do with the test:
 *
 *   Failed to load url server-only ... Does the file exist?
 *
 * Aliased to this empty module in vitest.config.ts. The guarantee is not
 * weakened: `next build` still resolves the real package, which is where the
 * check is meant to fire.
 */
export {};
