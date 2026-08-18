import type { Metadata } from 'next';
import { VerifyPanel } from './verify-panel';

export const metadata: Metadata = {
  title: 'Confirm your email',
  // Nobody should find this in a search result — it is only ever arrived at
  // from a link in a message.
  robots: { index: false, follow: false },
};

/**
 * Where a confirmation link lands.
 *
 * A server component holding one client island, so the page itself is static
 * and only the part that talks to the API ships as JavaScript.
 *
 * The token arrives in the query string and is spent by the panel rather than
 * on the server, deliberately: mail clients and corporate scanners follow
 * links to check them, and a server component would spend the token on that
 * fetch — so the person clicking would arrive to find it already used. Doing
 * it from the browser means a real click is what consumes it.
 */
export default async function VerifyPage({
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
        <VerifyPanel token={token ?? ''} />
      </div>
    </section>
  );
}
