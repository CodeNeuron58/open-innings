/**
 * One player's card for one match, square.
 *
 * 1080 × 1080, for sending *as an image* — which is the form this card is
 * most often sent in. A player forwarding their own figures puts them on a
 * status, not in a link preview, and a landscape card gets cropped to a strip
 * there.
 *
 * Its landscape sibling at `opengraph-image` is what a link unfurls into.
 * Both draw `playerCardContent`, so neither can show a different strike rate
 * than the other.
 *
 * Satori supports flexbox only, and every multi-child element needs an
 * explicit `display`.
 */
import { ImageResponse } from 'next/og';
import { CARD, glyphsFor, loadCardFonts } from '@/lib/og/fonts';
import { playerCardContent } from '@/lib/og/player-card';

const { ink: INK, ground: GROUND, steel: STEEL, steel900: STEEL_900 } = CARD;
const { divider: DIVIDER, muted: MUTED, brand: BRAND, domain: DOMAIN } = CARD;

const SIZE = 1080;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ matchId: string; playerId: string }> },
) {
  const { matchId, playerId } = await ctx.params;
  const { name, fixture, headline, stats, isDone } = await playerCardContent(matchId, playerId);

  const fonts = await loadCardFonts(
    glyphsFor([
      name,
      fixture,
      headline,
      ...stats.flatMap((v) => [v.value, v.label]),
      BRAND,
      DOMAIN,
    ]),
  );

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: GROUND,
        padding: 76,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${DIVIDER}`,
          paddingBottom: 22,
        }}
      >
        <div style={{ fontFamily: 'Heading', fontSize: 30, letterSpacing: 1, color: INK }}>
          {BRAND}
        </div>
        {fixture ? (
          <div
            style={{
              fontFamily: 'Heading',
              fontSize: 22,
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

      {/*
          The name takes the whole width a square gives it. This card is
          usually looked at by the person whose name that is.
        */}
      <div
        style={{
          fontFamily: 'Heading',
          fontSize: 104,
          lineHeight: 1,
          textTransform: 'uppercase',
          color: INK,
          marginTop: 78,
          display: 'flex',
        }}
      >
        {name}
      </div>

      <div
        style={{
          fontFamily: 'Heading',
          fontSize: 62,
          color: STEEL,
          marginTop: 16,
          display: 'flex',
        }}
      >
        {headline}
      </div>

      {/*
          Wrapped rather than in one row — four figures across a square get
          small enough to lose at thumbnail size.

          Not bottom-anchored: a sparse card (a bowler who did not bat, a
          batter out for 5) would then have a third of the frame as empty
          space above it, which reads as a rendering failure rather than a
          quiet innings. The badge takes the slack instead.
        */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 56,
          marginTop: 72,
        }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'Heading', fontSize: 60, color: INK, display: 'flex' }}>
              {s.value}
            </div>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 20,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: STEEL,
                marginTop: 6,
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
          marginTop: 'auto',
          background: STEEL_900,
          color: GROUND,
          padding: '18px 26px',
          fontFamily: 'Heading',
          fontSize: 24,
          letterSpacing: 2,
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
        }}
      >
        {DOMAIN}
      </div>
    </div>,
    {
      width: SIZE,
      height: SIZE,
      fonts,
      headers: {
        // Dynamic caching: live matches are never stale, completed matches are cached long-term.
        'Cache-Control': isDone
          ? 'public, max-age=86400, s-maxage=86400'
          : 'no-cache, no-store, must-revalidate',
      },
    },
  );
}
