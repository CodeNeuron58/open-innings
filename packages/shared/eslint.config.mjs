import tseslint from 'typescript-eslint';

/**
 * Lint rules for the shared API contract.
 *
 * Like the scoring engine, this package was invisible to `pnpm -r lint` because
 * it had no `lint` script — pnpm skips such packages without failing.
 *
 * This package is imported by both the Next.js server and a React Native
 * bundle, so it must stay free of Node built-ins and framework imports. Those
 * are enforced by review and by the absence of the dependencies rather than by
 * a rule, but the ordinary correctness rules apply here as everywhere.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'error',
    },
  },
);
