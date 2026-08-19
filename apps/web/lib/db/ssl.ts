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
export type SslSetting = 'require' | false | { rejectUnauthorized: true };

/** Hosts that are this machine, where TLS is neither available nor useful. */
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * The hostname, with any IPv6 brackets taken off.
 *
 * `new URL('postgresql://u:p@[::1]:5432/db').hostname` is `[::1]`, brackets
 * included, so the bare `::1` in the set above could never match it and IPv6
 * loopback was the one local address treated as remote. That asked a local
 * Postgres for TLS it does not offer, and the connection was refused.
 */
function bareHost(url: URL): string {
  const h = url.hostname;
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
}

/**
 * Whether a connection string points at this machine.
 *
 * Exported because the destructive scripts need exactly this question and
 * were answering it with `url.includes('localhost')`, which is a substring
 * test against the *whole* string — username, password, database name and
 * query string included. All of these passed it and then dropped a remote
 * database:
 *
 *   postgres://localhost:pw@prod.example.com/oi      (username)
 *   postgres://u:localhost99@prod.example.com/oi     (password)
 *   postgres://u:p@prod.example.com/localhost_stage  (database name)
 *
 * An unparseable URL is **not** local. The substring version failed open
 * here, which is the wrong direction for a guard in front of DROP DATABASE.
 */
export function isLocalConnection(connectionString: string): boolean {
  try {
    return LOCAL.has(bareHost(new URL(connectionString)));
  } catch {
    return false;
  }
}

export function sslFor(connectionString: string): SslSetting {
  // An explicit choice in the URL wins — someone who wrote `sslmode=disable`
  // against a remote host meant it, and someone who wrote `sslmode=require`
  // does not need this to agree.
  if (/[?&]sslmode=disable\b/i.test(connectionString)) return false;

  /*
   * `verify-ca` and `verify-full` mean verify, and now do.
   *
   * Every `sslmode` other than `disable` used to collapse to postgres.js's
   * `'require'`, which negotiates TLS and does **not** check the certificate
   * chain — the equivalent of `rejectUnauthorized: false`. So a connection
   * string ending `?sslmode=verify-full`, the strictest setting there is and
   * about as deliberate an act as exists in this file, silently got an
   * unverified connection. Nothing logged it, and the difference is invisible
   * until somebody is between you and the database.
   *
   * These two now fail closed: a self-signed certificate is refused rather
   * than accepted quietly. That is the point of asking for them, and anyone
   * who wants encryption without verification can still write
   * `sslmode=require`, which is what it means.
   */
  if (/[?&]sslmode=verify-(ca|full)\b/i.test(connectionString)) {
    return { rejectUnauthorized: true };
  }

  if (/[?&]sslmode=/i.test(connectionString)) return 'require';

  try {
    return LOCAL.has(bareHost(new URL(connectionString))) ? false : 'require';
  } catch {
    // Unparseable. Assume local, because a malformed URL in production will
    // fail loudly on connect anyway, and defaulting to TLS here would turn a
    // typo into a confusing handshake error instead of a clear one.
    return false;
  }
}
