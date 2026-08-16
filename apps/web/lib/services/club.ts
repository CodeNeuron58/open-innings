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
  leaders: { runs: ClubLeader | null; wickets: ClubLeader | null };
};

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

  let leaders: ClubPage['leaders'] = { runs: null, wickets: null };

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

    leaders = {
      // A zero is not a leader — a club nobody has scored for has no leading
      // run-scorer, and printing someone's name against 0 is worse than a gap.
      runs:
        topRuns && Number(topRuns.runs) > 0
          ? { playerId: topRuns.player_id, name: topRuns.full_name, value: Number(topRuns.runs) }
          : null,
      wickets:
        topWickets && Number(topWickets.wickets) > 0
          ? {
              playerId: topWickets.player_id,
              name: topWickets.full_name,
              value: Number(topWickets.wickets),
            }
          : null,
    };
  }

  return {
    team: { id: team.id, name: team.name },
    squad: members.map((m) => ({ id: m.id, fullName: m.fullName, role: m.role ?? null })),
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
