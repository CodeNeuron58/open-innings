/**
 * Whether a Postgres connection needs TLS, and how strictly.
 *
 * Every managed Postgres — Heroku's included — refuses an unencrypted
 * connection. Most of them also present a **self-signed** certificate, so
 * full verification fails against them: the choice is encrypted-but-
 * unverified, or no connection at all.
 *
 * `ssl: 'require'` in postgres.js is exactly that — negotiate TLS, do not
 * verify the chain. It is the right setting for a provider-managed database
 * on a private network and the wrong one for anything reached over the open
 * internet, which this is not.
 *
 * ## Why this is not just `?sslmode=require` on the URL
 *
 * Heroku owns `DATABASE_URL` and rewrites it whenever it rotates the
 * database's credentials. A query string appended by hand disappears the
 * first time that happens, and the app stops connecting for reasons nobody
 * remembers. Deciding here means the rule survives rotation.
 */
export type SslSetting = 'require' | false;

/** Hosts that are this machine, where TLS is neither available nor useful. */
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function sslFor(connectionString: string): SslSetting {
  // An explicit choice in the URL wins — someone who wrote `sslmode=disable`
  // against a remote host meant it, and someone who wrote `sslmode=require`
  // does not need this to agree.
  if (/[?&]sslmode=disable\b/i.test(connectionString)) return false;
  if (/[?&]sslmode=/i.test(connectionString)) return 'require';

  try {
    const host = new URL(connectionString).hostname;
    return LOCAL.has(host) ? false : 'require';
  } catch {
    // Unparseable. Assume local, because a malformed URL in production will
    // fail loudly on connect anyway, and defaulting to TLS here would turn a
    // typo into a confusing handshake error instead of a clear one.
    return false;
  }
}
