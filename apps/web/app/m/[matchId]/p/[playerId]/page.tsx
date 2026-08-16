import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { playerMatchLineFor } from '@/lib/services/match-summary';
import { ServiceError } from '@/lib/services/errors';

/**
 * One player's performance in one match.
 *
 * A match produces one shareable artifact but involved twenty-two people who
 * each did something different. This gives each of them their own, so a single
 * match yields twenty-two posts rather than one — the arithmetic behind the
 * share loop in FEATURES.md.
 *
 * The page itself is deliberately thin: its real payload is the Open Graph
 * card next door, because what gets sent is a picture, not a URL.
 */

type Params = { params: Promise<{ matchId: string; playerId: string }> };

async function load(matchId: string, playerId: string) {
  try {
    return await playerMatchLineFor(matchId, playerId);
  } catch (err) {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { matchId, playerId } = await params;
  try {
    const p = await load(matchId, playerId);
    return {
      title: `${p.name} — ${p.line}`,
      description: p.fixture ? `${p.name}: ${p.line} — ${p.fixture}` : `${p.name}: ${p.line}`,
    };
  } catch {
    return { title: 'Performance' };
  }
}

export default async function PlayerMatchPage({ params }: Params) {
  const { matchId, playerId } = await params;
  const p = await load(matchId, playerId);

  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">{p.fixture ?? 'Match'}</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub">{p.name}</h1>
          <p className="oi-lede oi-lede-wide">{p.line}</p>

          <div className="oi-figures oi-figures-lg">
            {p.batting ? (
              <>
                <div>
                  <div className="num oi-figure">
                    {p.batting.runs}
                    {p.batting.notOut ? '*' : ''}
                  </div>
                  <div className="oi-kick oi-figure-label">Runs</div>
                </div>
                <div>
                  <div className="num oi-figure">{p.batting.balls}</div>
                  <div className="oi-kick oi-figure-label">Balls</div>
                </div>
                <div>
                  <div className="num oi-figure">
                    {p.batting.fours}/{p.batting.sixes}
                  </div>
                  <div className="oi-kick oi-figure-label">4s / 6s</div>
                </div>
              </>
            ) : null}
            {p.bowling ? (
              <>
                <div>
                  <div className="num oi-figure">
                    {p.bowling.wickets}-{p.bowling.runs}
                  </div>
                  <div className="oi-kick oi-figure-label">Figures</div>
                </div>
                <div>
                  <div className="num oi-figure">
                    {p.bowling.economy === null ? '—' : p.bowling.economy.toFixed(2)}
                  </div>
                  <div className="oi-kick oi-figure-label">Economy</div>
                </div>
              </>
            ) : null}
          </div>

          {p.result ? <p className="oi-body oi-dim-strong">{p.result}</p> : null}

          <div className="oi-cta-row oi-cta-row-lg">
            <Link className="btn btn-secondary oi-btn-md oi-btn-plain" href={`/m/${p.matchId}`}>
              Full scorecard
            </Link>
            <Link className="btn btn-secondary oi-btn-md oi-btn-plain" href={`/p/${p.playerId}`}>
              Career record
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
