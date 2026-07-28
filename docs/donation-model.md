# Donation model

Open Innings is **free forever** — no ads, no paywalls, no "premium" tier, no
"contact us for pricing". Inspired by [Lichess](https://lichess.org/about),
we run entirely on community donations.

This document explains how that works, where the money goes, and how you can
help.

## How funding works

We accept donations through two platforms. Both publish every transaction
transparently.

### Open Collective

<https://opencollective.com/open-innings>

- Designed for open-source projects
- Issues invoices for corporate donations (useful for employer matching)
- Provides legal entity + accounting in many jurisdictions
- Funds are released to project expenses, not to individuals

### Liberapay

<https://liberapay.com/open-innings>

- Recurring donations, no fees on small amounts
- Tip-the-dev style
- Better for individual donors

### Why both?

Different platforms serve different donors. Open Collective is better for
companies and EU-based donors (invoicing). Liberapay is better for
individuals donating small amounts. Having both maximises the chances of
reaching our funding goals.

## Where the money goes

All expenses are public. Expected annual costs at various scales:

| Scale | Monthly cost | What |
|---|---|---|
| **0–1,000 users** | ~$1 (domain only) | One Oracle Cloud Free Tier VM, self-hosted app + Postgres, Cloudflare free CDN in front. See [deployment.md](deployment.md) for the sizing math. |
| **1k–10k users** | TBD, likely still small | Free VM probably still covers it — revisit if storage or CPU actually gets tight, not before |
| **10k–100k users** | TBD | A paid VM tier, or splitting app and DB onto separate instances |
| **100k+ users** | TBD | Dedicated DB, read replicas, monitoring, contractor support |

**We will never spend donations on:**

- Founders' salaries (until/unless we're a registered non-profit with payroll)
- Marketing campaigns or paid ads
- Crypto, NFTs, or speculative investments
- Anything that compromises user privacy

**We will spend donations on:**

- Hosting, databases, storage, CDN
- Domain registration + SSL
- Design work (if volunteer design isn't available)
- Security audits (when we can afford them)
- Legal advice (entity formation, GDPR compliance)
- Bounties for important bug fixes (once established)

## Long-term sustainability

The Lichess model has worked since 2010:

1. **Year 1–2:** out-of-pocket, donations trickle in
2. **Year 2–3:** donations cover hosting
3. **Year 3+:** donations cover hosting + part-time maintainer
4. **Year 5+:** donations cover hosting + multiple maintainers + legal entity

We're at step 0. We have a long road ahead, and the first 12 months of
hosting will likely come out of pocket.

## What we will NOT do

To be crystal clear, in case it's not already:

- ❌ No ads. Ever.
- ❌ No "premium tier" that locks existing features.
- ❌ No selling user data (we have none anyway — see [privacy.md](privacy.md)).
- ❌ No corporate ownership. This is a community project, period.
- ❌ No feature paywalls, no "contact us for enterprise pricing".

## Donate

→ <https://opencollective.com/open-innings>
→ <https://liberapay.com/open-innings>

Even $1/month helps. Even sharing the link to your cricket club helps.

If your company is interested in sponsoring (logo on README, mention in
release notes, etc.), email <sponsor@open-innings.app>.

---

Thank you for believing free software matters. 🙏
