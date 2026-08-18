/**
 * Sending mail, through Resend's REST API.
 *
 * ## Why no SDK
 *
 * One `fetch` to one endpoint. The `resend` package would add a dependency,
 * a version to keep current, and a bundle to a Next server that already has
 * `fetch` — in exchange for wrapping a POST. This project has already lost a
 * day to a dependency that was present but undeclared; the cheapest dependency
 * is the one not taken.
 *
 * ## Why it degrades instead of throwing
 *
 * Mail is the one thing here that depends on somebody else's uptime and on a
 * DNS record propagating. If a send failing took signup down with it, an
 * outage at a mail provider would stop a scorer opening an account at a
 * ground — for the sake of a confirmation they did not need in that moment.
 *
 * So `send` reports whether it worked and never throws. Callers decide, and
 * for signup the decision is: create the account anyway.
 *
 * ## Why the link is logged when there is no key
 *
 * Without `RESEND_API_KEY` — a fresh clone, a local database, a preview
 * environment — this logs the message instead of sending it. That is not a
 * stub standing in for the real thing: it is what makes the whole flow
 * testable before a domain is verified, and it is deliberately loud rather
 * than silent, because a send that quietly does nothing is the failure mode
 * that reaches a tester as "the email never arrived".
 */
import 'server-only';

const API = 'https://api.resend.com/emails';

/**
 * Who the mail comes from.
 *
 * Must be on a domain verified with Resend, or every send is rejected. The
 * default matches the apex this app already serves from, so the only setup
 * left is the DNS records.
 */
const FROM = process.env.MAIL_FROM ?? 'Open Innings <no-reply@openinnings.com>';
const API_KEY = process.env.RESEND_API_KEY;

/** True when mail can actually leave the building. */
export const mailConfigured = Boolean(API_KEY);

export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'rejected' | 'unreachable'; detail?: string };

export type Mail = {
  to: string;
  subject: string;
  /** Both, always — see below. */
  text: string;
  html: string;
};

/**
 * Send one message. Never throws.
 *
 * Both a text and an HTML body on every message, and not for tidiness: a
 * mail with only HTML scores worse with spam filters, and the text part is
 * what a screen reader, a watch, and a preview pane actually read. For a
 * domain with no sending reputation — which this one has — that difference
 * decides whether a confirmation lands in the inbox or in spam.
 */
export async function send(mail: Mail): Promise<MailResult> {
  if (!API_KEY) {
    // Loud on purpose. The link is here so the flow can be walked end to end
    // locally, and so a misconfigured deploy is obvious in the logs rather
    // than presenting as mail that never arrives.
    console.warn(
      `[mail] RESEND_API_KEY is not set — not sending.\n` +
        `       to: ${mail.to}\n` +
        `       subject: ${mail.subject}\n` +
        `${mail.text.replace(/^/gm, '       ')}`,
    );
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      // A scorer waiting on a signup response must not wait on a slow third
      // party. Ten seconds is generous for one API call and short enough that
      // a hung provider does not hold a request open.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // The body carries Resend's reason — an unverified domain, a bad
      // address — and it belongs in the log, never in a response to the
      // client, where it would confirm whether an address exists.
      const detail = await res.text().catch(() => '');
      console.error(`[mail] rejected (${res.status}) for ${mail.subject}: ${detail.slice(0, 400)}`);
      return { ok: false, reason: 'rejected', detail: String(res.status) };
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? null };
  } catch (error) {
    console.error('[mail] unreachable', error);
    return { ok: false, reason: 'unreachable' };
  }
}
