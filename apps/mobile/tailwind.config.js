/**
 * Pavilion design tokens, ported from apps/web/tailwind.config.ts.
 *
 * Two deliberate differences from the web config:
 *
 *   1. Colours are literal HSL rather than `hsl(var(--token))`. The web reads
 *      them from CSS custom properties so a `.dark` class can swap the whole
 *      palette; React Native has no cascade to do that with. The values here
 *      are the light theme's, lifted verbatim from app/globals.css.
 *   2. No keyframes/animation block. Reanimated drives motion natively.
 *
 * The scoreboard and ball-event colours are identical on both platforms —
 * a four is the same blue in the browser and on a phone, and that consistency
 * is the whole point of having tokens.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(45 30% 97%)',
        foreground: 'hsl(160 25% 10%)',
        border: 'hsl(150 12% 87%)',
        input: 'hsl(150 12% 80%)',
        ring: 'hsl(158 64% 30%)',
        primary: {
          DEFAULT: 'hsl(158 64% 24%)',
          foreground: 'hsl(45 30% 97%)',
        },
        secondary: {
          DEFAULT: 'hsl(150 15% 93%)',
          foreground: 'hsl(160 25% 15%)',
        },
        muted: {
          DEFAULT: 'hsl(150 12% 93%)',
          foreground: 'hsl(160 8% 40%)',
        },
        accent: {
          DEFAULT: 'hsl(152 40% 90%)',
          foreground: 'hsl(158 64% 20%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 72% 45%)',
          foreground: 'hsl(0 0% 100%)',
        },
        card: {
          DEFAULT: 'hsl(0 0% 100%)',
          foreground: 'hsl(160 25% 10%)',
        },
        // Cricket-specific — grass tones
        pitch: {
          DEFAULT: 'hsl(82 50% 45%)',
          dark: 'hsl(82 40% 35%)',
        },
        // Always dark, regardless of theme — a scoreboard is always dark.
        scoreboard: {
          DEFAULT: 'hsl(166 38% 7%)',
          panel: 'hsl(164 30% 11%)',
          border: 'hsl(163 25% 17%)',
          text: 'hsl(150 25% 96%)',
          muted: 'hsl(158 12% 64%)',
          accent: 'hsl(43 96% 56%)',
        },
        // Ball-event semantics. Chips always carry a text label ("4", "W", "wd"),
        // so colour reinforces identity rather than carrying it alone.
        four: { DEFAULT: 'hsl(217 91% 48%)', foreground: 'hsl(0 0% 100%)' },
        six: { DEFAULT: 'hsl(271 70% 50%)', foreground: 'hsl(0 0% 100%)' },
        wicket: { DEFAULT: 'hsl(0 74% 46%)', foreground: 'hsl(0 0% 100%)' },
        extra: { DEFAULT: 'hsl(38 92% 42%)', foreground: 'hsl(0 0% 100%)' },
        live: { DEFAULT: 'hsl(0 84% 55%)', foreground: 'hsl(0 0% 100%)' },
      },
      borderRadius: {
        sm: 8,
        md: 10,
        lg: 12,
      },
    },
  },
  plugins: [],
};
