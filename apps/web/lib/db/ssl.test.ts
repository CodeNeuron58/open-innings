/**
 * Whether a Postgres connection negotiates TLS.
 *
 * A one-function file that decides whether credentials cross a network in
 * clear text, chosen in code rather than in the URL because Heroku rewrites
 * DATABASE_URL on credential rotation. It had no test.
 */
import { describe, it, expect } from 'vitest';
import { sslFor, isLocalConnection } from './ssl';

describe('sslFor', () => {
  it('does not negotiate TLS for a database on this machine', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']) {
      expect(sslFor(`postgresql://postgres:postgres@${host}:5432/open_innings`)).toBe(false);
    }
  });

  it('negotiates TLS for anything that is not this machine', () => {
    expect(sslFor('postgresql://u:p@db.example.com:5432/app')).toBe('require');
    expect(sslFor('postgresql://u:p@10.0.0.7:5432/app')).toBe('require');
  });

  it('honours an explicit sslmode=disable, even remotely', () => {
    // Somebody who wrote this against a remote host meant it.
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=disable')).toBe(false);
  });

  it('treats an unparseable string as local rather than failing the handshake', () => {
    // A malformed URL fails loudly on connect; defaulting to TLS here would
    // turn a typo into a confusing handshake error instead of a clear one.
    expect(sslFor('not a url at all')).toBe(false);
    expect(sslFor('')).toBe(false);
  });

  it('a local host with an explicit sslmode still honours the flag', () => {
    expect(sslFor('postgresql://u:p@localhost:5432/app?sslmode=require')).toBe('require');
  });

  /*
   * `verify-ca` and `verify-full` now verify.
   *
   * This test previously pinned the opposite, with a comment calling the
   * behaviour "known, and not obviously right": every sslmode other than
   * `disable` collapsed to postgres.js's 'require', which negotiates TLS and
   * does NOT check the certificate chain. So the strictest setting there is —
   * about as deliberate an act as this file sees — silently produced an
   * unverified connection, and nothing said so.
   *
   * The old argument for it was that a provider-managed database on a private
   * network presents a self-signed certificate, so verification fails and the
   * choice is unverified-or-nothing. That holds, and it is still the default
   * for a bare host and for a plain `sslmode=require`. What it does not
   * justify is overriding somebody who asked for verification by name.
   */
  it('verify-ca and verify-full ask for a checked certificate chain', () => {
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=verify-full')).toEqual({
      rejectUnauthorized: true,
    });
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=verify-ca')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('still negotiates unverified TLS for a plain sslmode=require', () => {
    // Unchanged, and the escape hatch for a self-signed provider certificate.
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=require')).toBe('require');
  });

  it('a bare remote host still defaults to unverified TLS', () => {
    // The Heroku case. Nobody stated a preference, so the module picks the one
    // that connects.
    expect(sslFor('postgresql://u:p@db.example.com:5432/app')).toBe('require');
  });
});

/**
 * The guard in front of DROP DATABASE.
 *
 * `reset.ts` asked `url.includes('localhost')`, a substring test against the
 * whole connection string. A username, password, query string or database name
 * containing "localhost" passed it, and the script then dropped a remote
 * database. These are the strings that used to get through.
 */
describe('isLocalConnection', () => {
  it('accepts the local hosts, including bracketed IPv6', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']) {
      expect(isLocalConnection(`postgresql://u:p@${host}:5432/open_innings`)).toBe(true);
    }
  });

  it('rejects a remote host whose USERNAME contains localhost', () => {
    expect(isLocalConnection('postgresql://localhost:pw@prod.example.com:5432/oi')).toBe(false);
  });

  it('rejects a remote host whose PASSWORD contains localhost', () => {
    expect(isLocalConnection('postgresql://u:localhost99@prod.example.com/oi')).toBe(false);
  });

  it('rejects a remote host whose DATABASE NAME contains localhost', () => {
    expect(isLocalConnection('postgresql://u:p@prod.example.com/localhost_staging')).toBe(false);
  });

  it('rejects a remote host with localhost in the query string', () => {
    expect(
      isLocalConnection('postgresql://u:p@prod.example.com/oi?application_name=localhost-tunnel'),
    ).toBe(false);
  });

  it('fails CLOSED on an unparseable url, unlike the substring version', () => {
    expect(isLocalConnection('not a url at all')).toBe(false);
  });
});
