/**
 * GET /api/matches/[id]/export?format=csv|json
 * Export the full scorebook and ball log.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { handle, assertId } from '@/lib/api/respond';
import { matchCardFor } from '@/lib/services/match-summary';
import { invalid } from '@/lib/services/errors';

type RouteParams = { params: Promise<{ id: string }> };

/** Leading characters that spreadsheet apps interpret as formulas. */
const FORMULA_LEAD = new Set(['=', '+', '-', '@']);

/**
 * Quotes field and prevents CSV injection by prefixing formula leads with an apostrophe.
 */
function field(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  // Prevent injection even if prefixed with whitespace.
  const safe = FORMULA_LEAD.has(raw.trimStart().charAt(0)) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
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
  'overthrow_runs',
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
  assertId(id);
  const format = new URL(request.url).searchParams.get('format') ?? 'csv';

  if (format !== 'csv' && format !== 'json') {
    throw invalid('format must be csv or json', 'format');
  }

  const card = await matchCardFor(id);

  // Slugify match title for filename.
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
          field(d.overthrowRuns ?? 0),
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
    // Include BOM for correct UTF-8 display in Excel.
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
