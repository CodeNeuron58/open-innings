import { ImageResponse } from 'next/og';
import { careerFor } from '@/lib/services/stats';

/**
 * The shareable player card — a cricket CV as a picture.
 *
 * This is the growth loop, not decoration. WhatsApp is how club cricket is
 * organised in India, and WhatsApp shares *images*: a pasted URL gets a small
 * grey preview people scroll past, while an image gets looked at. Everything
 * else in Tier 0 is invisible without this.
 *
 * Using Next's `opengraph-image` convention rather than a hand-rolled route
 * means it is wired into the page's metadata automatically — sharing
 * /p/<id> anywhere that reads Open Graph shows this card with no extra work,
 * and the same URL doubles as an image someone can save and post themselves.
 *
 * Satori (which renders this) supports a subset of CSS: flexbox only, no grid,
 * and every element with more than one child needs an explicit `display`.
 * Keep it simple in here.
 */

export const alt = 'Career record on Open Innings';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Industry tokens, resolved. Satori has no CSS custom properties.
const INK = '#1d1f20';
const GROUND = '#f2f2f3';
const STEEL = '#5980a6';
const STEEL_900 = '#1d2d3d';
const DIVIDER = '#d4d4d7';
const MUTED = '#7a7a7d';

// The fixed strings on the card. Named so the font subset can be built from
// the same values that get drawn — see the `drawn` array below.
const BRAND = 'OPEN INNINGS';
const KICKER = 'Career record';
const DOMAIN = 'openinnings.com';

/**
 * Fetches a Google font as raw bytes for Satori.
 *
 * `text=` asks Google for a subset covering only the glyphs this card
 * actually draws, which keeps the download to a few KB rather than the whole
 * face. Returns null on failure — a card in the fallback font is far better
 * than a 500 on the artifact whose entire job is being shareable.
 */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
      `&text=${encodeURIComponent(text)}`;
    const css = await fetch(url, {
      headers: {
        // Google serves woff2 to modern UAs; Satori needs ttf, and the UA is
        // what decides which one the CSS points at.
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:1.0) Gecko/20100101 Firefox/1.0',
      },
    }).then((r) => r.text());

    const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css);
    const href = src?.[1];
    if (!href) return null;
    return await fetch(href).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

/** One big number and its label. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: 'Heading', fontSize: 76, color: INK, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontFamily: 'Heading',
          fontSize: 20,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: STEEL,
          marginTop: 10,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;

  let name = 'Player';
  let stats: { value: string; label: string }[] = [];
  let line = '';

  try {
    const { player, batting, bowling } = await careerFor(playerId);
    name = player.fullName;

    // A bowler's card should lead with wickets, a batter's with runs. Pick by
    // whichever they have actually done more of rather than showing a wall of
    // zeroes for the half they don't play.
    const isBowler =
      (bowling.wickets > 0 && bowling.wickets * 20 > batting.runs) ||
      (bowling.innings > 0 && batting.innings === 0);

    stats = isBowler
      ? [
          { value: String(bowling.wickets), label: 'Wickets' },
          {
            value: bowling.innings > 0 ? `${bowling.bestWickets}-${bowling.bestRuns}` : '—',
            label: 'Best',
          },
          { value: bowling.economy === null ? '—' : bowling.economy.toFixed(2), label: 'Economy' },
        ]
      : [
          { value: String(batting.runs), label: 'Runs' },
          { value: batting.average === null ? '—' : batting.average.toFixed(1), label: 'Average' },
          {
            value: `${batting.highScore}${batting.highScoreNotOut ? '*' : ''}`,
            label: 'High score',
          },
        ];

    const parts: string[] = [];
    // "innings" is invariant in cricket — one innings, two innings — so it
    // takes no plural. "wicket" and "score" do.
    if (batting.innings > 0) parts.push(`${batting.innings} innings`);
    if (bowling.wickets > 0) {
      parts.push(`${bowling.wickets} wicket${bowling.wickets === 1 ? '' : 's'}`);
    } else if (bowling.innings > 0 && batting.innings === 0) {
      parts.push('0 wickets');
    }
    const fiftyPlus = batting.fifties + batting.hundreds;
    if (fiftyPlus > 0) {
      parts.push(`${fiftyPlus} fifty-plus score${fiftyPlus === 1 ? '' : 's'}`);
    }
    line = parts.join('  ·  ');
  } catch {
    // Rendered for a player that no longer exists — still return a card, so a
    // stale shared link degrades to branding rather than a broken image.
    line = KICKER;
  }

  /**
   * The glyph subset to request.
   *
   * Must include the *rendered* form of every string, not the source form:
   * several of these are drawn through `textTransform: uppercase`, and a
   * glyph missing from the subset silently falls back to another font with
   * different metrics — which is how "OPENINNINGS.COM" ended up with its M
   * hanging outside the box, because no other text on the card contains one.
   */
  const drawn = [name, line, ...stats.flatMap((s) => [s.value, s.label]), BRAND, KICKER, DOMAIN];
  const glyphs = drawn.map((s) => s + s.toUpperCase()).join('');
  const [heading, body] = await Promise.all([
    loadFont('Barlow Condensed', 600, glyphs),
    loadFont('Barlow', 400, glyphs),
  ]);

  const fonts = [
    heading && { name: 'Heading', data: heading, weight: 600 as const, style: 'normal' as const },
    body && { name: 'Body', data: body, weight: 400 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 600 | 400; style: 'normal' }[];

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: GROUND,
        padding: 64,
        border: `1px solid ${DIVIDER}`,
      }}
    >
      {/* Header rule, in the spec-sheet grammar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${DIVIDER}`,
          paddingBottom: 18,
        }}
      >
        <div
          style={{
            fontFamily: 'Heading',
            fontSize: 26,
            letterSpacing: 1,
            color: INK,
          }}
        >
          {BRAND}
        </div>
        <div
          style={{
            fontFamily: 'Heading',
            fontSize: 20,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: MUTED,
          }}
        >
          {KICKER}
        </div>
      </div>

      {/* The name is the point of the card */}
      <div
        style={{
          fontFamily: 'Heading',
          fontSize: name.length > 18 ? 96 : 128,
          lineHeight: 1,
          color: INK,
          textTransform: 'uppercase',
          marginTop: 44,
          display: 'flex',
        }}
      >
        {name}
      </div>

      {line ? (
        <div
          style={{
            fontFamily: 'Body',
            fontSize: 26,
            color: MUTED,
            marginTop: 18,
            display: 'flex',
          }}
        >
          {line}
        </div>
      ) : null}

      {/* Figures */}
      <div style={{ display: 'flex', gap: 96, marginTop: 'auto' }}>
        {stats.map((s) => (
          <Stat key={s.label} value={s.value} label={s.label} />
        ))}
      </div>

      {/* The one accent field — steel as ground, type reversed to paper */}
      <div
        style={{
          display: 'flex',
          marginTop: 40,
          background: STEEL_900,
          color: GROUND,
          padding: '14px 22px',
          fontFamily: 'Heading',
          fontSize: 20,
          letterSpacing: 2,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
        }}
      >
        {DOMAIN}
      </div>
    </div>,
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
