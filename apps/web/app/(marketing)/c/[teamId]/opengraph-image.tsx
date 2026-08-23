import { ImageResponse } from 'next/og';
import { clubPageFor } from '@/lib/services/club';

/**
 * The shareable club card — club record, squad size and leaders as an image.
 *
 * Designed to be linked in WhatsApp group descriptions, club bios, and social shares.
 * Renders via Satori in 1200x630 format.
 */

export const alt = 'Club profile on Open Innings';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#1d1f20';
const GROUND = '#f2f2f3';
const STEEL = '#5980a6';
const STEEL_900 = '#1d2d3d';
const DIVIDER = '#d4d4d7';
const MUTED = '#7a7a7d';

const BRAND = 'OPEN INNINGS';
const KICKER = 'Club profile';
const DOMAIN = 'openinnings.com';

async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
      `&text=${encodeURIComponent(text)}`;
    const css = await fetch(url, {
      headers: {
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

export default async function Image({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  let name = 'Club';
  let stats: { value: string; label: string }[] = [];
  let line = '';

  try {
    const club = await clubPageFor(teamId);
    name = club.team.name;

    const completed = club.results.filter((r) => r.status === 'completed');
    const won = completed.filter((r) => {
      if (!r.summary) return false;
      return r.summary.toLowerCase().startsWith(club.team.name.toLowerCase());
    }).length;

    stats = [
      { value: String(club.squad.length), label: 'Squad' },
      { value: String(completed.length), label: 'Played' },
      { value: String(won), label: 'Won' },
    ];

    if (club.leaders.runs) {
      stats.push({ value: String(club.leaders.runs.value), label: `Runs · ${club.leaders.runs.name.split(' ')[0]}` });
    } else if (club.leaders.wickets) {
      stats.push({ value: String(club.leaders.wickets.value), label: `Wkts · ${club.leaders.wickets.name.split(' ')[0]}` });
    }

    const parts: string[] = [];
    parts.push(`${club.squad.length} player${club.squad.length === 1 ? '' : 's'}`);
    if (completed.length > 0) {
      parts.push(`${completed.length} match${completed.length === 1 ? '' : 'es'} (${won} won)`);
    } else {
      parts.push('No matches scored yet');
    }
    line = parts.join('  ·  ');
  } catch {
    line = KICKER;
  }

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

      <div style={{ display: 'flex', gap: 64, marginTop: 'auto' }}>
        {stats.map((s) => (
          <Stat key={s.label} value={s.value} label={s.label} />
        ))}
      </div>

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
