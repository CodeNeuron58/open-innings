import type { Metadata } from 'next';
import Link from 'next/link';
import { Blueprint } from '@/components/marketing/blueprint';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Straight answers on money, signal, formats and what open source actually means for your club.',
};

/**
 * Ported from design_new/"FAQ.dc.html".
 *
 * The design drives its accordion from component state with a `+`/`−` mark.
 * Here it is native `<details>`/`<summary>`: no client boundary, no hydration,
 * works with JavaScript off, and screen readers and in-page find already
 * understand it. The mark is drawn in CSS off `[open]`.
 */

const GROUPS = [
  {
    title: 'Money',
    items: [
      {
        q: 'Is it actually free?',
        a: 'Yes. Every format, every screen, unlimited matches, and the live match link are in the free app. It is paid for by a banner ad on the scorecard and share screens. If you would rather not see it, ₹199 a year — or ₹49 a month — removes it.',
      },
      {
        q: 'Are there ads while I am scoring?',
        a: 'No. The scoring screen carries no ad in either plan. Mis-tapping a ball because an ad loaded under your thumb is how a scorebook goes wrong, so that screen is left alone.',
      },
      {
        q: 'What happens if I stop paying?',
        a: 'The app carries on. You lose nothing but the quiet — ads come back on the card and share screens, and your matches, squads and history stay exactly where they were.',
      },
      {
        q: 'Is there a free trial, or a discount for clubs?',
        a: 'The free plan is the trial, and it never expires. Club and league pricing is not built yet; if you need to cover a dozen scorers, open an issue and say so — that is how it gets prioritised.',
      },
    ],
  },
  {
    title: 'At the ground',
    items: [
      {
        q: 'Do I need a signal to score?',
        a: 'Not ball by ball, any more. Every tap is saved on the phone first and shown on the screen straight away, and the queue drains to the server when there is signal — so a dropped connection at the ground does not stop scoring. What still needs a signal is starting a match, opening an innings and making corrections, and the live link for spectators only moves when the queue can send. Sync catches up in order, and the server refuses anything that would double-count a ball.',
      },
      {
        q: 'Can two people score the same match?',
        a: 'One device owns the ball log at a time, which is deliberate — two scorers entering the same over is how you get a wrong total. You can pick the match up on another device signed in to the same account. Handing it to a different person is not built yet; a match belongs to whoever created it.',
      },
      {
        q: 'How fast is it really?',
        a: 'One tap for a normal ball. Two if it is an extra: arm the modifier, tap the runs. Three for a wicket, because a dismissal needs its type and the fielder. That is the whole interaction.',
      },
      {
        q: 'What if I get a ball wrong?',
        a: 'Undo, on screen, always. Every number in the app is derived from the ball log rather than stored separately, so removing a ball corrects the card, the commentary, the bowler’s figures and the live feed at once.',
      },
    ],
  },
  {
    title: 'Cricket and code',
    items: [
      {
        q: 'Which formats can I score?',
        a: 'Limited-overs cricket of any innings length — T20, ODI, T10, and the 13 overs you actually agreed at the toss. That is one format parameterised by length rather than a list, which is why a club game scores exactly like a T20 and the console never changes. Test and multi-day, the Hundred and box cricket are not supported: each is a different scoring model rather than a different length, so they are on the roadmap rather than in the app.',
      },
      {
        q: 'Can people follow without installing anything?',
        a: 'Yes. Each match has a link that opens in a browser and updates ball by ball. Send it to the club group once and everyone — parents, the next batter, a coach at another ground — is on the same over as you.',
      },
      {
        q: 'Can I get my data out?',
        a: 'Every match exports as a scorecard file and as a share image. Because everything is derived from the ball log, the export is the whole match, not a summary.',
      },
      {
        q: 'What does open source mean in practice?',
        a: 'The app source is public under AGPL-3.0. You can read exactly how a wide is charged, open an issue when your league scores it differently, send a fix, or run the whole thing on your own host for your club. Nothing is behind a licence key.',
      },
    ],
  },
] as const;

/**
 * Questions are numbered continuously across all three groups, so each one's
 * number depends on how many came before it. Derived once at module scope
 * rather than counted with a mutable variable during render — that would be a
 * write after render completes, and the numbers would drift on re-render.
 */
const NUMBERED_GROUPS = GROUPS.map((group, gi) => ({
  title: group.title,
  items: group.items.map((item, ii) => ({
    ...item,
    no: String(GROUPS.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0) + ii + 1).padStart(
      2,
      '0',
    ),
  })),
}));

export default function FaqPage() {
  return (
    <>
      <section className="oi-sec oi-sec-top">
        <div className="oi-in">
          <span className="oi-kick">Questions</span>
          <hr className="oi-rule" />
          <h1 className="oi-h1 oi-h1-sub oi-h1-tight">
            Before you
            <br />
            download it
          </h1>
          <p className="oi-lede oi-lede-mid">
            Straight answers on money, signal, formats and what open source actually means for your
            club.
          </p>
        </div>
      </section>

      <section className="oi-sec oi-sec-pad-lg">
        <div className="oi-in oi-faq">
          <div>
            {NUMBERED_GROUPS.map((group, gi) => (
              <div className="oi-faq-group" key={group.title}>
                <span className="oi-kick">{group.title}</span>
                <div className="oi-faq-list">
                  {group.items.map((item, ii) => (
                    <details
                      className="oi-faq-item"
                      key={item.q}
                      // The very first answer starts open, so the pattern is
                      // obvious without anyone having to tap to discover it.
                      open={gi === 0 && ii === 0}
                    >
                      <summary className="oi-faq-q">
                        <span className="num oi-faq-no">{item.no}</span>
                        <span className="oi-faq-text">{item.q}</span>
                        <span className="num oi-faq-mark" aria-hidden />
                      </summary>
                      <p className="oi-faq-a">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Blueprint className="oi-faq-aside">
            <span className="oi-kick">Still stuck</span>
            <p className="oi-faq-aside-body">
              Scoring questions belong in the issue tracker — they usually turn into a fix. Billing
              questions go to email.
            </p>
            <div className="oi-faq-aside-actions">
              <a
                className="btn btn-secondary oi-faq-aside-btn oi-btn-plain"
                href="https://github.com/CodeNeuron58/open-innings/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open an issue
              </a>
              <Link className="btn btn-secondary oi-faq-aside-btn oi-btn-plain" href="/pricing">
                See pricing
              </Link>
            </div>
            <div className="oi-faq-aside-rule" />
            <span className="oi-kick oi-faq-aside-kick">One line summary</span>
            <p className="oi-faq-aside-body oi-faq-aside-last">
              Free app, ads only on the screens where you are reading, ₹199 a year to remove them,
              source in the open.
            </p>
          </Blueprint>
        </div>
      </section>
    </>
  );
}
