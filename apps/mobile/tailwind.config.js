/**
 * Industry design tokens, ported from apps/web/styles/industry.css.
 *
 * Replaces the old Pavilion palette (pitch-green on cream, rounded cards) to
 * match the redesign the marketing site now shows. The phone mockups on
 * openinnings.com are the reference for what these screens should look like —
 * see apps/web/components/marketing/phone-screen.tsx.
 *
 * Three things carry over from the previous config, deliberately:
 *
 *   1. Colours are literal hex rather than CSS custom properties. The web
 *      reads them from `var(--color-*)` so a theme can swap at runtime;
 *      React Native has no cascade to do that with, so the values are
 *      resolved here. Keep them in step with industry.css by hand.
 *   2. Every semantic token name the screens already use is kept, so this is
 *      a re-map rather than a rewrite — no screen has to change to pick up
 *      the new palette.
 *   3. No keyframes block. Reanimated drives motion natively.
 *
 * Industry is a MONO scheme. Its readme is explicit: "do not add decorative
 * colour beyond the steel accent." So the ball-event tokens below are steps
 * on the accent ramp rather than separate hues — a four and a six differ by
 * value, not by colour. That only works because every chip carries its label
 * ("4", "6", "W"), so colour reinforces identity instead of carrying it.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  /*
   * `class`, not `media`.
   *
   * `media` reads the phone and cannot be overruled, so the theme was whatever
   * Android said and the app had no say. The palette in global.css now hangs
   * off `.dark:root`, and `lib/settings.tsx` decides which way that goes.
   */
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      /*
       * Every colour is a CSS custom property resolved at runtime.
       *
       * These were literal hex, with a note here saying React Native "has no
       * cascade" to read variables through. NativeWind 4 does, and re-resolves
       * them when the colour scheme changes — so the palette moved to
       * `global.css` where both themes live side by side, and this file became
       * the mapping rather than the values.
       *
       * `<alpha-value>` is what keeps `text-foreground/70` and
       * `bg-destructive/10` working, and it is why the variables hold channels
       * rather than hex.
       */
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',

        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-destructive) / <alpha-value>)',
          foreground: 'rgb(var(--color-destructive-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--color-card) / <alpha-value>)',
          foreground: 'rgb(var(--color-card-foreground) / <alpha-value>)',
        },

        neutral: {
          100: 'rgb(var(--color-neutral-100) / <alpha-value>)',
          200: 'rgb(var(--color-neutral-200) / <alpha-value>)',
          300: 'rgb(var(--color-neutral-300) / <alpha-value>)',
          400: 'rgb(var(--color-neutral-400) / <alpha-value>)',
          500: 'rgb(var(--color-neutral-500) / <alpha-value>)',
          600: 'rgb(var(--color-neutral-600) / <alpha-value>)',
          700: 'rgb(var(--color-neutral-700) / <alpha-value>)',
          800: 'rgb(var(--color-neutral-800) / <alpha-value>)',
          900: 'rgb(var(--color-neutral-900) / <alpha-value>)',
        },

        steel: {
          100: 'rgb(var(--color-steel-100) / <alpha-value>)',
          200: 'rgb(var(--color-steel-200) / <alpha-value>)',
          300: 'rgb(var(--color-steel-300) / <alpha-value>)',
          400: 'rgb(var(--color-steel-400) / <alpha-value>)',
          500: 'rgb(var(--color-steel-500) / <alpha-value>)',
          600: 'rgb(var(--color-steel-600) / <alpha-value>)',
          700: 'rgb(var(--color-steel-700) / <alpha-value>)',
          800: 'rgb(var(--color-steel-800) / <alpha-value>)',
          900: 'rgb(var(--color-steel-900) / <alpha-value>)',
        },

        scoreboard: {
          DEFAULT: 'rgb(var(--color-scoreboard) / <alpha-value>)',
          panel: 'rgb(var(--color-scoreboard-panel) / <alpha-value>)',
          border: 'rgb(var(--color-scoreboard-border) / <alpha-value>)',
          text: 'rgb(var(--color-scoreboard-text) / <alpha-value>)',
          muted: 'rgb(var(--color-scoreboard-muted) / <alpha-value>)',
          accent: 'rgb(var(--color-scoreboard-accent) / <alpha-value>)',
        },

        four: {
          DEFAULT: 'rgb(var(--color-four) / <alpha-value>)',
          foreground: 'rgb(var(--color-four-foreground) / <alpha-value>)',
        },
        six: {
          DEFAULT: 'rgb(var(--color-six) / <alpha-value>)',
          foreground: 'rgb(var(--color-six-foreground) / <alpha-value>)',
        },
        wicket: {
          DEFAULT: 'rgb(var(--color-wicket) / <alpha-value>)',
          foreground: 'rgb(var(--color-wicket-foreground) / <alpha-value>)',
        },
        extra: {
          DEFAULT: 'rgb(var(--color-extra) / <alpha-value>)',
          foreground: 'rgb(var(--color-extra-foreground) / <alpha-value>)',
        },
        live: {
          DEFAULT: 'rgb(var(--color-live) / <alpha-value>)',
          foreground: 'rgb(var(--color-live-foreground) / <alpha-value>)',
        },
      },

      /**
       * Industry frames things as blueprint objects: square corners and a
       * hairline border, never soft filled rounded blocks. The old scale was
       * 8/10/12; this is the design system's own 2/4/7, which reads as square
       * at phone sizes while keeping a hair off a true right angle.
       */
      borderRadius: {
        sm: 2,
        md: 4,
        lg: 7,
      },

      fontFamily: {
        // Barlow Condensed for headings, figures and anything tabular;
        // Barlow for body copy. Loaded in app/_layout.tsx via expo-font.
        heading: ['BarlowCondensed_600SemiBold'],
        sans: ['Barlow_400Regular'],
        medium: ['Barlow_500Medium'],
        bold: ['Barlow_700Bold'],
      },
    },
  },
  plugins: [],
};
