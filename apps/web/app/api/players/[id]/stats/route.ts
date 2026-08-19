/**
 * GET /api/players/[id]/stats
 * Public career record for sharing.
 */
import { NextResponse } from 'next/server';
import { HTTP, type PlayerCareerResponse } from '@open-innings/shared';
import { careerFor } from '@/lib/services/stats';
import { handle } from '@/lib/api/respond';

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const career = await careerFor(id);

  // Type checked against shared response; JSON.stringify handles Date to string conversion.
  const body: PlayerCareerResponse = {
    career: {
      ...career,
      form: career.form.map((f) => ({
        ...f,
        playedAt: f.playedAt ? f.playedAt.toISOString() : null,
      })),
    },
  };

  return NextResponse.json(body, { status: HTTP.ok });
});
