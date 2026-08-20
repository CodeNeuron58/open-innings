import type { Metadata } from 'next';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';
import { NotifyForm } from '@/components/marketing/notify-form';
import { AndroidFrame } from '@/components/marketing/android-frame';
import { ScoreScreen, ScorecardScreen } from '@/components/marketing/phone-screen';

export const metadata: Metadata = {
  title: 'Open Innings — Score every ball',
  description:
    'Open-source cricket scoring for club, league, box and gully cricket. One tap a ball. Scorecard, commentary and a live link build themselves from the same ball log.',
};

/**
 * The landing page.
 *
 * Ported from design_new/"Open Innings Website.dc.html". Copy is the design's
 * verbatim — some of it describes the roadmap rather than the current build
 * (see the sheet's own footnote), and that was a deliberate call to keep the
 * design intact and revise the words later.
 */

/** The spec-sheet plate. Its numbers are the release's, not aspirations. */
const SPEC_SHEET = [
  {
    no: '01',
    prop: 'Innings length',
    val: 'Any',
    rem: 'T20, ODI, T10 — or the 13 overs you actually agreed at the toss',
  },
  {
    no: '02',
    prop: 'Taps to record a ball',
    val: '1',
    rem: 'Two for an extra, three for a wicket with a fielder',
  },
  {
    no: '03',
    prop: 'Ads on the scoring screen',
    val: '0',
    rem: 'Ads run on the scorecard and share screens only',
  },
  {
    no: '04',
    prop: 'To remove them',
    val: '₹199/yr',
    rem: 'Cancel any time; nothing else is gated',
  },
  {
    no: '05',
    prop: 'Source',
    val: 'Open',
    rem: 'Fork it, self-host it, export your scorebook',
  },
] as const;

const FEATURES = [
  {
    title: 'One-thumb console',
    body: 'Runs zero to six under your thumb. Extras are modifiers, not a second keypad: arm wide, tap a number, done. Undo is always on screen because scorers always mis-tap.',
  },
  {
    title: 'One link, everyone watching',
    body: 'Every match has a live link. Parents in the car park, the player who is next in, the coach at another ground — all reading the same over as you score it. No app install to follow.',
  },
  {
    title: 'Nothing entered twice',
    body: 'Scorecard, commentary, fall of wickets, strike rates, economy, the share card. All of it is computed from the balls you already logged. Export the lot as an image or a file.',
  },
] as const;

const SECTIONS = [
  {
    href: '/formats',
    kicker: 'Formats',
    title: 'Any overs, one console',
    body: 'Most club cricket is not 20 or 50 overs. Set the number at the toss and the maths follows.',
    cta: 'See the table ›',
  },
  {
    href: '/pricing',
    kicker: 'Pricing',
    title: 'Free, or ₹199 a year for quiet',
    body: 'Nothing about cricket is behind the paywall. The subscription removes ads, and that is all it does.',
    cta: 'Compare plans ›',
  },
  {
    href: '/open-source',
    kicker: 'Open source',
    title: 'Read it, fork it, host it',
    body: 'How a wide is charged is in the code, not in a support article. Run your league’s own instance.',
    cta: 'Read the source ›',
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* 01 — Hero ------------------------------------------------------- */}
      <section className="oi-sec oi-sec-hero">
        <div className="oi-in oi-hero">
          <div>
            <h1 className="oi-h1">
              <span>Score every ball.</span>
              <span>Nobody has to ask</span>
              <span className="oi-accent">what the score is.</span>
            </h1>
            <p className="oi-lede">
              Open Innings is an open-source cricket scorer for club, league, box and gully cricket.
              One tap a ball. The scorecard, the over-by-over commentary, the fall of wickets and a
              live link for everyone watching all build themselves from the same ball log.
            </p>
            <div className="oi-cta-row">
              <BlueprintLink href="/app" className="btn btn-primary oi-btn-lg">
                Get it on Android
              </BlueprintLink>
              <a className="btn btn-secondary oi-btn-lg oi-btn-plain" href="/open-source">
                Read the source
              </a>
            </div>
            <div className="oi-tag-row">
              <span className="tag tag-outline">Free with ads</span>
              <span className="tag tag-accent">₹199/yr ad-free</span>
              {/* No iOS claim. AGPL-3.0 conflicts with the App Store's
                  terms — the reason VLC and GNU Go were pulled — so "iOS
                  next" was a promise this licence cannot keep. Self-hosting
                  replaces it because it is true and is the actual answer to
                  "what if I don't want your servers". */}
              {/* "No account needed to score" was the old promise and the app
                  dropped it on 2026-08-17: a guest reads any shared scorecard,
                  career or club page, and creating anything — a match, a
                  player, a ball — needs an account, because a scorebook has to
                  belong to somebody who can correct it. Watching is the half
                  that is still free to everyone, and it is the half that
                  matters for a link sent to a group. */}
              <span className="oi-tag-note">
                Android today &nbsp;·&nbsp; self-host anywhere &nbsp;·&nbsp; no account needed to
                watch
              </span>
            </div>
          </div>

          <div className="oi-phone">
            <AndroidFrame>
              <ScoreScreen />
            </AndroidFrame>
          </div>
        </div>
      </section>

      {/* Spec sheet ------------------------------------------------------ */}
      <section className="oi-sec oi-sec-pad">
        <div className="oi-in">
          <Blueprint>
            <div className="oi-sheet-head">
              <span className="oi-sheet-title">Open Innings — what ships today</span>
              <span className="oi-sheet-meta">OI-100</span>
              <span className="oi-sheet-meta">Rev A</span>
              <span className="oi-sheet-meta">Sheet 01</span>
            </div>
            <table className="oi-sheet-table table">
              <colgroup>
                <col className="oi-col-no" />
                <col className="oi-col-prop" />
                <col className="oi-col-val" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Property</th>
                  <th>Value</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {SPEC_SHEET.map((row) => (
                  <tr key={row.no}>
                    <td className="num oi-sheet-no">{row.no}</td>
                    <td className="oi-sheet-prop">{row.prop}</td>
                    <td className="num oi-sheet-val">{row.val}</td>
                    <td className="oi-sheet-rem">{row.rem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              Values describe the current release. Coach stats and the Test plate are on the
              roadmap, not in the build.
            </p>
          </Blueprint>
        </div>
      </section>

      {/* 02 — What it does ----------------------------------------------- */}
      <section className="oi-sec oi-sec-pad">
        <div className="oi-in">
          <span className="oi-kick">02 &nbsp;·&nbsp; What it does</span>
          <hr className="oi-rule oi-rule-lg" />
          <div className="oi-3">
            {FEATURES.map((feature) => (
              <Blueprint key={feature.title} className="oi-card">
                <h2 className="oi-h2 oi-h3">{feature.title}</h2>
                <p className="oi-card-body oi-dim">{feature.body}</p>
              </Blueprint>
            ))}
          </div>
        </div>
      </section>

      {/* 03 — The scorebook, generated ----------------------------------- */}
      <section className="oi-sec oi-sec-pad-lg">
        <div className="oi-in oi-split">
          <div>
            <span className="oi-kick">03 &nbsp;·&nbsp; The scorebook, generated</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2">
              Every number traces back
              <br />
              to a single ball
            </h2>
            <p className="oi-body oi-dim-strong">
              Strike rotates on odd runs and at the end of the over. Wides and no-balls go against
              the bowler; byes and leg-byes do not. A dismissal takes the type and the fielder, then
              brings the next batter in from your squad list.
            </p>
            <p className="oi-body oi-dim-strong">
              Because the ball log is the only source of truth, undo is exact rather than a guess,
              and a corrected ball fixes the card, the commentary and the live feed at once.
            </p>
            <div className="oi-figures">
              <div>
                <div className="num oi-figure">6</div>
                <div className="oi-kick oi-figure-label">Extras handled</div>
              </div>
              <div>
                <div className="num oi-figure">6</div>
                <div className="oi-kick oi-figure-label">Dismissal types</div>
              </div>
              <div>
                <div className="num oi-figure">∞</div>
                <div className="oi-kick oi-figure-label">Undo depth</div>
              </div>
            </div>
            <a className="btn btn-secondary oi-btn-md oi-btn-plain oi-btn-spaced" href="/app">
              See every screen
            </a>
          </div>
          <div className="oi-phone">
            <AndroidFrame>
              <ScorecardScreen />
            </AndroidFrame>
          </div>
        </div>
      </section>

      {/* 04 — The rest of the site --------------------------------------- */}
      <section className="oi-sec oi-sec-pad-lg">
        <div className="oi-in">
          <span className="oi-kick">04 &nbsp;·&nbsp; The rest of the site</span>
          <hr className="oi-rule oi-rule-lg" />
          <div className="oi-3">
            {SECTIONS.map((section) => (
              <BlueprintLink
                key={section.href}
                href={section.href}
                className="oi-card oi-card-link"
              >
                <span className="oi-kick">{section.kicker}</span>
                <h2 className="oi-h2 oi-h3">{section.title}</h2>
                <p className="oi-card-body oi-dim">{section.body}</p>
                <span className="oi-card-cta">{section.cta}</span>
              </BlueprintLink>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Get it ------------------------------------------------------ */}
      {/* id="get" is a link target: the app page's "Get it on Android" lands
          here while there is no Play listing to land on. */}
      <section className="oi-sec oi-sec-hero" id="get">
        <div className="oi-in">
          <span className="oi-kick">05 &nbsp;·&nbsp; Get it</span>
          <hr className="oi-rule" />
          <h2 className="oi-h2 oi-h2-sm">Score your next match with it</h2>
          <p className="oi-card-body oi-dim oi-measure">
            Release notes when there are some. No launch countdowns.
          </p>
          <NotifyForm source="landing" />
        </div>
      </section>
    </>
  );
}
