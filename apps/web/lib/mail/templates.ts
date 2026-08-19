/**
 * Plain, low-spam-score mail templates.
 * Every message explains why it arrived and what to do if unrequested.
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

/** The confirmation code (no links for better deliverability). */
export function verifyCode(code: string, minutes: number): Omit<Mail, 'to'> {
  const body = `Type this into the app to confirm your address. It works for ${minutes} minutes.`;
  return {
    // Code in subject allows reading from notification preview.
    subject: `${code} is your Open Innings code`,
    text: [
      `Your confirmation code`,
      ``,
      code,
      ``,
      body,
      ``,
      `If you did not create an ${BRAND} account, ignore this — nothing was set up with your address, and no further mail will be sent to it.`,
    ].join('\n'),
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f2f2f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #d8d8da;padding:28px">
    <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#5980a6">${BRAND}</div>
    <h1 style="font-size:21px;line-height:1.25;margin:14px 0 12px;font-weight:600">Your confirmation code</h1>
    <div style="font-size:34px;letter-spacing:9px;font-weight:600;margin:18px 0;color:#1a1a1a">${code}</div>
    <p style="font-size:15px;line-height:1.55;margin:0 0 8px;color:#3a3a3c">${body}</p>
    <p style="font-size:12.5px;line-height:1.5;margin:18px 0 0;color:#6b6b70">
      If you did not create an ${BRAND} account, ignore this — nothing was set up with your address.
    </p>
  </div>
</body></html>`,
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
      // Reassurance that ignoring unrequested resets is safe.
      `If this was not you, ignore this email. Your password has not changed and the link expires on its own.`,
    ].join('\n'),
    html: shell(
      'Reset your password',
      `${body} If this was not you, ignore it — your password has not changed and the link expires on its own.`,
      { href: link, label: 'Choose a new password' },
    ),
  };
}
