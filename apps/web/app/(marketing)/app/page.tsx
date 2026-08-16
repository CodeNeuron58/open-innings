import type { Metadata } from 'next';
import Link from 'next/link';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';
import { AndroidFrame } from '@/components/marketing/android-frame';
import { ScoreScreen, ScorecardScreen } from '@/components/marketing/phone-screen';

export const metadata: Metadata = {
  title: 'The app',
  description:
    'Four screens: your matches, the console you score on, the card everything is generated into, and a share sheet. Nothing else to learn, nothing else to buy.',
};

/**
 * Ported from design_new/"The App.dc.html".
 *
 * The design's two hero buttons were inert. "Get it on Android" now points at
 * the landing page's notify form, which is the honest destination while there
 * is no Play listing: someone who taps it wants to be told when they can have
 * it, and now they can be.
 *
 * ⚠️ "Join the iOS beta" is still inert, and it is a bigger problem than a
 * dead button. apps/mobile/README records that iOS is not planned at all —
 * AGPL-3.0 conflicts with the App Store's terms, which is why VLC and GNU Go
 * were pulled. Offering a beta for a platform the project has decided against
 * is a promise that cannot be kept. Left as-is rather than quietly rewriting
 * the positioning; see docs/wiring.md.
 */

const PARTS = [
  {
    no: '01',
    el: 'Score plate',
    why: 'Runs, wickets, overs, target and both run rates on a steel field — the only heavy object on the screen, legible at arm’s length in sun.',
  },
  {
    no: '02',
    el: 'Both batters',
    why: 'Runs, balls, boundaries and strike rate, with an asterisk on whoever is on strike. Strike rotates by itself.',
  },
  {
    no: '03',
    el: 'Bowler line',
    why: 'Overs, maidens, runs, wickets and economy for the bowler currently on, updated per ball.',
  },
  {
    no: '04',
    el: 'This over',
    why: 'Six cells that fill as the over goes, plus a cell for every extra bowled. The scorer’s traditional over strip.',
  },
  {
    no: '05',
    el: 'Extras row',
    why: 'Wide, no ball, bye and leg bye as armed modifiers. Arm one, tap the runs, and it is charged to the right column.',
  },
  {
    no: '06',
    el: 'Keypad and undo',
    why: 'Zero to six and W. Undo is permanent furniture rather than a hidden gesture, because scorers mis-tap.',
  },
] as const;

const ALSO = [
  {
    title: 'Match setup and toss',
    body: 'Format, overs, both teams, who won the toss and what they elected. Two steps, then you are scoring.',
  },
  {
    title: 'Squads that remember',
    body: 'Name your XI once. Next match it is already there, so a dismissal brings in the right batter without typing.',
  },
  {
    title: 'Share card',
    body: 'A single image with the result, top scorer and best bowler — sized for the club group chat rather than a timeline.',
  },
] as const;

export default function AppPage() {
  return (
    <>
      <section className="oi-sec oi-sec-hero">
        <div className="oi-in oi-hero">
          <div>
            <span className="oi-kick">The app</span>
            <hr className="oi-rule" />
            <h1 className="oi-h1 oi-h1-sub oi-h1-narrow">
              A scorebook
              <br />
              with a keypad
            </h1>
            <p className="oi-lede">
              The whole app is four screens: your matches, the console you score on, the card
              everything is generated into, and a share sheet. There is nothing else to learn, and
              nothing else to buy.
            </p>
            {/* Points at the notify form until there is a Play listing to
                point at. Swap the href, not the label, when there is. */}
            <div className="oi-cta-row">
              <Link href="/#get" className="btn btn-primary blueprint oi-btn-lg">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                Get it on Android
              </Link>
              <button type="button" className="btn btn-secondary oi-btn-lg oi-btn-plain">
                Join the iOS beta
              </button>
            </div>
            <div className="oi-figures oi-figures-lg">
              <div>
                <div className="num oi-figure oi-figure-sm">Android 8+</div>
                <div className="oi-kick oi-figure-label">Requires</div>
              </div>
              <div>
                <div className="num oi-figure oi-figure-sm">14 MB</div>
                <div className="oi-kick oi-figure-label">Download</div>
              </div>
              <div>
                <div className="num oi-figure oi-figure-sm">None</div>
                <div className="oi-kick oi-figure-label">Account to score</div>
              </div>
            </div>
          </div>
          <div className="oi-phone">
            <AndroidFrame>
              <ScoreScreen />
            </AndroidFrame>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad">
        <div className="oi-in">
          <span className="oi-kick">02 &nbsp;·&nbsp; The console, part by part</span>
          <hr className="oi-rule oi-rule-lg" />
          <Blueprint>
            <table className="oi-sheet-table oi-parts-table table">
              <colgroup>
                <col className="oi-src-col-no" />
                <col className="oi-parts-col-el" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Element</th>
                  <th>What it is for</th>
                </tr>
              </thead>
              <tbody>
                {PARTS.map((part) => (
                  <tr key={part.no}>
                    <td className="num oi-sheet-no">{part.no}</td>
                    <td className="oi-parts-el">{part.el}</td>
                    <td className="oi-parts-why">{part.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">03 &nbsp;·&nbsp; Screen by screen</span>
          <hr className="oi-rule oi-rule-lg" />
          <div className="oi-screens">
            <div>
              <div className="oi-phone">
                <AndroidFrame>
                  <ScoreScreen />
                </AndroidFrame>
              </div>
              <h2 className="oi-h2 oi-h3 oi-screens-title">Scoring</h2>
              <p className="oi-card-body oi-dim oi-screens-body">
                Score plate, both batters, the bowler&rsquo;s figures, this over, and the console.
                No ad ever appears here. The keypad sits in the bottom third so it is reachable
                one-handed.
              </p>
            </div>
            <div>
              <div className="oi-phone">
                <AndroidFrame>
                  <ScorecardScreen />
                </AndroidFrame>
              </div>
              <h2 className="oi-h2 oi-h3 oi-screens-title">The card</h2>
              <p className="oi-card-body oi-dim oi-screens-body">
                Batting and bowling figures, extras, fall of wickets, and an over-by-over commentary
                tab — all computed, never typed. This is where the ad runs on the free plan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">04 &nbsp;·&nbsp; Also in the build</span>
          <hr className="oi-rule oi-rule-lg" />
          <div className="oi-3">
            {ALSO.map((item) => (
              <Blueprint key={item.title} className="oi-card">
                <h2 className="oi-h2 oi-h3">{item.title}</h2>
                <p className="oi-card-body oi-dim">{item.body}</p>
              </Blueprint>
            ))}
          </div>
          <div className="oi-cta-row oi-cta-row-lg">
            <BlueprintLink href="/pricing" className="btn btn-primary oi-btn-md">
              See pricing
            </BlueprintLink>
            <a className="btn btn-secondary oi-btn-md oi-btn-plain" href="/formats">
              Formats
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
