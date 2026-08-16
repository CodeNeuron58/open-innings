/**
 * POST /api/notify — "tell me when it's out".
 *
 * The landing page has had this form since it was designed and it submitted
 * nowhere, which is worse than not asking: it collects addresses into the void
 * and teaches the one person who tried that the site does not work.
 *
 * What it deliberately does **not** do: create an account. Leaving an address
 * on a landing page is not signing up, and quietly turning one into the other
 * is how a mailing list becomes a data-protection problem.
 *
 * There is no mail sending here and none is implied. The list is a list; when
 * there is something to say, it gets exported and said. The copy on the page
 * promises release notes, not a welcome email, and that stays true.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HTTP, emailSchema } from '@open-innings/shared';
import { db } from '@/lib/db/client';
import { notifySignups } from '@/lib/db/schema';
import { readJson, handle } from '@/lib/api/respond';
import { enforceRateLimit } from '@/lib/api/request-meta';

const notifySchema = z.object({
  /*
   * The shared rule, not a stricter one invented here.
   *
   * `emailSchema` is deliberately permissive — an `@` and no whitespace —
   * because deliverability is proven by sending mail, not by a regex, and a
   * tighter pattern rejects the single-label hostnames every dev seed uses.
   * A second, stricter definition on this one route would mean an address
   * that can sign up but cannot ask to be notified.
   *
   * Capped at 254 (the RFC maximum) because the column is unbounded text and
   * an unbounded field on an unauthenticated endpoint is a way to write
   * megabytes into a table for free.
   */
  email: emailSchema.max(254),
  source: z.string().trim().max(64).optional(),
});

export const POST = handle(async (request: Request) => {
  /*
   * Loose, and keyed by IP.
   *
   * Indian mobile carriers run CGNAT, so thousands of unrelated people share
   * an address — a tight cap here would lock out a real club rather than an
   * attacker. Ten an hour still stops a script filling the table.
   */
  enforceRateLimit(request, 'notify', { max: 10, windowMs: 60 * 60 * 1000 });

  // emailSchema lower-cases already, so the unique index does the deduping.
  const input = await readJson(request, notifySchema);

  /*
   * A second submission is not an error.
   *
   * People tap twice, or come back a month later having forgotten. The honest
   * response to that is "yes, you're on the list" — and `onConflictDoNothing`
   * means the reply is identical either way, so this endpoint cannot be used
   * to discover whether a given address is already registered.
   */
  await db
    .insert(notifySignups)
    .values({ email: input.email, source: input.source })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: HTTP.ok });
});
