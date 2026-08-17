/**
 * The match share card, square.
 *
 * 1080 × 1080, for sending *as an image* — a WhatsApp status, an Instagram
 * post, a group chat where the picture is the message. Its landscape sibling
 * at `opengraph-image` is the 1200×630 an Open Graph link unfurls into, and
 * the two are genuinely different jobs: a status crops a landscape card to a
 * strip, and a link preview letterboxes a square one.
 *
 * Not another `opengraph-image`, because Next allows one per route and this is
 * not the link preview. A plain route handler returning an ImageResponse.
 *
 * Both cards draw `matchCardContent`, so neither can name a different player
 * of the match than the other.
 *
 * Satori supports flexbox only, and every multi-child element needs an
 * explicit `display`.
 */
import { ImageResponse } from 'next/og';
import { CARD, glyphsFor, loadCardFonts } from '@/lib/og/fonts';
import { matchCardContent } from '@/lib/og/match-card';

const { ink: INK, ground: GROUND, steel: STEEL, steel900: STEEL_900 } = CARD;
const { divider: DIVIDER, muted: MUTED, brand: BRAND, domain: DOMAIN } = CARD;

const SIZE = 1080;

export async function GET(_request: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  const { heading, result, lines, performers } = await matchCardContent(matchId);

  const fonts = await loadCardFonts(
    glyphsFor([
      heading,
      result,
      ...lines.flatMap((l) => [l.team, l.score]),
      ...performers.flatMap((p) => [p.label, p.value]),
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
          {heading}
        </div>
      </div>

      {/*
          The scores get the extra height a square gives, stacked rather than
          balanced across a wide frame. On a phone-sized status this is the
          only part anyone actually reads.
        */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 72, gap: 26 }}>
        {lines.map((l) => (
          <div key={l.team} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 46,
                textTransform: 'uppercase',
                color: MUTED,
                display: 'flex',
              }}
            >
              {l.team}
            </div>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 92,
                lineHeight: 1,
                color: INK,
                display: 'flex',
              }}
            >
              {l.score}
            </div>
          </div>
        ))}
      </div>

      {result ? (
        <div
          style={{
            fontFamily: 'Body',
            fontSize: 38,
            color: STEEL,
            marginTop: 36,
            display: 'flex',
          }}
        >
          {result}
        </div>
      ) : null}

      {/*
        Stacked, not in a row — a square has the height for it, and one per
        line survives being viewed at thumbnail size.

        Not bottom-anchored: a match still being played has one innings line
        and often one performer, so anchoring left a third of the frame as a
        hole in the middle. That is not an edge case — it is every card shared
        *during* a match, which is when a link is worth sending. The badge
        takes the slack instead.
      */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 64 }}>
        {performers.map((p) => (
          <div key={p.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'Heading',
                fontSize: 20,
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
                fontSize: 42,
                color: INK,
                marginTop: 6,
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
        // Shared links get re-fetched by every chat app that sees them, and
        // the score changes while a match is live. An hour is long enough to
        // absorb a burst and short enough that a finished match settles.
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  );
}
