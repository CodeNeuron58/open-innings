/**
 * POST /api/auth/verify — send (or resend) a six-digit confirmation code.
 * PUT  /api/auth/verify — check one.
 *
 * ## Both need a session, and that is the point
 *
 * The link version of this had an unauthenticated confirm step: whoever held
 * the token was the person being proven, so no session was needed. A code
 * cannot work that way. Six digits is a million possibilities, and a
 * confirm endpoint that took `{ email, code }` would let anybody guess
 * against any address, spreading attempts across every account at once.
 *
 * Looking the code up by **the signed-in user** instead means a guesser must
 * already be that user, and their five attempts are counted against that one
 * account. That is what makes a short code safe here.
 *
 * ## Why a code rather than a link
 *
 * This happens on a phone, seconds after signing up, on the screen somebody
 * wants to start scoring from. A link sends them out to a mail client and
 * hopes they come back. A code is read off a notification without opening
 * anything — which is why it is in the subject line too.
 */
import { NextResponse } from 'next/server';
import { confirmEmailSchema, HTTP } from '@open-innings/shared';
import {
  confirmEmailCode,
  sendVerificationEmail,
  canSendMail,
  MAX_CODE_ATTEMPTS,
} from '@/lib/services/account';
import { readJson, handle } from '@/lib/api/respond';
import { requireUserId } from '@/lib/auth/local';
import { enforceRateLimit } from '@/lib/api/request-meta';
import { ServiceError } from '@/lib/services/errors';

export const POST = handle(async (request: Request) => {
  const userId = await requireUserId('Sign in to confirm your email');

  /*
   * Keyed on the account, and tight.
   *
   * Each of these sends a real email, so a loop here is a way to use this
   * app's sending reputation to flood somebody's inbox. It is also the only
   * way to reset the attempt counter on a code, so throttling it is half of
   * what stops five guesses becoming unlimited guesses.
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
  const userId = await requireUserId('Sign in to confirm your email');

  /*
   * A second limit, above the per-code one.
   *
   * The five attempts on a row are the real defence, but they reset whenever
   * a new code is issued. This caps the whole loop — request, guess five
   * times, request again — at something no person doing this by hand will
   * ever reach.
   */
  enforceRateLimit(request, 'verify-confirm', { max: 20, windowMs: 60 * 60_000, identity: userId });

  const { code } = await readJson(request, confirmEmailSchema);
  const outcome = await confirmEmailCode(userId, code);

  switch (outcome.kind) {
    case 'verified':
      return NextResponse.json({ verified: true, alreadyVerified: false });

    // Not a failure. Somebody re-entering an old code, or tapping confirm
    // twice, has done what was asked of them.
    case 'already':
      return NextResponse.json({ verified: true, alreadyVerified: true });

    case 'none':
      throw new ServiceError(
        'That code has expired, or there is no code waiting. Ask for a new one.',
        HTTP.badRequest,
        'code',
      );

    default:
      throw new ServiceError(
        outcome.attemptsLeft > 0
          ? `That code is not right. ${outcome.attemptsLeft} ${
              outcome.attemptsLeft === 1 ? 'try' : 'tries'
            } left.`
          : `That code is not right, and you have used all ${MAX_CODE_ATTEMPTS} tries. Ask for a new one.`,
        HTTP.badRequest,
        'code',
      );
  }
});
