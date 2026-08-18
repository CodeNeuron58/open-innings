/**
 * POST /api/auth/verify — send (or resend) a confirmation link.
 * PUT  /api/auth/verify — spend one.
 *
 * Two verbs on one path rather than two paths, because they are two halves of
 * one thing and the pairing is easier to hold in your head than
 * `/verify/send` and `/verify/confirm`.
 *
 * POST needs a session: it confirms *your* address, and the address comes from
 * the account rather than the body, so there is nothing to send it to
 * otherwise. PUT does not: whoever holds the link is the person being proven,
 * and requiring them to be signed in first would break the case the flow
 * exists for — opening the mail on a different device.
 */
import { NextResponse } from 'next/server';
import { confirmEmailSchema, HTTP } from '@open-innings/shared';
import { confirmEmail, sendVerificationEmail, canSendMail } from '@/lib/services/account';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { ServiceError } from '@/lib/services/errors';

export const POST = handle(async (request: Request) => {
  const userId = await requireUserId('Sign in to confirm your email');

  /*
   * Keyed on the account, and tight.
   *
   * Each of these sends a real email, and a loop here is a way to use this
   * app's sending reputation to flood somebody's inbox. Three an hour is
   * generous for a person who did not receive the first one and mean for
   * anything automated.
   */
  enforceRateLimit(request, 'verify-send', { max: 3, windowMs: 60 * 60_000, identity: userId });

  const sent = await sendVerificationEmail(userId);
  return NextResponse.json(
    {
      sent,
      // Told plainly rather than hidden behind `sent: false`. A build with no
      // mail provider is a real state during setup, and "check your inbox"
      // when nothing was sent is the worst possible thing to say.
      mailConfigured: canSendMail(),
    },
    { status: HTTP.ok },
  );
});

export const PUT = handle(async (request: Request) => {
  // Unauthenticated by design — see above. Rate limited by IP because there is
  // no account to key on, and a token is 32 random bytes so this is a
  // formality rather than a real defence.
  enforceRateLimit(request, 'verify-confirm', { max: 20, windowMs: 60 * 60_000 });

  const { token } = await readJson(request, confirmEmailSchema);
  const outcome = await confirmEmail(token);

  if (outcome === 'expired' || outcome === 'invalid') {
    throw new ServiceError(
      outcome === 'expired'
        ? 'That confirmation link has expired. Sign in and ask for a new one.'
        : 'That confirmation link is not valid.',
      HTTP.badRequest,
      'token',
    );
  }

  // 'already' is a success: the person following a link twice — or whose mail
  // client scanned it first — has done what was asked.
  return NextResponse.json({ verified: true, alreadyVerified: outcome === 'already' });
});
