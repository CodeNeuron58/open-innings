/**
 * The two messages this app sends.
 *
 * Both are deliberately plain. A transactional email from a domain with no
 * sending reputation — which this one has, on day one — lands in spam far more
 * often when it carries images, tracking pixels, webfonts and a table layout.
 * The HTML here is a handful of inline styles and one link, and it is not a
 * design decision so much as a deliverability one.
 *
 * Every message states **why it arrived** and **what to do if you did not ask
 * for it**. That is the difference between a confirmation and a phishing mail,
 * from the point of view of somebody who has just received one unexpectedly.
 */
import type { Mail } from './send';

const BRAND = 'Open Innings';

/** One link, one sentence, no images. */
function shell(heading: string, body: string, action: { href: string; label: string }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f2f2f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #d8d8da;padding:28px">
    <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#5980a6">${BRAND}</div>
    <h1 style="font-size:21px;line-height:1.25;margin:14px 0 12px;font-weight:600">${heading}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px;color:#3a3a3c">${body}</p>
    <a href="${action.href}" style="display:inline-block;background:#5980a6;color:#ffffff;text-decoration:none;padding:12px 20px;font-size:14px;letter-spacing:.4px">${action.label}</a>
    <p style="font-size:12.5px;line-height:1.5;margin:22px 0 0;color:#6b6b70">
      Or paste this into your browser:<br>
      <span style="word-break:break-all;color:#5980a6">${action.href}</span>
    </p>
  </div>
</body></html>`;
}

export function verifyEmail(link: string, hours: number): Omit<Mail, 'to'> {
  const body = `Confirm this address so you can reset your password if you ever lose it. The link works for ${hours} hours.`;
  return {
    subject: `Confirm your email — ${BRAND}`,
    text: [
      `Confirm your email`,
      ``,
      body,
      ``,
      link,
      ``,
      `If you did not create an ${BRAND} account, ignore this — nothing was set up with your address, and no further mail will be sent to it.`,
    ].join('\n'),
    html: shell(
      'Confirm your email',
      `${body} If you did not create an ${BRAND} account, ignore this — nothing was set up with your address.`,
      { href: link, label: 'Confirm email' },
    ),
  };
}

export function resetPassword(link: string, minutes: number): Omit<Mail, 'to'> {
  const body = `Somebody asked to reset the password on this account. The link works once, and for ${minutes} minutes.`;
  return {
    subject: `Reset your password — ${BRAND}`,
    text: [
      `Reset your password`,
      ``,
      body,
      ``,
      link,
      ``,
      // The reassurance that matters on a reset mail specifically: an
      // unrequested one is alarming, and the useful thing to say is that
      // ignoring it is safe and sufficient.
      `If this was not you, ignore this email. Your password has not changed and the link expires on its own.`,
    ].join('\n'),
    html: shell(
      'Reset your password',
      `${body} If this was not you, ignore it — your password has not changed and the link expires on its own.`,
      { href: link, label: 'Choose a new password' },
    ),
  };
}
