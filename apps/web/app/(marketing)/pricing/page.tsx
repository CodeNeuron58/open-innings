import type { Metadata } from 'next';
import { Blueprint, BlueprintLink, BlueprintButton } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Free with ads, ₹99/month without, or self-host for nothing. There is no pro tier of cricket — the subscription buys quiet and changes nothing else.',
};

/** Ported from design_new/"Pricing.dc.html". */

const Y = '✓';
const N = '—';

const PLANS = [
  {
    kicker: 'Free',
    price: '₹0',
    unit: 'forever',
    lines: [
      'Any innings length',
      'Unlimited matches and squads',
      'Live links for spectators',
      'Full scorecard, commentary, export',
    ],
    muted: 'A banner ad on the card and share screens',
    cta: { label: 'Get the app', href: '/app' as const },
  },
  {
    kicker: 'Self-hosted',
    price: 'Yours',
    unit: null,
    lines: [
      'Run the whole thing yourself',
      'No ads, because there is no ad server',
      "Your league's data on your own host",
      'Build from source for Android or iOS',
    ],
    muted: 'Community support only',
    cta: { label: 'Read the docs', href: '/open-source' as const },
  },
] as const;

const COMPARISON = [
  { f: 'Ball-by-ball scoring, any innings length', free: Y, pro: Y, self: Y },
  { f: 'Unlimited matches, squads and seasons', free: Y, pro: Y, self: Y },
  { f: 'Full scorecard and over-by-over commentary', free: Y, pro: Y, self: Y },
  { f: 'Live match link (no app needed to watch)', free: Y, pro: Y, self: Y },
  { f: 'Share card and scorebook export', free: Y, pro: Y, self: Y },
  { f: 'Ads while scoring', free: N, pro: N, self: N },
  { f: 'Ads on the card and share screens', free: Y, pro: N, self: N },
  { f: 'Works on every device you sign in on', free: Y, pro: Y, self: Y },
  { f: 'Your data on your own host', free: N, pro: N, self: Y },
  { f: 'Support', free: 'Community', pro: 'Email', self: 'Community' },
] as const;

export default function PricingPage() {
  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Pricing</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
            One paid thing:
            <br />
            the ads go away
          </h1>
          <p className="oi-lede oi-lede-wide">
            There is no pro tier of cricket. Every format, every screen, every export and the live
            match link are in the free app. The subscription buys quiet — nothing else changes.
          </p>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in oi-3">
          <Blueprint className="oi-plan">
            <span className="oi-kick oi-plan-kicker">{PLANS[0].kicker}</span>
            <div className="oi-plan-price">
              <span className="num oi-plan-amount">{PLANS[0].price}</span>
              <span className="oi-plan-unit">{PLANS[0].unit}</span>
            </div>
            <div className="oi-plan-lines">
              {PLANS[0].lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div className="oi-plan-muted">{PLANS[0].muted}</div>
            </div>
            <a className="btn btn-secondary oi-plan-cta oi-btn-plain" href={PLANS[0].cta.href}>
              {PLANS[0].cta.label}
            </a>
          </Blueprint>

          {/* The paid plate is the one reversed field on the page — steel as
              ground, type in paper. Its button inverts to match. */}
          <Blueprint className="oi-plan oi-plan-dark">
            <span className="oi-kick oi-plan-kicker oi-plan-kicker-dark">Ad-free</span>
            <div className="oi-plan-price">
              <span className="num oi-plan-amount">₹99</span>
              <span className="oi-plan-unit oi-plan-unit-dark">per month</span>
            </div>
            <div className="oi-plan-lines">
              <div>Everything in Free</div>
              <div>No ads on any screen</div>
              <div>Covers every device you sign in on</div>
              <div className="oi-plan-muted-dark">Cancel any time; runs to the end of the term</div>
            </div>
            <BlueprintButton type="button" className="btn btn-primary oi-plan-cta oi-plan-cta-dark">
              Go ad-free
            </BlueprintButton>
          </Blueprint>

          <Blueprint className="oi-plan">
            <span className="oi-kick oi-plan-kicker">{PLANS[1].kicker}</span>
            <div className="oi-plan-price">
              <span className="num oi-plan-amount">{PLANS[1].price}</span>
            </div>
            <div className="oi-plan-lines">
              {PLANS[1].lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div className="oi-plan-muted">{PLANS[1].muted}</div>
            </div>
            <a className="btn btn-secondary oi-plan-cta oi-btn-plain" href={PLANS[1].cta.href}>
              {PLANS[1].cta.label}
            </a>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <span className="oi-kick">Line by line</span>
          <hr className="oi-rule oi-rule-sm" />
          <Blueprint>
            <table className="oi-cmp-table table">
              <thead>
                <tr>
                  <th>What you get</th>
                  <th className="oi-cmp-col">Free</th>
                  <th className="oi-cmp-col oi-cmp-col-pro">₹99/mo</th>
                  <th className="oi-cmp-col oi-cmp-hide">Self-hosted</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.f}>
                    <td className="oi-cmp-feature">{row.f}</td>
                    <td className="num oi-cmp-cell">{row.free}</td>
                    <td className="num oi-cmp-cell oi-cmp-cell-pro">{row.pro}</td>
                    <td className="num oi-cmp-cell oi-cmp-hide">{row.self}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="oi-sheet-foot">
              Prices in Indian rupees, billed monthly. No annual lock-in, no per-match fees, no
              charge for people opening your link.
            </p>
          </Blueprint>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-xl">
        <div className="oi-in">
          <Blueprint className="oi-panel">
            <span className="oi-kick">Why ads at all</span>
            <h2 className="oi-h2 oi-h2-sentence">
              Somebody has to pay for the servers that carry your live link. We would rather it be
              an ad you can switch off than a feature we hold back.
            </h2>
            <p className="oi-panel-body">
              The ad never appears while you are scoring — only on the scorecard and share screens,
              where you are reading rather than tapping. If that bothers you, ₹99 removes it. If
              money is the problem, self-host and pay nothing at all.
            </p>
            <div className="oi-cta-row">
              <BlueprintLink href="/app" className="btn btn-primary oi-btn-md">
                Get the app
              </BlueprintLink>
              <a className="btn btn-ghost oi-btn-md oi-btn-ghost" href="/faq">
                Read the FAQ
              </a>
            </div>
          </Blueprint>
        </div>
      </section>
    </>
  );
}
