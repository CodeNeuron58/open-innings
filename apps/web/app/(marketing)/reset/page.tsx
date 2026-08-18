import type { Metadata } from 'next';
import { ResetPanel } from './reset-panel';

export const metadata: Metadata = {
  title: 'Reset your password',
  // Only ever arrived at from a link in a message, so it has no business in a
  // search result.
  robots: { index: false, follow: false },
};

/**
 * One route, both halves of a password reset.
 *
 * `/reset` asks for the address. `/reset?token=…` sets the new password. The
 * same page because they are one errand, and because somebody landing on the
 * second half with an expired token needs the first half immediately — not a
 * link to it.
 *
 * Unlike the confirmation page, the token here is **not** spent on arrival. A
 * reset link has to survive being followed by a mail scanner or a preview
 * fetch; what spends it is submitting a new password, which nothing automated
 * will do.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <section className="oi-sec oi-sec-top">
      <div className="oi-in">
        <span className="oi-kick">Your account</span>
        <hr className="oi-rule" />
        <ResetPanel token={token ?? ''} />
      </div>
    </section>
  );
}
