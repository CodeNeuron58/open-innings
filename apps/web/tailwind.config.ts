import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Cricket-specific — grass tones
        pitch: {
          DEFAULT: 'hsl(82 50% 45%)',
          dark: 'hsl(82 40% 35%)',
        },
        // Scoreboard — fixed dark surface used by the scorer + live score heroes,
        // independent of the light/dark theme (a scoreboard is always dark).
        scoreboard: {
          DEFAULT: 'hsl(166 38% 7%)',
          panel: 'hsl(164 30% 11%)',
          border: 'hsl(163 25% 17%)',
          text: 'hsl(150 25% 96%)',
          muted: 'hsl(158 12% 64%)',
          accent: 'hsl(43 96% 56%)',
        },
        // Ball-event semantics. Chips always carry a text label ("4", "W", "wd"),
        // so color reinforces identity rather than carrying it alone.
        four: {
          DEFAULT: 'hsl(217 91% 48%)',
          foreground: 'hsl(0 0% 100%)',
        },
        six: {
          DEFAULT: 'hsl(271 70% 50%)',
          foreground: 'hsl(0 0% 100%)',
        },
        wicket: {
          DEFAULT: 'hsl(0 74% 46%)',
          foreground: 'hsl(0 0% 100%)',
        },
        extra: {
          DEFAULT: 'hsl(38 92% 42%)',
          foreground: 'hsl(0 0% 100%)',
        },
        live: {
          DEFAULT: 'hsl(0 84% 55%)',
          foreground: 'hsl(0 0% 100%)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 44 34 / 0.06), 0 1px 6px -1px rgb(16 44 34 / 0.08)',
        'card-hover': '0 4px 12px -2px rgb(16 44 34 / 0.12), 0 2px 6px -2px rgb(16 44 34 / 0.08)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'score-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 250ms ease-out',
        'pulse-live': 'pulse-live 1.4s ease-in-out infinite',
        'score-pop': 'score-pop 300ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
