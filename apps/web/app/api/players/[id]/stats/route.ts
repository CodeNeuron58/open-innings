/**
 * GET /api/players/[id]/stats — a player's career record.
 *
 * Public on purpose. A career page is the shareable artifact — the thing that
 * gets pasted into a club WhatsApp group — so it must open for someone who has
 * never signed in and has no app. Everything it returns is already visible on
 * the public scorecard the same balls produced.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';
import { careerFor } from '@/lib/services/stats';
import { handle } from '@/lib/api/respond';

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const career = await careerFor(id);
  return NextResponse.json({ career }, { status: HTTP.ok });
});
