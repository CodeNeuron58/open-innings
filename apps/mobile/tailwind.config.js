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
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Core roles
        background: '#f2f2f3',
        foreground: '#1d1f20',
        // The divider is a 16% ink mix on the web. React Native has no
        // color-mix(), so it is resolved to the equivalent solid here.
        border: '#d4d4d7',
        input: '#b7b7ba',
        ring: '#5980a6',

        primary: {
          DEFAULT: '#5980a6',
          foreground: '#f2f2f3',
        },
        secondary: {
          DEFAULT: '#e9e9ea',
          foreground: '#1d1f20',
        },
        muted: {
          DEFAULT: '#e7e7ea',
          foreground: '#7a7a7d',
        },
        accent: {
          DEFAULT: '#d6ebff',
          foreground: '#1d2d3d',
        },
        destructive: {
          DEFAULT: '#b3261e',
          foreground: '#f2f2f3',
        },
        // Cards are transparent line drawings in this system, never filled
        // surfaces — so `card` matches the ground and the border does the work.
        card: {
          DEFAULT: '#f2f2f3',
          foreground: '#1d1f20',
        },

        // Neutral ramp — OKLCH-derived, shared lightness scale with accent.
        neutral: {
          100: '#f5f5f8',
          200: '#e7e7ea',
          300: '#d4d4d7',
          400: '#b7b7ba',
          500: '#98989b',
          600: '#7a7a7d',
          700: '#5d5d60',
          800: '#424244',
          900: '#2b2b2d',
        },

        // Accent ramp — the only colour in the system.
        steel: {
          100: '#eef6ff',
          200: '#d6ebff',
          300: '#b5d9fd',
          400: '#94bce3',
          500: '#749dc4',
          600: '#597ea3',
          700: '#416180',
          800: '#2c455d',
          900: '#1d2d3d',
        },

        /**
         * The score plate — the one reversed field on the scoring screen, and
         * the deep accent step the readme permits to carry a full ground with
         * type reversed to paper. Was "always dark green"; it is now steel.
         */
        scoreboard: {
          DEFAULT: '#1d2d3d',
          panel: '#2c455d',
          border: '#416180',
          text: '#f2f2f3',
          muted: '#94bce3',
          accent: '#b5d9fd',
        },

        // Ball events, as ramp steps. See the note at the top of this file.
        four: { DEFAULT: '#d6ebff', foreground: '#1d2d3d' },
        six: { DEFAULT: '#b5d9fd', foreground: '#1d2d3d' },
        wicket: { DEFAULT: '#1d2d3d', foreground: '#f2f2f3' },
        extra: { DEFAULT: '#5980a6', foreground: '#f2f2f3' },
        live: { DEFAULT: '#5980a6', foreground: '#f2f2f3' },
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
