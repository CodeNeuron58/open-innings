import type { Metadata } from 'next';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Formats',
  description:
    'T20 through Tests, the Hundred, box and gully rules. Seven formats share one keypad — the format decides the header, not the console.',
};

/** Ported from design_new/"Formats.dc.html". */

const FORMATS = [
  {
    n: 'T20',
    len: '20 overs',
    plate: 'Target, CRR, RRR',
    rules: 'Powerplay overs, bowler quota of four, wide and no-ball free hit',
  },
  {
    n: 'ODI',
    len: '50 overs',
    plate: 'Target, CRR, RRR',
    rules: 'Three powerplay blocks, bowler quota of ten',
  },
  {
    n: 'Custom overs',
    len: 'Any',
    plate: 'Target, CRR, RRR',
    rules: 'Quota scales with the innings length you set',
  },
  {
    n: 'Test / multi-day',
    len: 'Unlimited',
    plate: 'Lead, session, new ball',
    rules: 'Two innings a side, declarations, follow-on, over rate',
  },
  {
    n: 'The Hundred',
    len: '100 balls',
    plate: 'Balls left, target',
    rules: 'Five-ball sets, ends change every ten, bowler bowls five or ten',
  },
  {
    n: 'Box / indoor',
    len: '10 overs',
    plate: 'Target, zone bonus',
    rules: 'Zone runs, negative runs on dismissal, every batter bats',
  },
  {
    n: 'Gully / street',
    len: 'Any',
    plate: 'Target, balls left',
    rules: 'One-tip-one-hand, last-man-bats, no LBW, joint innings',
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
    title: 'House rules are toggles',
    body: 'One-tip-one-hand, last-man-bats, no LBW, single-batter chases. Turn on what your street or your box league plays, and the app scores by those rules.',
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
            Seven formats share one keypad. What the format decides is the header — what the score
            plate counts down, and which rules the app enforces behind you.
          </p>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <Blueprint>
            <table className="oi-fmt-table table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th className="oi-fmt-len">Length</th>
                  <th className="oi-fmt-plate">Plate shows</th>
                  <th className="oi-fmt-hide">Rules it enforces</th>
                </tr>
              </thead>
              <tbody>
                {FORMATS.map((fmt) => (
                  <tr key={fmt.n}>
                    <td className="oi-fmt-name">{fmt.n}</td>
                    <td className="num oi-fmt-len">{fmt.len}</td>
                    <td className="oi-fmt-plate">{fmt.plate}</td>
                    <td className="oi-fmt-hide oi-fmt-rules">{fmt.rules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              Test and the Hundred plates are on the roadmap; everything else is in the current
              release.
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
            <a className="btn btn-secondary oi-btn-md oi-btn-plain" href="/pricing">
              Pricing
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
