/**
 * GET /api/matches/[id]/export?format=csv|json — the scorebook, as a file.
 *
 * This is a promise the app makes: "full export of your scorebook, any time"
 * is on the paywall's free-forever list, and a claim like that has to be
 * true before the screen making it ships.
 *
 * It is also the honest half of an AGPL project. Telling a club they can
 * self-host means nothing if their data is trapped in someone else's
 * database, so the export is the ball log — the actual source of truth,
 * one row per delivery, from which every figure in the app is derived.
 * Exporting the scorecard rather than the deliveries would export the
 * *conclusions* and leave the evidence behind.
 *
 * Public, like `/card` and `/summary`. Same information, different wrapping.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle } from '@/lib/api/respond';
import { matchCardFor } from '@/lib/services/match-summary';
import { invalid } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * One CSV field.
 *
 * Quotes everything rather than deciding per value. A player called
 * O'Brien, a venue with a comma in it, or a commentary note containing a
 * newline all break a naive writer, and the cost of quoting unconditionally
 * is a few bytes.
 */
function field(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

const COLUMNS = [
  'innings',
  'batting_team',
  'bowling_team',
  'over',
  'ball_in_over',
  'ball_in_innings',
  'batter',
  'bowler',
  'event',
  'runs_off_bat',
  'extra_runs',
  'total_runs',
  'legal_delivery',
  'wicket_type',
  'player_out',
  'fielder',
  'commentary',
] as const;

/** Which legal ball of the over this was — "19.2", not the array index. */
function ballInOver(
  deliveries: { overNumber: number; isLegalDelivery: boolean }[],
  index: number,
): number {
  const over = deliveries[index]?.overNumber;
  let legal = 0;
  for (let i = 0; i <= index; i++) {
    const d = deliveries[i];
    if (d && d.overNumber === over && d.isLegalDelivery) legal += 1;
  }
  // A wide before any legal ball still belongs to the ball it delays.
  return Math.max(legal, 1);
}

export const GET = handle(async (request: Request, ctx: RouteParams) => {
  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get('format') ?? 'csv';

  if (format !== 'csv' && format !== 'json') {
    throw invalid('format must be csv or json', 'format');
  }

  const card = await matchCardFor(id);

  // A filename someone can find again in a downloads folder six months later.
  const slug = (card.title ?? card.innings.map((i) => i.battingTeamName).join('-v-') ?? 'match')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const filename = `open-innings-${slug || 'match'}.${format}`;

  if (format === 'json') {
    return new NextResponse(JSON.stringify(card, null, 2), {
      status: HTTP.ok,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const rows: string[] = [COLUMNS.join(',')];
  for (const inn of card.innings) {
    inn.deliveries.forEach((d, i) => {
      rows.push(
        [
          field(inn.inningsNumber),
          field(inn.battingTeamName),
          field(inn.bowlingTeamName),
          // Overs are 0-indexed in the engine and 1-indexed to everyone else.
          field(d.overNumber + 1),
          field(ballInOver(inn.deliveries, i)),
          field(d.ballNumber),
          field(d.batsmanName),
          field(d.bowlerName),
          field(d.eventType),
          field(d.runsOffBat),
          field(d.extraRuns),
          field(d.totalRuns),
          field(d.isLegalDelivery),
          field(d.wicketType),
          field(d.outBatterName),
          field(d.fielderName),
          field(d.commentary),
        ].join(','),
      );
    });
  }

  return new NextResponse(
    // A BOM, so Excel opens UTF-8 correctly instead of mangling every name
    // with an accent in it. Every other reader ignores it.
    `﻿${rows.join('\r\n')}\r\n`,
    {
      status: HTTP.ok,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    },
  );
});
