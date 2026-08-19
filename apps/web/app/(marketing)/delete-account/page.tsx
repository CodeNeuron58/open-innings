import type { Metadata } from 'next';
import Link from 'next/link';
import { Blueprint } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Open Innings account, what is erased, and what stays because it belongs to other people too.',
};

/**
 * The deletion page Google Play requires.
 *
 * Play will not publish an app that allows account creation unless deletion is
 * available **both in-app and at a publicly reachable web URL**, and the Data
 * Safety form asks for that URL by name. This is that URL.
 *
 * ## Why it explains rather than does
 *
 * There is no web sign-in — the app is Android and the site is static — so a
 * form here could not authenticate anybody, and a delete button that cannot
 * verify who is pressing it is worse than no button. What Play requires is
 * that a user can find out how to delete and can reach somebody if they
 * cannot; that is what this page is for.
 *
 * ## Why the "what stays" section is as long as the rest
 *
 * Because it is the part people are actually asking about, and the part most
 * deletion pages skip. Somebody deleting their account wants to know whether
 * their club's season disappears with them. It does not, and saying so plainly
 * — with the reason — is more honest than a page that says "your data will be
 * deleted" and lets them find out later.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Your account</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
            Deleting your
            <br />
            account
          </h1>
          <p className="oi-lede oi-lede-mid">
            You can do it yourself from inside the app, and it takes effect immediately. What is
            erased and what stays is set out below, because the second half is the part people
            actually want to know.
          </p>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">In the app</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Three taps, and your password</h2>
            <div className="oi-ways">
              <div className="oi-way">
                <span className="num oi-way-no">01</span>
                <div>
                  <div className="oi-way-title">Open Open Innings and go to More</div>
                  <div className="oi-way-body">The tab on the right of the bar at the bottom.</div>
                </div>
              </div>
              <div className="oi-way">
                <span className="num oi-way-no">02</span>
                <div>
                  <div className="oi-way-title">Scroll to the bottom and tap Delete account</div>
                  <div className="oi-way-body">
                    It sits on its own, away from everything else, so it cannot be hit by accident.
                  </div>
                </div>
              </div>
              <div className="oi-way">
                <span className="num oi-way-no">03</span>
                <div>
                  <div className="oi-way-title">Enter your password to confirm</div>
                  <div className="oi-way-body">
                    Asked for again because a signed-in phone is not proof of who is holding it, and
                    this cannot be undone.
                  </div>
                </div>
              </div>
            </div>
            <p className="oi-body oi-dim-strong">
              Every device signed in to the account is signed out at once, and the account can never
              be signed in to again. There is no waiting period and no way back — if you want your
              records first, export any match as CSV or JSON before you start.
            </p>
          </div>

          <Blueprint>
            <span className="oi-kick">Cannot reach the app</span>
            <p className="oi-faq-aside-body">
              Lost the phone, or cannot sign in? Email us from the address on the account and we
              will do it for you. No reason needed, and no attempt to talk you out of it.
            </p>
            <p className="oi-faq-aside-body">
              <a className="oi-fl" href="mailto:biprayanchoudhuri58@gmail.com">
                biprayanchoudhuri58@gmail.com
              </a>
            </p>
            <div className="oi-faq-aside-rule" />
            <span className="oi-kick oi-faq-aside-kick">Only part of it</span>
            <p className="oi-faq-aside-body oi-faq-aside-last">
              If you want one match removed rather than your whole account, ask for that instead. It
              is a smaller thing and we will just do it.
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">Erased</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Everything that points at you</h2>
            <div className="oi-ways">
              {[
                [
                  'Your email address',
                  'Replaced with an unreachable placeholder on a reserved domain.',
                ],
                ['Your display name', 'Removed.'],
                [
                  'Your password',
                  'Overwritten with random bytes that are thrown away, so the account cannot be signed into even by mistake.',
                ],
                ['Every session', 'All devices signed out immediately.'],
                [
                  'Any confirmation or reset in flight',
                  'Destroyed, so a link already sent cannot outlive the account.',
                ],
                [
                  'Your place on the release-notification list',
                  'Removed, if your address was on it.',
                ],
                [
                  'The link between you and your player page',
                  'Released. The player stays; the claim that they are you does not.',
                ],
              ].map(([t, d], i) => (
                <div className="oi-way" key={t}>
                  <span className="num oi-way-no">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="oi-way-title">{t}</div>
                    <div className="oi-way-body">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="oi-kick">Kept</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">The cricket, because it is not only yours</h2>
            <p className="oi-body oi-dim-strong">
              Matches, scorecards and every ball you recorded stay. So do the squads you made and
              the players you added.
            </p>
            <p className="oi-body oi-dim-strong">
              This is deliberate, and it is the one part of deletion worth arguing about. A match
              has two sides. Removing it would take innings out of the careers of everyone else who
              played — the batter at the other end, the person who took the catch, the opposition —
              none of whom asked for anything. Their record is not ours to delete on somebody
              else&rsquo;s behalf.
            </p>
            <p className="oi-body oi-dim-strong">
              What goes is every trace of <em>who recorded it</em>. The scorecards remain; nothing
              on them, or behind them, says you.
            </p>
            <p className="oi-body oi-dim-strong">
              If a specific match is the problem — one you should not have published, or one with a
              name on it that should not be there — ask, and it will be removed. That is a different
              request and a reasonable one.
            </p>
            <p className="oi-body oi-dim-strong">
              The full picture of what is stored and why is on the{' '}
              <Link className="oi-fl" href="/privacy">
                privacy page
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
