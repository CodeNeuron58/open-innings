/**
 * Who is allowed into the signed-in group, and where they go if they are not.
 *
 * Pulled out of `(app)/_layout.tsx` as a plain function because the decision
 * is the part worth testing and the layout is the part that cannot be — there
 * is no React renderer in this workspace (see `vitest.config.ts`). The layout
 * now reads as three lines that call this.
 */

export type Gate =
  /** Session is still resolving. Show nothing yet. */
  | 'loading'
  /** Nobody is signed in and nobody asked to look around. */
  | 'welcome'
  /** Signed in, but the address on the account is still just a claim. */
  | 'verify'
  /** Let them through. */
  | 'allow';

export type GateInput = {
  /** `undefined` while the stored token is being read; `null` when there is none. */
  user: { emailVerifiedAt: string | null } | null | undefined;
  isGuest: boolean;
  isLoading: boolean;
  /** Whether the route being guarded *is* the verify screen. */
  onVerifyScreen: boolean;
};

/**
 * The order matters, and each step is here for its own reason.
 *
 * Loading first, because every question below it needs an answer that does not
 * exist yet — deciding on a half-read session is how a signed-in user gets
 * bounced to the welcome screen on cold start.
 *
 * Guests never reach the verification check. They have no address to prove,
 * and everything they can reach is public and read-only.
 *
 * The verify screen exempts itself, or the redirect points at itself.
 */
export function gateFor({ user, isGuest, isLoading, onVerifyScreen }: GateInput): Gate {
  if (isLoading || user === undefined) return 'loading';
  if (!user) return isGuest ? 'allow' : 'welcome';
  if (!user.emailVerifiedAt && !onVerifyScreen) return 'verify';
  return 'allow';
}
