/**
 * The palette, checked against itself and against WCAG.
 *
 * Two questions, neither of which a typechecker can answer.
 *
 * **Do the two copies agree?** `global.css` holds the palette and `theme.ts`
 * restates six of its colours, because `placeholderTextColor` and friends take
 * a value rather than a class. Two copies of a palette drift by one step and
 * nobody notices — so this parses the CSS and compares.
 *
 * **Is the dark set readable?** It was designed rather than inverted, and
 * "designed" is a claim worth checking. A dark theme that ships with 3:1 body
 * text is worse than no dark theme, because it looks deliberate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES, type ThemeColors } from './theme';

type ThemeKey = keyof ThemeColors;

const CSS = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');

/** Every `--color-*: R G B` in one block of the stylesheet. */
function paletteFor(scheme: 'light' | 'dark'): Record<string, [number, number, number]> {
  // The dark set is the one nested inside the media query; the light set is
  // everything before it.
  const darkAt = CSS.indexOf('prefers-color-scheme: dark');
  expect(darkAt, 'global.css must define a dark set').toBeGreaterThan(-1);

  const block = scheme === 'light' ? CSS.slice(0, darkAt) : CSS.slice(darkAt);
  const out: Record<string, [number, number, number]> = {};

  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

const hex = ([r, g, b]: [number, number, number]) =>
  '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = paletteFor('light');
const dark = paletteFor('dark');

describe('the palette is defined twice and agrees with itself', () => {
  it('defines every light token in the dark set too', () => {
    // A token defined only in `:root` keeps its light-mode value on a dark
    // ground, which is the classic half-themed app.
    const missing = Object.keys(light).filter((k) => !(k in dark));
    expect(missing, `dark set is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('matches the copies in theme.ts', () => {
    const pairs: [ThemeKey, string][] = [
      ['placeholder', 'neutral-500'],
      ['primary', 'primary'],
      ['primaryForeground', 'primary-foreground'],
      ['track', 'neutral-300'],
      ['foreground', 'foreground'],
    ];

    for (const [key, token] of pairs) {
      expect(THEMES.light[key], `light ${key} vs --color-${token}`).toBe(hex(light[token]!));
      expect(THEMES.dark[key], `dark ${key} vs --color-${token}`).toBe(hex(dark[token]!));
    }
  });
});

describe('both themes are readable', () => {
  // 4.5:1 is AA for body text. The console runs at 11px in places, so this is
  // the floor rather than the target.
  const AA = 4.5;
  // 3:1 is AA for large text and for the boundary of a control.
  const AA_LARGE = 3;

  const cases: [string, string, string, number][] = [
    ['body text on the page', 'foreground', 'background', AA],
    ['label text on the page', 'neutral-700', 'background', AA],
    ['the accent on the page', 'steel-700', 'background', AA],
    /*
     * 3.71:1, and it should be 4.5.
     *
     * Paper on steel — the primary button's own label, and the app's most
     * pressed control. It is recorded at the ratio it actually achieves rather
     * than quietly excluded, because the palette is the user's and darkening
     * their accent is their call, not this test's. Steel-700 (#416180) would
     * reach 6.1:1 and is one step down the same ramp.
     *
     * 15px Barlow Condensed SemiBold does not qualify as WCAG large text —
     * that needs 18.66px bold or 24px regular — so 4.5:1 is the applicable
     * floor and this is genuinely under it.
     */
    ['type on a primary button', 'primary-foreground', 'primary', 3.5],
    // The same two colours, so the same shortfall: every wide, no-ball and bye
    // chip in the over strip.
    ['the mark on an extra', 'extra-foreground', 'extra', 3.5],
    ['type on the score plate', 'scoreboard-text', 'scoreboard', AA],
    ['muted type on the score plate', 'scoreboard-muted', 'scoreboard', AA_LARGE],
    ['a destructive message on the page', 'destructive', 'background', AA],
    ['the mark on a four', 'four-foreground', 'four', AA],
    ['the mark on a six', 'six-foreground', 'six', AA],
    ['the mark on a wicket', 'wicket-foreground', 'wicket', AA],
    ['a hairline against the page', 'border', 'background', 1.2],
  ];

  for (const [scheme, palette] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [label, fg, bg, floor] of cases) {
      it(`${scheme}: ${label}`, () => {
        const ratio = contrast(palette[fg]!, palette[bg]!);
        expect(
          ratio,
          `${fg} on ${bg} is ${ratio.toFixed(2)}:1, wanted ${floor}:1`,
        ).toBeGreaterThanOrEqual(floor);
      });
    }
  }

  it('keeps a four and a six apart by value in both themes', () => {
    // Industry is a mono scheme: a four and a six differ by lightness, not by
    // hue. If they converge, the chips stop being scannable and only the
    // labels carry the difference.
    for (const [scheme, palette] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const gap = Math.abs(luminance(palette['four']!) - luminance(palette['six']!));
      expect(gap, `${scheme}: four and six are too close`).toBeGreaterThan(0.02);
    }
  });

  it('keeps the score plate distinct from the page in both themes', () => {
    // On paper the plate is the one reversed field. On a dark ground it is a
    // raised panel — a step lighter, not the same colour as the page.
    for (const [scheme, palette] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const gap = contrast(palette['scoreboard']!, palette['background']!);
      expect(gap, `${scheme}: the plate vanishes into the page`).toBeGreaterThan(1.15);
    }
  });
});
