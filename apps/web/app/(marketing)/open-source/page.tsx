import type { Metadata } from 'next';
import { Blueprint, BlueprintLink } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Open source',
  description:
    'AGPL-3.0. How a wide is charged is in the code, not a support article. Read it, fork it, and run your league’s own instance.',
};

/**
 * Ported from design_new/"Open Source.dc.html".
 *
 * Two corrections to the design's copy, because both were factually wrong
 * about this repository rather than matters of taste:
 *   - "Licence to be confirmed before launch" — it is AGPL-3.0 and has been
 *     since the first commit. There is a LICENSE file.
 *   - The GitHub buttons were inert `<button>`s. They link to the real repo.
 */

const REPO_URL = 'https://github.com/CodeNeuron58/open-innings';
const CONTRIBUTING_URL = `${REPO_URL}/blob/master/CONTRIBUTING.md`;

const SHEET = [
  { no: '01', prop: 'Source', val: 'Public', rem: 'App, API and the public scorecard' },
  {
    no: '02',
    prop: 'Issues and discussion',
    val: 'Open',
    rem: 'Scoring disagreements are welcome and usually become fixes',
  },
  {
    no: '03',
    prop: 'Pull requests',
    val: 'Open',
    rem: 'Rule toggles, translations, format support',
  },
  {
    no: '04',
    prop: 'Self-hosting',
    val: 'Supported',
    rem: 'Run the sync server yourself; no ads, no subscription',
  },
  { no: '05', prop: 'Your data', val: 'Exportable', rem: 'The whole ball log, not a summary' },
] as const;

const WAYS = [
  {
    no: '01',
    t: 'Score a match and report what broke',
    d: 'The most useful contribution is a real Sunday game and an honest issue about the ball it got wrong.',
  },
  {
    no: '02',
    t: 'Write your league’s rules down',
    d: 'Tell us how your competition scores wides, free hits and last-man-bats, and it becomes a toggle rather than a fork.',
  },
  {
    no: '03',
    t: 'Translate it',
    d: 'The interface is short. A full translation is a few hundred strings, most of them cricket words you already know.',
  },
  {
    no: '04',
    t: 'Send a fix',
    d: 'The scoring engine is one package with no framework around it, which is deliberate — it should be readable by any club member who codes a little.',
  },
] as const;

const SELF_HOST = [
  {
    title: 'Run the sync server',
    body: "One small service holds the ball logs and serves the public scorecards. Point the app at your own host and your league's data never leaves it.",
  },
  {
    title: 'No ad server, no ads',
    body: 'A self-hosted build has nothing to serve an ad from, so there is nothing to remove and nothing to pay for.',
  },
  {
    title: 'Fork it for your rules',
    body: 'If your competition scores something its own way, change it in a fork rather than waiting for a toggle. Upstream the ones others would want.',
  },
] as const;

export default function OpenSourcePage() {
  return (
    <div className="oi-page-source">
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Open source</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub">
            A scorebook nobody
            <br />
            can take away
            <br />
            from your club
          </h1>
          <p className="oi-lede oi-lede-wide">
            Open Innings is developed in the open. You can read how it scores, disagree with it in
            public, fix it, and run your own copy for your league. No licence key sits between you
            and your own matches.
          </p>
          <div className="oi-cta-row">
            <BlueprintLink href={REPO_URL} className="btn btn-primary oi-btn-lg">
              View on GitHub
            </BlueprintLink>
            <a className="btn btn-secondary oi-btn-lg oi-btn-plain" href={CONTRIBUTING_URL}>
              Read the contributing guide
            </a>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <Blueprint>
            <div className="oi-sheet-head">
              <span className="oi-sheet-title">Repository</span>
              <span className="oi-sheet-meta">Public</span>
              <span className="oi-sheet-meta">Sheet 02</span>
            </div>
            <table className="oi-sheet-table oi-src-table table">
              <colgroup>
                <col className="oi-src-col-no" />
                <col className="oi-src-col-prop" />
                <col className="oi-src-col-val" />
                <col />
              </colgroup>
              <tbody>
                {SHEET.map((row) => (
                  <tr key={row.no}>
                    <td className="num oi-sheet-no">{row.no}</td>
                    <td className="oi-sheet-prop">{row.prop}</td>
                    <td className="num oi-src-val">{row.val}</td>
                    <td className="oi-src-rem">{row.rem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              Licensed AGPL-3.0 — clubs may self-host without asking, and any hosted fork must
              publish its own source in turn.
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-split oi-split-even">
          <div>
            <span className="oi-kick">Why it matters for scoring</span>
            <hr className="oi-rule" />
            <h2 className="oi-h2 oi-h2-md">Every league scores a wide slightly differently</h2>
            <p className="oi-body oi-dim-strong">
              Byes off a wide. Whether a no-ball brings a free hit. Whether the last man bats alone.
              These are not edge cases in club cricket, they are Sunday.
            </p>
            <p className="oi-body oi-dim-strong">
              When the rule is in readable code rather than a support article, your league can point
              at the line, argue about it, and change it. That is a faster route to a correct
              scorebook than any feature request queue.
            </p>
          </div>
          <div>
            <span className="oi-kick">How to help</span>
            <hr className="oi-rule" />
            <div className="oi-ways">
              {WAYS.map((way) => (
                <div className="oi-way" key={way.no}>
                  <span className="num oi-way-no">{way.no}</span>
                  <div>
                    <div className="oi-way-title">{way.t}</div>
                    <div className="oi-way-body">{way.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">Self-hosting</span>
          <hr className="oi-rule oi-rule-lg" />
          <div className="oi-3">
            {SELF_HOST.map((item) => (
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
            <a className="btn btn-secondary oi-btn-md oi-btn-plain" href="/faq">
              FAQ
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
