/**
 * Whether a Postgres connection negotiates TLS.
 *
 * A one-function file that decides whether credentials cross a network in
 * clear text, chosen in code rather than in the URL because Heroku rewrites
 * DATABASE_URL on credential rotation. It had no test.
 */
import { describe, it, expect } from 'vitest';
import { sslFor } from './ssl';

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
   * ⚠️ Documents a real weakness rather than endorsing it.
   *
   * Every sslmode other than `disable` collapses to postgres.js's 'require',
   * which negotiates TLS and does NOT verify the certificate chain. So a
   * connection string that explicitly asks for `verify-full` — the strictest
   * setting there is, and a deliberate act — silently gets an unverified
   * connection instead.
   *
   * That is defensible for a provider-managed database on a private network,
   * which is what the module's own comment argues and what this deployment
   * is. It is wrong for anything reached over the open internet, and someone
   * writing verify-full has said which of those they think they have.
   *
   * Pinned so the downgrade is a visible, deliberate line in a test rather
   * than an accident nobody has read.
   */
  it('downgrades verify-full to unverified TLS — known, and not obviously right', () => {
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=verify-full')).toBe('require');
    expect(sslFor('postgresql://u:p@db.example.com:5432/app?sslmode=verify-ca')).toBe('require');
  });
});
