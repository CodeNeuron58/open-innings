import type { Metadata } from 'next';
import Link from 'next/link';
import { Blueprint } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Open Innings collects, what it never collects, what is public by design, and how to get rid of all of it.',
};

/**
 * The privacy policy.
 *
 * Google Play will not publish an app without a reachable policy URL, so this
 * page is a release blocker. That is the reason it exists now — but it is not
 * the reason it reads the way it does.
 *
 * ## Written from the schema, not from a template
 *
 * Every claim below was checked against `apps/web/lib/db/schema.ts` before it
 * was written down. A privacy policy that describes collection the software
 * does not do is worse than none: it is a false statement about somebody's
 * data, made to a regulator and to the person it belongs to.
 *
 * So where the honest answer is uncomfortable it is stated anyway — the
 * scorecard is public and permanent, deletion is currently a request rather
 * than a button, and IP addresses are kept with sessions.
 *
 * ## Two things that need updating when the code changes
 *
 * 1. **Deletion.** `DELETE /api/me` does not exist yet, so this page describes
 *    the process that actually works today, which is asking. When the endpoint
 *    and `/delete-account` land, the wording here changes with them, and not
 *    before — the Data Safety form asks for a URL that works.
 * 2. **The advertising section** assumes ads are live. They are opt-in per
 *    build (`EXPO_PUBLIC_ADS_MODE`), so a tester build serves Google's test
 *    units. The text says "the app shows ads" because the published app will;
 *    saying otherwise would be out of date on release day.
 */

const UPDATED = '19 August 2026';

/** What is stored, why, and for how long. Each row is a real column. */
const COLLECTED: { no: string; what: string; why: string; kept: string }[] = [
  {
    no: '01',
    what: 'Email address',
    why: 'It is how you sign in, and the only way to reach you about your account.',
    kept: 'Until the account is deleted.',
  },
  {
    no: '02',
    what: 'Password',
    why: 'Stored only as an Argon2 hash with a per-account salt. Nobody, including us, can read it back.',
    kept: 'Until the account is deleted.',
  },
  {
    no: '03',
    what: 'Display name, optional',
    why: 'Shown to you. Not shown on public pages.',
    kept: 'Until the account is deleted.',
  },
  {
    no: '04',
    what: 'Session records — a hash of your sign-in token, your IP address and your browser or device description',
    why: 'To keep you signed in, and so a session can be ended. The IP and device are what let you tell your own sessions apart from one you do not recognise.',
    kept: 'Until the session expires or you sign out.',
  },
  {
    no: '05',
    what: 'Players you add — name, short name, date of birth if you enter one, batting and bowling style, role',
    why: 'They are the squad you score. A date of birth is optional and used only to separate players with the same name.',
    kept: 'Indefinitely — see “What is public”.',
  },
  {
    no: '06',
    what: 'Teams, matches, and every ball you record',
    why: 'This is the product. Every figure in the app is derived from the ball log rather than stored separately.',
    kept: 'Indefinitely — see “What is public”.',
  },
  {
    no: '07',
    what: 'An anonymous viewer key, if you watch a live match',
    why: 'To count how many people are watching, so the scorer sees it. It identifies a browser or a device, never a person, and is never joined to any account.',
    kept: 'Until the match is deleted.',
  },
  {
    no: '08',
    what: 'Your email, if you ask to be notified about a release',
    why: 'To tell you when the thing you asked about is ready. Nothing else is ever sent to it.',
    kept: 'Until you ask for it to be removed.',
  },
];

const NOT_COLLECTED: string[] = [
  'No analytics of any kind. There is no Google Analytics, no Firebase Analytics, no PostHog, Mixpanel, Amplitude, Segment or Plausible in either the website or the app. Nothing records which screens you open or how long you stay.',
  'No location. The app never asks for it and could not use it.',
  'No contacts, photos, microphone, camera or calendar. None of these permissions is requested.',
  'No advertising or tracking cookies on this website, and no third-party fonts or scripts — the two typefaces are served from this domain, so loading a page here tells nobody else that you did.',
  'No selling of anything to anybody, and no sharing with data brokers. There is no version of this where your club’s scorebook becomes somebody’s dataset.',
];

export default function PrivacyPage() {
  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Privacy</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
            What we keep,
            <br />
            and what is public
          </h1>
          <p className="oi-lede oi-lede-mid">
            Written from the database schema rather than from a template, so every line below
            describes something the software actually does. The uncomfortable parts are here too.
          </p>
          <p className="oi-body oi-dim-strong">
            Last updated {UPDATED}. This covers the Open Innings Android app and this website, run
            at <strong>openinnings.com</strong>. Open Innings is AGPL-3.0 open source and anyone may
            run their own copy — this policy speaks only for the copy we operate.
          </p>
        </div>
      </section>

      {/* The most important section, so it is first and not buried in a list. */}
      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">Read this part first</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Scorecards are public, and they are meant to be</h2>
            <p className="oi-body oi-dim-strong">
              When you score a match, its scorecard is readable by anyone with the link, with no
              account and no app. That is the point of the product: a career that follows a player
              between clubs only works if the record is open. It also means a player’s name, their
              runs, their wickets and every ball they faced are public from the moment you record
              them.
            </p>
            <p className="oi-body oi-dim-strong">
              Two consequences worth being blunt about.{' '}
              <strong>You are publishing other people.</strong> The players in your squad did not
              sign up here, and adding somebody puts their name and their figures on a public page.
              Only add people who would be comfortable with that, the way a club scorebook or a
              league website already works.
            </p>
            <p className="oi-body oi-dim-strong">
              And <strong>anyone can add a player</strong>, including someone you have never met,
              because a cricketer who turns out for two clubs is one person and both clubs need to
              be able to score them. If figures appear against your name that you did not agree to,
              write to us and we will deal with it.
            </p>
          </div>

          <Blueprint>
            <span className="oi-kick">Not public</span>
            <p className="oi-faq-aside-body">
              Your email address, your display name, your password, your sessions and your IP
              address never appear on any public page and are never shown to another user.
            </p>
            <div className="oi-faq-aside-rule" />
            <span className="oi-kick oi-faq-aside-kick">Also not public</span>
            <p className="oi-faq-aside-body oi-faq-aside-last">
              Which account created a player or a team. A public career page shows the cricket and
              nothing about whoever typed it in.
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">What is collected</span>
          <hr className="oi-rule" />
          <h2 className="oi-h2 oi-h2-md">Eight things, and that is the whole list</h2>
          <div className="oi-sheet">
            <div className="oi-sheet-head">
              <span className="oi-sheet-title">Collected data</span>
              <span className="oi-sheet-meta">From the schema</span>
              <span className="oi-sheet-meta">Sheet 01</span>
            </div>
            <table className="oi-sheet-table table">
              <tbody>
                {COLLECTED.map((row) => (
                  <tr key={row.no}>
                    <td className="num oi-sheet-no">{row.no}</td>
                    <td className="oi-sheet-prop">{row.what}</td>
                    <td className="oi-src-rem">{row.why}</td>
                    <td className="oi-src-rem">{row.kept}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              You can read the table definitions these rows describe — the schema is in the public
              repository, and a claim here that the code contradicted would be visible to anyone.
            </p>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">What is never collected</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">The list most apps cannot write</h2>
            <div className="oi-ways">
              {NOT_COLLECTED.map((line, i) => (
                <div className="oi-way" key={i}>
                  <span className="num oi-way-no">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="oi-way-body">{line}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="oi-kick">Who else is involved</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Three companies, and what each one sees</h2>
            <p className="oi-body oi-dim-strong">
              <strong>Heroku and Amazon Web Services</strong> host the servers and the database, in
              Europe. They store what is listed above on our behalf and do nothing else with it.
            </p>
            <p className="oi-body oi-dim-strong">
              <strong>Google AdMob</strong> serves the banner on the scorecard and share screens. It
              uses your device’s advertising identifier and may personalise what it shows. Android
              lets you reset or delete that identifier at any time, in Settings → Privacy → Ads.{' '}
              <strong>No ad ever appears on the scoring screen</strong>, and paying supporters see
              none at all. AdMob’s own policy governs what it collects.
            </p>
            <p className="oi-body oi-dim-strong">
              <strong>RevenueCat and Google Play Billing</strong> handle the optional ₹99/month
              supporter subscription. They see the purchase; we never see your card. If you never
              subscribe, neither is contacted.
            </p>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">Your data, your call</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Getting a copy, and getting rid of it</h2>
            <p className="oi-body oi-dim-strong">
              <strong>Export.</strong> Any match you scored can be exported as CSV or JSON from the
              app, ball by ball. Nothing is held back and no plan is required.
            </p>
            <p className="oi-body oi-dim-strong">
              <strong>Deletion.</strong> Email us and we will delete your account. Your email
              address and display name are erased, your password and sessions are destroyed, and the
              account can no longer be signed in to.
            </p>
            <p className="oi-body oi-dim-strong">
              Matches and ball events survive, with no trace of who recorded them. That is
              deliberate: a match is other people’s cricket too, and deleting it would remove
              innings from the careers of everyone else who played. If you want a specific match
              removed rather than your account, ask for that instead and we will do it.
            </p>
            <p className="oi-body oi-dim-strong">
              <strong>Correction and access.</strong> Ask, and we will tell you everything held
              about you and fix anything wrong. You do not need to give a reason.
            </p>
          </div>

          <Blueprint>
            <span className="oi-kick">Two more things</span>
            <p className="oi-faq-aside-body">
              <strong>Children.</strong> The app is not directed at children under 13 and we do not
              knowingly create accounts for them. Junior cricketers are often <em>scored</em> — if
              you are a parent and want a child’s name removed from public pages, write to us and it
              will be done without argument.
            </p>
            <div className="oi-faq-aside-rule" />
            <span className="oi-kick oi-faq-aside-kick">Changes</span>
            <p className="oi-faq-aside-body">
              This page changes when the software does, and the date at the top moves with it.
              Because the source is public, you can see the change itself rather than take our word
              for it.
            </p>
            <div className="oi-faq-aside-rule" />
            <span className="oi-kick oi-faq-aside-kick">Contact</span>
            <p className="oi-faq-aside-body oi-faq-aside-last">
              <a className="oi-fl" href="mailto:biprayanchoudhuri58@gmail.com">
                biprayanchoudhuri58@gmail.com
              </a>
              <br />
              Anything about your data, at that address. Bugs are better in{' '}
              <a className="oi-fl" href="https://github.com/CodeNeuron58/open-innings/issues">
                the issue tracker
              </a>
              .
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-lg">
        <div className="oi-in">
          <Blueprint>
            <span className="oi-kick">In one paragraph</span>
            <p className="oi-faq-aside-body oi-faq-aside-last">
              We keep your email, a hash of your password, your sessions, and the cricket you
              record. The cricket is public because that is the product; everything about{' '}
              <em>you</em> is not. There is no analytics, no tracking and nothing sold. Ads appear
              on the reading screens only, never while you score. Ask us and it goes away.{' '}
              <Link className="oi-fl" href="/faq">
                More questions
              </Link>
              .
            </p>
          </Blueprint>
        </div>
      </section>
    </>
  );
}
