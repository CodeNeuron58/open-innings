/**
 * Font loading for Satori-rendered share cards.
 *
 * Lived in triplicate across the three `opengraph-image` routes before a
 * fourth wanted it. One copy now, because the subsetting rule below is the
 * kind of thing that gets fixed in one file and stays broken in the others.
 */
import 'server-only';

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600;
  style: 'normal';
};

/**
 * Fetches a Google font as raw bytes, subsetted to the glyphs given.
 *
 * ⚠️ The subset must cover **every** glyph the card draws, including the
 * uppercase forms of anything rendered through `textTransform`. A missing
 * glyph does not error — it silently falls back to another face with
 * different metrics, which reads as a layout bug rather than a font one.
 * This has already cost one debugging session: a card whose only capital `M`
 * came from `textTransform` lost it, and "OPENINNINGS.COM" overflowed its
 * box in a different typeface.
 *
 * Use `glyphsFor` rather than assembling the subset by hand.
 */
export async function loadFont(
  family: string,
  weight: 400 | 600,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const url =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
      `&text=${encodeURIComponent(text)}`;
    const css = await fetch(url, {
      // Google serves woff2 to modern agents and Satori cannot read it; an
      // ancient UA string gets truetype back.
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:1.0) Gecko/20100101 Firefox/1.0',
      },
      /*
       * Two round trips to fonts.googleapis.com stand between a shared link
       * and its preview, and neither had a bound. A slow or hanging Google
       * held the card render open for as long as it liked — on the request a
       * WhatsApp or Twitter crawler makes, which gives up long before we do
       * and shows no preview at all.
       *
       * Ten seconds matches the ceiling `lib/mail/send.ts` already puts on
       * its third party. On timeout the catch below returns null and the card
       * draws in a fallback face, which is the whole point of failing soft
       * here: a card in the wrong typeface still says the score.
       */
      signal: AbortSignal.timeout(10_000),
      // Fonts for a given glyph subset never change. Without this every render
      // re-fetched both faces; a share card is hit repeatedly by crawlers and
      // re-shares, and none of them needed a fresh copy.
      next: { revalidate: 60 * 60 * 24 },
    }).then((r) => r.text());
    const href = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!href) return null;
    return await fetch(href, {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 60 * 60 * 24 },
    }).then((r) => r.arrayBuffer());
  } catch {
    // A card without its font still renders in a fallback face. A card that
    // throws renders nothing at all, and the link was already shared.
    return null;
  }
}

/**
 * The glyph subset for a set of strings.
 *
 * Includes each string's uppercase form, which is what `textTransform:
 * uppercase` will actually ask the font for.
 */
export function glyphsFor(drawn: (string | null | undefined)[]): string {
  return drawn
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s + s.toUpperCase())
    .join('');
}

/** Loads the Industry pairing — Barlow Condensed for figures, Barlow for prose. */
export async function loadCardFonts(glyphs: string): Promise<OgFont[]> {
  const [head, body] = await Promise.all([
    loadFont('Barlow Condensed', 600, glyphs),
    loadFont('Barlow', 400, glyphs),
  ]);

  return [
    head && { name: 'Heading', data: head, weight: 600 as const, style: 'normal' as const },
    body && { name: 'Body', data: body, weight: 400 as const, style: 'normal' as const },
  ].filter(Boolean) as OgFont[];
}

/** The palette the cards draw in. Mirrors the Industry tokens. */
export const CARD = {
  ink: '#1d1f20',
  ground: '#f2f2f3',
  steel: '#5980a6',
  steel900: '#1d2d3d',
  divider: '#d4d4d7',
  muted: '#7a7a7d',
  brand: 'OPEN INNINGS',
  domain: 'openinnings.com',
} as const;
