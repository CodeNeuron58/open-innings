import tseslint from 'typescript-eslint';

/**
 * Lint rules for the scoring engine.
 *
 * This package had no lint config until now, which meant `pnpm -r lint` walked
 * straight past the most correctness-critical code in the repo — pnpm skips a
 * workspace package that has no `lint` script, silently and with a zero exit.
 *
 * The rules are deliberately stricter here than in the app. The engine is a
 * pure function with no I/O: there is no reason for a `console`, no reason for
 * a floating promise, and an unused variable is usually a half-finished rule
 * rather than a stylistic slip.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_` prefix marks a deliberately unused parameter — the engine's
      // step functions take arguments they don't all read.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Nothing in a pure engine should be printing.
      'no-console': 'error',
    },
  },
  {
    // Tests construct deliberately malformed events to prove the engine
    // rejects them, so the casts that implies are the point.
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
