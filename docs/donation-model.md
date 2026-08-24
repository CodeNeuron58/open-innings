# Funding & Sustainability Model

Open Innings is **AGPL-3.0 open source and free forever** — every cricket scoring rule, tournament format, career stat, scorebook export, and live web link is completely free with zero feature paywalls.

This document explains our sustainability roadmap, how early bootstrapping is funded, where money goes, and how you can help.

---

## 1. The Core Philosophy

1. **No Feature Paywalls**: Every single capability is available to every user and club. We will never lock features behind a "pro" tier or enterprise contract.
2. **The Scorer is Never the Toll**: Scoring a 3-hour match takes effort and concentration. The live scoring console is strictly ad-free, and match creators are completely exempt from ads on their owned scorecards.
3. **Self-Hosting Freedom**: Any club or league can clone the repository and run their own backend and frontend, 100% ad-free, without paying a dime.

---

## 2. Bootstrapping vs. Long-Term Destination

### Phase 1: Bootstrap & Early Sustainability (Years 1–2)

During early growth, server infrastructure (database, CDN, live WebSocket/polling, OpenGraph image generation) incurs real ongoing costs:

- **Non-Intrusive Viewer Banners**: Passive AdMob banner ads on public viewer scorecard screens (`card`, `cards`, `share`) for non-owner spectators.
- **Supporter In-App Subscription**: An optional ₹49/month or ₹199/year subscription (via Google Play / RevenueCat) for community members who want an ad-free spectator experience and wish to support hosting costs.

### Phase 2: Fully Community & Donation-Funded (Lichess Model)

As community adoption grows and recurring donations on Open Collective / Liberapay cover 100% of server infrastructure and maintenance costs, our explicit roadmap is to deprecate in-app advertising entirely and run 100% on community donations.

---

## 3. How Funding Works

We accept direct community donations through two transparent platforms:

### Open Collective

<https://opencollective.com/open-innings>

- Designed for open-source projects
- Issues invoices for corporate donations (useful for employer matching)
- Provides legal entity + accounting in many jurisdictions
- Funds are released to project expenses, not to individuals

### Liberapay

<https://liberapay.com/open-innings>

- Recurring donations with zero platform fees on small amounts
- Direct supporter donations

---

## 4. Where the Money Goes

All expenses are public. Expected annual costs at various scales:

| Scale              | Monthly cost            | What                                                                                                                                             |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0–1,000 users**  | ~$1 (domain only)       | One Oracle Cloud Free Tier VM, self-hosted app + Postgres, Cloudflare free CDN in front. See [deployment.md](deployment.md) for the sizing math. |
| **1k–10k users**   | TBD, likely still small | Free VM probably still covers it — revisit if storage or CPU actually gets tight, not before                                                     |
| **10k–100k users** | TBD                     | A paid VM tier, or splitting app and DB onto separate instances                                                                                  |
| **100k+ users**    | TBD                     | Dedicated DB, read replicas, monitoring, contractor support                                                                                      |

**We will spend funds on:**

- Hosting, databases, storage, SSL, and domain registration
- **Maintainer stipends**: Fair compensation for the open-source maintainers investing hundreds of hours into development, bug fixes, engine accuracy, and support
- Design, accessibility work, and security reviews
- Bounties for critical open-source contributions and bug fixes

**We will never spend funds on:**

- Bloated executive salaries or speculative corporate investments
- Paid advertising or marketing campaigns to buy vanity metrics
- Crypto, NFTs, or speculative assets
- Anything that compromises user privacy or sells data

---

## 5. What We Will NOT Do

To be crystal clear:

- ❌ No ads during live scoring — ever.
- ❌ No ads for the person who scored the match.
- ❌ No "premium tier" that locks existing features.
- ❌ No selling user data (we collect minimal operational data — see [privacy.md](privacy.md)).
- ❌ No corporate lock-in — the full codebase remains AGPL-3.0.
- ❌ No feature paywalls, no "contact us for enterprise pricing".

## Donate

→ <https://opencollective.com/open-innings>
→ <https://liberapay.com/open-innings>

Even $1/month helps. Even sharing the link to your cricket club helps.

If your company is interested in sponsoring (logo on README, mention in
release notes, etc.), email <sponsor@open-innings.app>.

---

Thank you for believing free software matters. 🙏
