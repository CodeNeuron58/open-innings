import expoConfig from 'eslint-config-expo/flat.js';
import tseslint from 'typescript-eslint';

/**
 * Lint rules for the Expo app.
 *
 * This app had no lint config, so `pnpm -r lint` skipped it entirely — pnpm
 * passes over a workspace package with no `lint` script and exits zero, which
 * is why CI's lint step was green while three of four projects went unchecked.
 *
 * Built on `eslint-config-expo`, which carries the React Native and React
 * Hooks rules the app actually needs — exhaustive-deps in particular, since
 * every screen here is hooks-driven.
 */
export default tseslint.config(
  { ignores: ['dist/**', '.expo/**', 'node_modules/**', 'expo-env.d.ts'] },
  expoConfig,
  {
    // Scoped to TypeScript. `eslint-config-expo` registers the
    // @typescript-eslint plugin only for TS files, so an unscoped block
    // referencing its rules fails on babel.config.js and friends.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Warn rather than error: a stray log in a screen is worth removing but
      // is not worth failing a build over, and the app legitimately reports
      // failures it cannot surface any other way.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
