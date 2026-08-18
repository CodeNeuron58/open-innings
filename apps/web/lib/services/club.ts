/**
 * A club's public home — squad, results, and who leads it.
 *
 * The permanent URL a club links to from a WhatsApp group or an Instagram
 * bio. Public and read-only, like every other share surface.
 */
import 'server-only';
import { sql } from 'drizzle-orm';
import { BOWLER_CREDITED_WICKETS } from '@open-innings/scoring';
import { db } from '@/lib/db/client';
import { notFaced } from '@/lib/db/stats';
import { getTeam, getTeamMembers } from '@/lib/db/queries';
import { notFound } from './errors';

export type ClubResult = {
  matchId: string;
  playedAt: Date | null;
  opponent: string | null;
  status: string;
  summary: string | null;
};

export type ClubMember = {
  id: string;
  fullName: string;
  role: string | null;
  /** Per-squad, not per-person — see SquadMember in lib/db/queries. */
  isCaptain: boolean;
  isWicketkeeper: boolean;
};

export type ClubLeader = { playerId: string; name: string; value: number };

export type ClubPage = {
  team: { id: string; name: string };
  squad: ClubMember[];
  results: ClubResult[];
  /**
   * Leading run-scorer and wicket-taker among current squad members.
   *
   * These are **career** figures, not club-only. Attributing a run to a club
   * would mean knowing which side a player turned out for in each innings,
   * and a player can appear for more than one club — so rather than quietly
   * getting that wrong, the page says "career" on the label.
   */
  leaders: {
    runs: ClubLeader | null;
    wickets: ClubLeader | null;
    /** Career strike rate, over a minimum of balls faced — see the query. */
    strikeRate: ClubLeader | null;
    catches: ClubLeader | null;
  };
};

/**
 * Balls faced before a strike rate means anything.
 *
 * Without a floor this table is always won by whoever hit a six off their
 * only delivery — a strike rate of 600 that describes nothing. Fifty is low
 * enough that a club season qualifies several people and high enough that one
 * over cannot top it.
 */
const MIN_BALLS_FOR_STRIKE_RATE = 50;

export async function clubPageFor(teamId: string): Promise<ClubPage> {
  const team = await getTeam(teamId);
  if (!team) throw notFound('Club not found');

  const members = await getTeamMembers(teamId);

  // Matches this club played, either side, newest first.
  const resultRows = await db.execute<{
    id: string;
    played_at: string | Date | null;
    status: string;
    summary: string | null;
    opponent: string | null;
  }>(sql`
    select
      m.id,
      coalesce(m.completed_at, m.started_at, m.scheduled_at, m.created_at) as played_at,
      m.status,
      m.summary,
      case when m.team_a_id = ${teamId}::uuid then tb.name else ta.name end as opponent
    from matches m
    left join teams ta on ta.id = m.team_a_id
    left join teams tb on tb.id = m.team_b_id
    where m.team_a_id = ${teamId}::uuid or m.team_b_id = ${teamId}::uuid
    order by played_at desc nulls last
    limit 10
  `);

  const memberIds = members.map((m) => m.id);

  let leaders: ClubPage['leaders'] = {
    runs: null,
    wickets: null,
    strikeRate: null,
    catches: null,
  };

  if (memberIds.length > 0) {
    const ids = sql.join(
      memberIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const credited = sql.join(
      [...BOWLER_CREDITED_WICKETS].map((w) => sql`${w}`),
      sql`, `,
    );

    const [topRuns] = await db.execute<{ player_id: string; full_name: string; runs: number }>(sql`
      select be.batsman_id as player_id, p.full_name, coalesce(sum(be.runs_off_bat), 0)::int as runs
      from ball_events be
      join players p on p.id = be.batsman_id
      where be.batsman_id in (${ids})
      group by be.batsman_id, p.full_name
      order by runs desc
      limit 1
    `);

    const [topWickets] = await db.execute<{
      player_id: string;
      full_name: string;
      wickets: number;
    }>(sql`
      select be.bowler_id as player_id, p.full_name,
             count(*) filter (where be.wicket_type in (${credited}))::int as wickets
      from ball_events be
      join players p on p.id = be.bowler_id
      where be.bowler_id in (${ids})
      group by be.bowler_id, p.full_name
      order by wickets desc
      limit 1
    `);

    /*
     * Best strike rate, with a floor on balls faced.
     *
     * Without one this is always won by whoever hit a six off their only
     * delivery — a strike rate of 600 that describes nothing. Fifty balls is
     * low enough that a club season qualifies several people and high enough
     * that one over cannot top the table.
     *
     * Balls faced is every delivery except a wide, and the set comes from the
     * engine — the same import `battingInningsFor` and `careerBriefsFor` use.
     * This divided by `is_legal_delivery` instead, which is a different
     * question: a no-ball is not a legal delivery but the batter certainly
     * faced it. So the denominator here was smaller than the one on the career
     * page, and the same player showed one strike rate on /p/<id> and a higher
     * one on /c/<id> with nothing to explain the difference.
     */
    const [topStrikeRate] = await db.execute<{
      player_id: string;
      full_name: string;
      strike_rate: number;
    }>(sql`
      select be.batsman_id as player_id, p.full_name,
             round(
               (coalesce(sum(be.runs_off_bat), 0)::numeric
                / nullif(count(*) filter (where be.event_type not in (${notFaced})), 0)) * 100
             )::int as strike_rate
      from ball_events be
      join players p on p.id = be.batsman_id
      where be.batsman_id in (${ids})
      group by be.batsman_id, p.full_name
      having count(*) filter (where be.event_type not in (${notFaced})) >= ${MIN_BALLS_FOR_STRIKE_RATE}
      order by strike_rate desc
      limit 1
    `);

    /*
     * Most catches.
     *
     * `fielder_id` is set for catches, stumpings and run-outs alike, so the
     * wicket type has to be filtered — otherwise this ranks "dismissals a
     * fielder was involved in", which is a different and less interesting
     * statistic.
     */
    const [topCatches] = await db.execute<{
      player_id: string;
      full_name: string;
      catches: number;
    }>(sql`
      select be.fielder_id as player_id, p.full_name,
             count(*)::int as catches
      from ball_events be
      join players p on p.id = be.fielder_id
      where be.fielder_id in (${ids})
        and be.wicket_type in ('caught', 'caught_behind')
      group by be.fielder_id, p.full_name
      order by catches desc
      limit 1
    `);

    // A zero is not a leader — a club nobody has scored for has no leading
    // run-scorer, and printing someone's name against 0 is worse than a gap.
    const leader = (
      row: { player_id: string; full_name: string } | undefined,
      value: number | undefined,
    ) =>
      row && Number(value) > 0
        ? { playerId: row.player_id, name: row.full_name, value: Number(value) }
        : null;

    leaders = {
      runs: leader(topRuns, topRuns?.runs),
      wickets: leader(topWickets, topWickets?.wickets),
      strikeRate: leader(topStrikeRate, topStrikeRate?.strike_rate),
      catches: leader(topCatches, topCatches?.catches),
    };
  }

  return {
    team: { id: team.id, name: team.name },
    squad: members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      role: m.role ?? null,
      isCaptain: m.isCaptain,
      isWicketkeeper: m.isWicketkeeper,
    })),
    results: resultRows.map((r) => ({
      matchId: r.id,
      playedAt: r.played_at ? new Date(r.played_at) : null,
      opponent: r.opponent,
      status: r.status,
      summary: r.summary,
    })),
    leaders,
  };
}
