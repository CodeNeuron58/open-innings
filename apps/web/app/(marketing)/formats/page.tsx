import type { Metadata } from 'next';
import Link from 'next/link';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Formats',
  description:
    'Any innings length, one keypad. T20, ODI, T10 or the 13 overs you actually agreed at the toss — the engine scores limited-overs cricket of any length.',
};

/**
 * Ported from design_new/"Formats.dc.html", then corrected.
 *
 * The design listed seven formats as though they were all built. Three are
 * not, and the rules columns on the other four promised enforcement the
 * engine does not do — powerplays, bowler quotas and house-rule toggles.
 *
 * The honest version is also the better pitch. The engine does not have seven
 * formats; it has **one**, parameterised by innings length, which is why a
 * 13-over club game is as first-class as a T20. That is the thing no other
 * scoring app does properly, and it was buried under a list.
 */

/**
 * What the engine scores today.
 *
 * All one thing: limited overs, six balls an over, one innings a side. The
 * rows differ only by the number you set at the toss, which is why the rules
 * column is identical down the table — and saying so is more convincing than
 * inventing four different feature sets.
 */
const LIVE = [
  { n: 'T20', len: '20 overs' },
  { n: 'ODI', len: '50 overs' },
  { n: 'T10', len: '10 overs' },
  { n: 'Club / league', len: 'Any — 8, 12, 16, 25, 35' },
  { n: 'Gully / street', len: 'Any' },
] as const;

/**
 * What it does not score, and why each is a rewrite rather than a setting.
 *
 * Listed rather than hidden: a scorer who turns up expecting to score a Test
 * needs to know before the toss, not at the declaration.
 */
const NOT_YET = [
  {
    n: 'Test / multi-day',
    why: 'Two innings a side, declarations and the follow-on. The engine models one innings per team.',
  },
  {
    n: 'The Hundred',
    why: 'Five-ball sets and a 100-ball innings. Overs are six balls throughout the engine.',
  },
  {
    n: 'Box / indoor',
    why: 'Zone runs and negative runs on dismissal — a different scoring system, not a different length.',
  },
] as const;

const CONSTANTS = [
  {
    title: 'The keypad',
    body: 'Zero to six, wicket, and four armed extras — in the same place in every format. A scorer who learns it for T20 already knows it for a two-day game.',
  },
  {
    title: 'The ball log',
    body: 'One record per ball, whatever the format. Which means the card, the commentary and the export read the same in a gully game as in a league final.',
  },
  {
    title: 'Custom is a first-class format',
    body: 'Most club cricket is not 20 or 50 overs. Set 8, 12, 16, 25 or 35 at the toss and the required-rate maths follows without a workaround.',
  },
  {
    title: 'The laws it does enforce',
    body: 'Free hit after a no-ball. No bowler twice in a row. Strike rotation, wides and no-balls excluded from balls faced, and every dismissal in Law 25 credited to the right column. House-rule toggles — one-tip-one-hand, last-man-bats — are not built.',
  },
] as const;

export default function FormatsPage() {
  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Formats</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub">
            Choose it at the toss.
            <br />
            The console never changes.
          </h1>
          <p className="oi-lede oi-lede-wide">
            One keypad, any innings length. Most club cricket is not 20 or 50 overs, so the number
            you agreed at the toss is the number the app scores to — and the required rate follows
            without a workaround.
          </p>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <Blueprint>
            <table className="oi-fmt-table table">
              <thead>
                <tr>
                  <th>Scores today</th>
                  <th className="oi-fmt-len">Length</th>
                  <th className="oi-fmt-plate">Plate shows</th>
                  <th className="oi-fmt-hide">What it enforces</th>
                </tr>
              </thead>
              <tbody>
                {LIVE.map((fmt) => (
                  <tr key={fmt.n}>
                    <td className="oi-fmt-name">{fmt.n}</td>
                    <td className="num oi-fmt-len">{fmt.len}</td>
                    <td className="oi-fmt-plate">Target, CRR, RRR</td>
                    <td className="oi-fmt-hide oi-fmt-rules">
                      Free hit, no bowler twice in a row, strike rotation, Law 25 dismissals
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              One engine, one parameter. Every row above is the same code with a different number of
              overs — which is why a 13-over club game is as first-class as a T20.
            </p>
          </Blueprint>
        </div>
      </section>

      {/* Said plainly, and early. A scorer who turns up expecting to score a
          Test needs to know at the toss, not at the declaration. */}
      <section className="oi-sec oi-sec-pad">
        <div className="oi-in">
          <span className="oi-kick">Not yet</span>
          <hr className="oi-rule oi-rule-md" />
          <Blueprint>
            <table className="oi-sheet-table table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Why it is not a setting</th>
                </tr>
              </thead>
              <tbody>
                {NOT_YET.map((fmt) => (
                  <tr key={fmt.n}>
                    <td className="oi-fmt-name">{fmt.n}</td>
                    <td className="oi-fmt-rules">{fmt.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              Each of these is a different scoring model rather than a different innings length, so
              none is a switch we have not flipped yet. They are on the roadmap, not in the build.
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">What stays the same</span>
          <hr className="oi-rule oi-rule-md" />
          <div className="oi-2">
            {CONSTANTS.map((item) => (
              <Blueprint key={item.title} className="oi-card">
                <h2 className="oi-h2 oi-h3">{item.title}</h2>
                <p className="oi-card-body oi-dim">{item.body}</p>
              </Blueprint>
            ))}
          </div>
          <div className="oi-cta-row oi-cta-row-lg">
            <BlueprintLink href="/app" className="btn btn-primary oi-btn-md">
              See the app
            </BlueprintLink>
            <Link className="btn btn-secondary oi-btn-md oi-btn-plain" href="/pricing">
              Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
