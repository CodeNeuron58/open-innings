import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Blueprint } from '@/components/marketing/blueprint';
import { careerFor, type PlayerCareer } from '@/lib/services/stats';
import { ServiceError } from '@/lib/services/errors';

/**
 * A player's permanent public page — the cricket CV.
 *
 * Deliberately inside the (marketing) group rather than beside the scorecard:
 * this is the artifact that gets pasted into a club WhatsApp group, so whoever
 * opens it should land on the site with its nav and footer and be one tap from
 * the app. That is the growth loop, not a detail of file layout.
 *
 * Public, unauthenticated, and computed from the same ball log the scorecard
 * replays — see lib/db/stats.ts. Nothing here is stored, so correcting a ball
 * corrects the career.
 */

type Params = { params: Promise<{ playerId: string }> };

async function load(playerId: string): Promise<PlayerCareer> {
  try {
    return await careerFor(playerId);
  } catch (err) {
    // A missing player is a 404, not a 500 — this URL gets shared, and a
    // stale link should say "not found" rather than "something broke".
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { playerId } = await params;
  try {
    const { player, batting, bowling } = await careerFor(playerId);
    // The description is what appears under the link in a WhatsApp preview,
    // so it carries the numbers rather than a generic blurb.
    const bits: string[] = [];
    if (batting.innings > 0) {
      bits.push(
        `${batting.runs} runs${batting.average !== null ? ` at ${batting.average.toFixed(1)}` : ''}`,
      );
    }
    if (bowling.wickets > 0) bits.push(`${bowling.wickets} wickets`);
    return {
      title: player.fullName,
      description: bits.length
        ? `${player.fullName} — ${bits.join(', ')}. Career record on Open Innings.`
        : `${player.fullName}'s career record on Open Innings.`,
    };
  } catch {
    return { title: 'Player' };
  }
}

/** A figure and its label, in the spec-sheet grammar. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="num oi-figure">{value}</div>
      <div className="oi-kick oi-figure-label">{label}</div>
    </div>
  );
}

function n(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

export default async function PlayerPage({ params }: Params) {
  const { playerId } = await params;
  const career = await load(playerId);
  const { player, batting, bowling, fielding, form, milestones, season } = career;

  const hasPlayed = batting.innings > 0 || bowling.innings > 0;

  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Player</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub">{player.fullName}</h1>

          {milestones.length > 0 ? (
            <div className="oi-tag-row">
              {milestones.map((m) => (
                <span className="tag tag-accent" key={m.label}>
                  {m.label}
                  {/* When, not just what — "eighth fifty, 2 matches ago" says
                      a player is in form; "8 fifties" says only that they
                      have been around. */}
                  <span className="oi-dim">
                    {' · '}
                    {m.matchesAgo === 0 ? 'last match' : `${m.matchesAgo} ago`}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {!hasPlayed ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <Blueprint className="oi-card oi-measure">
              <span className="oi-kick">No innings yet</span>
              <p className="oi-card-body oi-dim">
                This player hasn&rsquo;t batted or bowled in a scored match. The record fills itself
                in as matches are scored — nothing here is entered by hand.
              </p>
            </Blueprint>
          </div>
        </section>
      ) : null}

      {/*
        This season comes before the career on purpose. A career average is a
        slow number that barely moves; this season's is the one being argued
        about in the group chat, so it is what someone opened the page for.
      */}
      {season ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">This season — {season.label}</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-figures">
              {season.batting.innings > 0 ? (
                <>
                  <Figure value={String(season.batting.runs)} label="Runs" />
                  <Figure value={n(season.batting.average)} label="Average" />
                  <Figure
                    value={`${season.batting.highScore}${season.batting.highScoreNotOut ? '*' : ''}`}
                    label="High score"
                  />
                </>
              ) : null}
              {season.bowling.wickets > 0 ? (
                <>
                  <Figure value={String(season.bowling.wickets)} label="Wickets" />
                  <Figure value={n(season.bowling.economy)} label="Economy" />
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {batting.innings > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">{season ? 'Batting — career' : 'Batting'}</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-figures">
              <Figure value={String(batting.runs)} label="Runs" />
              <Figure
                value={`${batting.highScore}${batting.highScoreNotOut ? '*' : ''}`}
                label="High score"
              />
              <Figure value={n(batting.average)} label="Average" />
              <Figure value={n(batting.strikeRate, 1)} label="Strike rate" />
              <Figure value={String(batting.innings)} label="Innings" />
            </div>

            <Blueprint className="oi-stat-plate">
              <table className="oi-cmp-table table">
                <tbody>
                  <tr>
                    <td className="oi-cmp-feature">Not outs</td>
                    <td className="num oi-cmp-cell">{batting.notOuts}</td>
                    <td className="oi-cmp-feature">Balls faced</td>
                    <td className="num oi-cmp-cell">{batting.balls}</td>
                  </tr>
                  <tr>
                    <td className="oi-cmp-feature">Fours</td>
                    <td className="num oi-cmp-cell">{batting.fours}</td>
                    <td className="oi-cmp-feature">Sixes</td>
                    <td className="num oi-cmp-cell">{batting.sixes}</td>
                  </tr>
                  <tr>
                    <td className="oi-cmp-feature">Fifties</td>
                    <td className="num oi-cmp-cell">{batting.fifties}</td>
                    <td className="oi-cmp-feature">Hundreds</td>
                    <td className="num oi-cmp-cell">{batting.hundreds}</td>
                  </tr>
                </tbody>
              </table>
            </Blueprint>
          </div>
        </section>
      ) : null}

      {form.length > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">Form — last {form.length}</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-form-row">
              {form.map((f, i) => (
                <Blueprint className="oi-form-card" key={`${f.matchId}-${i}`}>
                  <div className="num oi-form-runs">
                    {f.runs}
                    {f.notOut ? '*' : ''}
                  </div>
                  <div className="num oi-form-balls">({f.balls})</div>
                  {f.opponent ? <div className="oi-form-opp">v {f.opponent}</div> : null}
                </Blueprint>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {bowling.innings > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">{season ? 'Bowling — career' : 'Bowling'}</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-figures">
              <Figure value={String(bowling.wickets)} label="Wickets" />
              <Figure
                value={bowling.bestWickets > 0 ? `${bowling.bestWickets}-${bowling.bestRuns}` : '—'}
                label="Best figures"
              />
              <Figure value={n(bowling.average)} label="Average" />
              <Figure value={n(bowling.economy)} label="Economy" />
              <Figure value={n(bowling.strikeRate, 1)} label="Strike rate" />
            </div>
          </div>
        </section>
      ) : null}

      {fielding.catches + fielding.runOuts + fielding.stumpings > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">Fielding</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-figures">
              <Figure value={String(fielding.catches)} label="Catches" />
              <Figure value={String(fielding.runOuts)} label="Run outs" />
              <Figure value={String(fielding.stumpings)} label="Stumpings" />
            </div>
          </div>
        </section>
      ) : null}

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <p className="oi-sheet-foot oi-record-note">
            Every figure here is computed from the ball log, not entered by hand — so correcting a
            ball corrects the record.
          </p>
        </div>
      </section>
    </>
  );
}
