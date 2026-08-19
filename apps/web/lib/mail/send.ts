/**
 * Send mail using Resend's REST API via fetch.
 * Returns success/failure status and never throws.
 * Logs mail body to console if API key is missing.
 */
import 'server-only';

const API = 'https://api.resend.com/emails';

/** Sender address. Must be on a verified domain. */
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

/** Send one message. Never throws. Requires both text and HTML parts. */
export async function send(mail: Mail): Promise<MailResult> {
  if (!API_KEY) {
    // The body carries a live six-digit code or a working reset link, and a
    // token printed to a log drain is a token anyone with log access can
    // spend. Outside development the message is that one was dropped, and
    // nothing about what was in it.
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        `[mail] RESEND_API_KEY is not set — dropped "${mail.subject}". ` +
          `Credentials are being issued that nobody can receive.`,
      );
    } else {
      console.warn(
        `[mail] RESEND_API_KEY is not set — not sending.\n` +
          `       to: ${mail.to}\n` +
          `       subject: ${mail.subject}\n` +
          `${mail.text.replace(/^/gm, '       ')}`,
      );
    }
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
      // 10 second timeout so slow third party doesn't hang signup.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Log rejection reason but don't leak it to client.
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
