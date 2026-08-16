import { ImageResponse } from 'next/og';
import { matchSummaryFor } from '@/lib/services/match-summary';

/**
 * The match share card.
 *
 * The other half of the growth loop. A finished match currently produces a
 * URL; this makes it produce a picture, which is what actually gets looked at
 * when it lands in a club WhatsApp group.
 *
 * Same convention and same constraints as the player card in
 * app/(marketing)/p/[playerId]/opengraph-image.tsx — Satori supports flexbox
 * only, and every multi-child element needs an explicit `display`.
 */

export const alt = 'Match scorecard on Open Innings';
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

/**
 * Fetches a Google font as raw bytes for Satori.
 *
 * The subset must cover every glyph the card renders, including the uppercase
 * forms of anything drawn through textTransform — a missing glyph silently
 * falls back to another face with different metrics, which reads as a layout
 * bug rather than a font one.
 */
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
    const href = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!href) return null;
    return await fetch(href).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;

  let heading = 'Match';
  let result = '';
  let lines: { team: string; score: string }[] = [];
  const performers: { label: string; value: string }[] = [];

  try {
    const s = await matchSummaryFor(matchId);

    lines = s.innings.map((i) => ({
      team: i.teamName,
      score: `${i.runs}-${i.wickets} (${i.overs})`,
    }));

    // Both sides named once the chase has opened; before that there is only
    // one innings and the match title is the best available label.
    const [first, second] = s.innings;
    heading =
      first && second
        ? `${first.teamName} v ${second.teamName}`
        : (s.title ?? first?.teamName ?? 'Match');

    // The result line is the server's own, so the card never invents a verdict
    // the scorecard would disagree with. A match still in progress has none.
    result = s.result ?? (s.status === 'completed' ? '' : 'In progress');

    if (s.topScorer) {
      performers.push({
        label: 'Top scorer',
        value: `${s.topScorer.name}  ${s.topScorer.primary}(${s.topScorer.secondary})`,
      });
    }
    if (s.bestBowler) {
      performers.push({
        label: 'Best bowling',
        value: `${s.bestBowler.name}  ${s.bestBowler.primary}-${s.bestBowler.secondary}`,
      });
    }
    /*
     * Player of the match only appears once the match is finished. Naming one
     * mid-innings would be wrong twice over: the game can still turn, and it
     * would read as a verdict when it is a computed heuristic. It is also
     * suppressed when it would just repeat the top scorer or best bowler
     * already shown beside it.
     */
    if (
      s.status === 'completed' &&
      s.playerOfTheMatch &&
      s.playerOfTheMatch.playerId !== s.topScorer?.playerId &&
      s.playerOfTheMatch.playerId !== s.bestBowler?.playerId
    ) {
      performers.push({
        label: 'Player of the match',
        value: `${s.playerOfTheMatch.name}  ${s.playerOfTheMatch.line}`,
      });
    }
  } catch {
    // A deleted match still returns branding rather than a broken image — the
    // link outlives the data and gets re-shared.
    result = 'Scorecard';
  }

  const drawn = [
    heading,
    result,
    ...lines.flatMap((l) => [l.team, l.score]),
    ...performers.flatMap((p) => [p.label, p.value]),
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
          {heading}
        </div>
      </div>

      {/* The scores, one line per innings — the thing people look for */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, gap: 14 }}>
        {lines.map((l) => (
          <div
            key={l.team}
            style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 46,
                textTransform: 'uppercase',
                color: INK,
                display: 'flex',
              }}
            >
              {l.team}
            </div>
            <div style={{ fontFamily: 'Heading', fontSize: 56, color: INK, display: 'flex' }}>
              {l.score}
            </div>
          </div>
        ))}
      </div>

      {result ? (
        <div
          style={{
            fontFamily: 'Body',
            fontSize: 28,
            color: STEEL,
            marginTop: 22,
            display: 'flex',
          }}
        >
          {result}
        </div>
      ) : null}

      {/* Performers */}
      <div style={{ display: 'flex', gap: 72, marginTop: 'auto' }}>
        {performers.map((p) => (
          <div key={p.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 18,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: STEEL,
              }}
            >
              {p.label}
            </div>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 34,
                color: INK,
                marginTop: 8,
                display: 'flex',
              }}
            >
              {p.value}
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
