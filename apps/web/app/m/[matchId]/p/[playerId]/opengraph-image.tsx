import { ImageResponse } from 'next/og';
import { playerMatchLineFor } from '@/lib/services/match-summary';

/**
 * One player's card for one match — "Rohit: 47(28), 3×4, 2×6".
 *
 * The multiplier in the share loop. The match card is one post; this is
 * twenty-two, because everyone who played has something of their own to send.
 */

export const alt = 'Match performance on Open Innings';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#1d1f20';
const GROUND = '#f2f2f3';
const STEEL = '#5980a6';
const STEEL_900 = '#1d2d3d';
const DIVIDER = '#d4d4d7';
const MUTED = '#7a7a7d';

const BRAND = 'OPEN INNINGS';
const DOMAIN = 'openinnings.com';

async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
      `&text=${encodeURIComponent(text)}`;
    const css = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:1.0) Gecko/20100101 Firefox/1.0' },
    }).then((r) => r.text());
    const href = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!href) return null;
    return await fetch(href).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ matchId: string; playerId: string }>;
}) {
  const { matchId, playerId } = await params;

  let name = 'Player';
  let fixture = '';
  let headline = '';
  const stats: { value: string; label: string }[] = [];

  try {
    const p = await playerMatchLineFor(matchId, playerId);
    name = p.name;
    fixture = p.fixture ?? '';
    headline = p.line;

    if (p.batting) {
      stats.push({
        value: `${p.batting.runs}${p.batting.notOut ? '*' : ''}`,
        label: `off ${p.batting.balls}`,
      });
      if (p.batting.fours + p.batting.sixes > 0) {
        stats.push({ value: `${p.batting.fours}×4  ${p.batting.sixes}×6`, label: 'Boundaries' });
      }
      if (p.batting.strikeRate !== null) {
        stats.push({ value: p.batting.strikeRate.toFixed(0), label: 'Strike rate' });
      }
    }
    if (p.bowling && p.bowling.wickets > 0) {
      stats.push({ value: `${p.bowling.wickets}-${p.bowling.runs}`, label: 'Bowling' });
    }
  } catch {
    headline = 'Match performance';
  }

  const drawn = [
    name,
    fixture,
    headline,
    ...stats.flatMap((s) => [s.value, s.label]),
    BRAND,
    DOMAIN,
  ];
  const glyphs = drawn.map((s) => s + s.toUpperCase()).join('');

  const [head, body] = await Promise.all([
    loadFont('Barlow Condensed', 600, glyphs),
    loadFont('Barlow', 400, glyphs),
  ]);
  const fonts = [
    head && { name: 'Heading', data: head, weight: 600 as const, style: 'normal' as const },
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
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${DIVIDER}`,
          paddingBottom: 18,
        }}
      >
        <div style={{ fontFamily: 'Heading', fontSize: 26, letterSpacing: 1, color: INK }}>
          {BRAND}
        </div>
        {fixture ? (
          <div
            style={{
              fontFamily: 'Heading',
              fontSize: 20,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: MUTED,
              display: 'flex',
            }}
          >
            {fixture}
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontFamily: 'Heading',
          fontSize: name.length > 18 ? 84 : 110,
          lineHeight: 1,
          color: INK,
          textTransform: 'uppercase',
          marginTop: 44,
          display: 'flex',
        }}
      >
        {name}
      </div>

      {/* The line itself, big — it is the whole message */}
      <div
        style={{
          fontFamily: 'Heading',
          fontSize: 64,
          color: STEEL,
          marginTop: 16,
          display: 'flex',
        }}
      >
        {headline}
      </div>

      <div style={{ display: 'flex', gap: 72, marginTop: 'auto' }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'Heading', fontSize: 46, color: INK, lineHeight: 1 }}>
              {s.value}
            </div>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 18,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: STEEL,
                marginTop: 8,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 34,
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
