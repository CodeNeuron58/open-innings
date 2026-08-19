/**
 * POST /api/notify
 * Subscribe email for notifications. Does not create an account or send email.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HTTP, emailSchema } from '@open-innings/shared';
import { db } from '@/lib/db/client';
import { notifySignups } from '@/lib/db/schema';
import { readJson, handle } from '@/lib/api/respond';
import { enforceRateLimit } from '@/lib/api/request-meta';

const notifySchema = z.object({
  // Uses permissive shared email schema, capped at RFC max (254) to prevent abuse.
  email: emailSchema.max(254),
  source: z.string().trim().max(64).optional(),
});

export const POST = handle(async (request: Request) => {
  // Generous rate limit (10/hr) per IP to support users behind CGNAT.
  enforceRateLimit(request, 'notify', { max: 10, windowMs: 60 * 60 * 1000 });

  // emailSchema lower-cases already, so the unique index does the deduping.
  const input = await readJson(request, notifySchema);

  // Ignore duplicates silently so endpoint can't be used to probe emails.
  await db
    .insert(notifySignups)
    .values({ email: input.email, source: input.source })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: HTTP.ok });
});
