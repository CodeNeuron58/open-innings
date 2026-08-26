/**
 * Facts about this deployment that appear in more than one place on the site.
 *
 * A constant rather than an environment variable, deliberately. These are
 * public, they are the same in every environment, and they are the kind of
 * thing that should change in a commit somebody can read rather than in a
 * dashboard nobody remembers editing. An address that differs between preview
 * and production is an address that is wrong in one of them.
 */

/**
 * Where to write about your data.
 *
 * On `/privacy` and `/delete-account`, and it goes into the Play listing and
 * the Data Safety form. It was hardcoded in both pages, which is exactly how a
 * contact address ends up updated in one and stale in the other — and a stale
 * one on a deletion page is a person who cannot get their account removed.
 *
 * **Three things have to be true of whatever goes here**, and they are worth
 * stating because the obvious choices fail them:
 *
 *   1. **Somebody reads it.** Play requires a working contact, and a deletion
 *      request arriving at an unmonitored mailbox is a policy violation as
 *      well as a broken promise.
 *   2. **It is not a personal address.** It is published on a public page and
 *      in a store listing, and it cannot be taken back once indexed.
 *   3. **It can receive.** `no-reply@openinnings.com` sends through Resend but
 *      nothing is listening on the other end — Resend's "Enable Receiving" is
 *      deliberately off. A send-only domain address here would look right and
 *      silently swallow every message.
 *
 * Free way to satisfy all three: Cloudflare Email Routing on the zone that
 * already hosts this domain, forwarding to a real inbox. It adds MX records at
 * the apex, which does not collide with Resend's MX on `send.openinnings.com`.
 *
 * That is what is set up, as of 27 August 2026. Cloudflare Email Routing holds
 * the apex MX and forwards `support@` to a monitored Gmail; Resend keeps
 * `send.openinnings.com` and is untouched by it. Verified by sending to this
 * address from outside and watching it arrive.
 *
 * It receives only. Replying as `support@openinnings.com` needs an SMTP sender
 * configured separately — Email Routing cannot send.
 */
export const CONTACT_EMAIL = 'support@openinnings.com';

/** `mailto:` form, so pages do not each build their own. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
