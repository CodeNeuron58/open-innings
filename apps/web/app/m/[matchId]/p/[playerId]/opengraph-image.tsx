import { ImageResponse } from 'next/og';
import { CARD, glyphsFor, loadCardFonts } from '@/lib/og/fonts';
import { playerCardContent } from '@/lib/og/player-card';

/**
 * One player's card for one match — "Rohit: 47(28), 3×4, 2×6". Landscape.
 *
 * The multiplier in the share loop. The match card is one post; this is
 * twenty-two, because everyone who played has something of their own to send.
 *
 * 1200×630 is the Open Graph size a *link* unfurls into. The square sibling at
 * `/m/[matchId]/p/[playerId]/square` is for sending as an image; both draw
 * `playerCardContent`.
 */

export const alt = 'Match performance on Open Innings';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const { ink: INK, ground: GROUND, steel: STEEL, steel900: STEEL_900 } = CARD;
const { divider: DIVIDER, muted: MUTED, brand: BRAND, domain: DOMAIN } = CARD;

export default async function Image({
  params,
}: {
  params: Promise<{ matchId: string; playerId: string }>;
}) {
  const { matchId, playerId } = await params;

  const { name, fixture, headline, stats } = await playerCardContent(matchId, playerId);

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
