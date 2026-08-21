import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';
import { clubPageFor } from '@/lib/services/club';
import { ServiceError } from '@/lib/services/errors';
import { isId } from '@open-innings/shared';

/**
 * A club's permanent public home.
 *
 * The URL a club puts in its WhatsApp group description and its Instagram
 * bio, so it has to be stable, public, and worth landing on. In the marketing
 * group for the same reason the player page is: someone arriving from a link
 * should see the site and be one tap from the app.
 */

type Params = { params: Promise<{ teamId: string }> };

async function load(teamId: string) {
  /*
   * A malformed id is not found, not a fault.
   *
   * The catch below only converts a ServiceError 404. Anything else rethrows —
   * and an id that is not a uuid reaches Postgres as one, raises `22P02
   * invalid input syntax for type uuid`, and became a 500 on a URL built to
   * be shared. A truncated or mistyped link showed "something broke" instead
   * of "not found", and logged a fault that was not one.
   *
   * Checked here rather than caught: catching everything would also turn a
   * real outage into "not found", which is a worse answer than a 500.
   */
  if (!isId(teamId)) notFound();

  try {
    return await clubPageFor(teamId);
  } catch (err) {
    if (err instanceof ServiceError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { teamId } = await params;
  try {
    const { team, squad } = await load(teamId);
    return {
      title: team.name,
      description: `${team.name} — squad of ${squad.length}, results and records on Open Innings.`,
    };
  } catch {
    return { title: 'Club' };
  }
}

function when(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ClubPage({ params }: Params) {
  const { teamId } = await params;
  const { team, squad, results, leaders } = await load(teamId);

  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Club</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub">{team.name}</h1>
          <p className="oi-lede oi-lede-wide">
            {squad.length} in the squad {' · '} {results.length} match
            {results.length === 1 ? '' : 'es'} on record. Every figure below is computed from balls
            actually scored.
          </p>
        </div>
      </section>

      {leaders.runs || leaders.wickets ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            {/* Labelled "career" deliberately — see the note in lib/services/club.ts */}
            <span className="oi-kick">Leading the squad — career</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-figures">
              {leaders.runs ? (
                <div>
                  <div className="num oi-figure">{leaders.runs.value}</div>
                  <div className="oi-kick oi-figure-label">Runs — {leaders.runs.name}</div>
                </div>
              ) : null}
              {leaders.wickets ? (
                <div>
                  <div className="num oi-figure">{leaders.wickets.value}</div>
                  <div className="oi-kick oi-figure-label">Wickets — {leaders.wickets.name}</div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">Results</span>
            <hr className="oi-rule oi-rule-md" />
            <Blueprint>
              <table className="oi-cmp-table table">
                <tbody>
                  {results.map((r) => (
                    <tr key={r.matchId}>
                      <td className="oi-cmp-feature">
                        <Link href={`/m/${r.matchId}`}>
                          {r.opponent ? `v ${r.opponent}` : 'Match'}
                        </Link>
                      </td>
                      <td className="num oi-club-date">{when(r.playedAt)}</td>
                      <td className="oi-club-summary">
                        {r.summary ?? (r.status === 'live' ? 'In progress' : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Blueprint>
          </div>
        </section>
      ) : null}

      {squad.length > 0 ? (
        <section className="oi-sec oi-sec-pad-xl">
          <div className="oi-in">
            <span className="oi-kick">Squad</span>
            <hr className="oi-rule oi-rule-md" />
            <div className="oi-3">
              {squad.map((p) => (
                <BlueprintLink key={p.id} href={`/p/${p.id}`} className="oi-card oi-card-link">
                  <h2 className="oi-h2 oi-h3">{p.fullName}</h2>
                  {p.role ? (
                    <p className="oi-card-body oi-dim">{p.role.replace(/_/g, ' ')}</p>
                  ) : null}
                  <span className="oi-card-cta">Career record ›</span>
                </BlueprintLink>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
