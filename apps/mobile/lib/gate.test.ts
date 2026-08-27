/**
 * The signed-in gate.
 *
 * Verification became mandatory here, and the failure modes of a gate are all
 * quiet ones: a loop that redirects to itself, a cold start that throws a
 * signed-in user back to the welcome screen, or a locked door left ajar.
 */
import { describe, it, expect } from 'vitest';
import { gateFor, type GateInput } from './gate';

const verified = { emailVerifiedAt: '2026-08-27T00:00:00.000Z' };
const unverified = { emailVerifiedAt: null };

const gate = (over: Partial<GateInput> = {}) =>
  gateFor({ user: null, isGuest: false, isLoading: false, onVerifyScreen: false, ...over });

describe('while the session is still resolving', () => {
  it('waits, rather than guessing', () => {
    expect(gate({ isLoading: true })).toBe('loading');
    // `undefined` is "not read yet"; `null` is "read, and there is nobody".
    // Treating the first as the second bounces a signed-in user to the
    // welcome screen every cold start.
    expect(gate({ user: undefined })).toBe('loading');
  });

  it('does not decide on a half-read session, even for a verified user', () => {
    expect(gate({ user: verified, isLoading: true })).toBe('loading');
  });
});

describe('nobody signed in', () => {
  it('sends a stranger to the welcome screen', () => {
    expect(gate()).toBe('welcome');
  });

  it('lets a guest through — everything they can reach is public', () => {
    expect(gate({ isGuest: true })).toBe('allow');
  });

  it('never asks a guest to verify an address they do not have', () => {
    expect(gate({ isGuest: true, onVerifyScreen: false })).not.toBe('verify');
  });
});

describe('signed in', () => {
  it('lets a verified account through', () => {
    expect(gate({ user: verified })).toBe('allow');
  });

  it('holds an unverified account at the verify screen', () => {
    expect(gate({ user: unverified })).toBe('verify');
  });

  it('exempts the verify screen itself, or the redirect points at itself', () => {
    expect(gate({ user: unverified, onVerifyScreen: true })).toBe('allow');
  });

  it('does not strand a verified user on the verify screen', () => {
    // What makes confirming the code actually land: the session refreshes,
    // `emailVerifiedAt` fills in, and the next read lets them out.
    expect(gate({ user: verified, onVerifyScreen: true })).toBe('allow');
  });

  it('ignores the guest flag once there is a real account', () => {
    // A guest who signs up keeps the stored guest marker until sign-out. It
    // must not buy an unverified account a way past the gate.
    expect(gate({ user: unverified, isGuest: true })).toBe('verify');
  });
});

describe('an empty string is not a date', () => {
  it('treats it as unverified rather than truthy-checking a timestamp', () => {
    expect(gate({ user: { emailVerifiedAt: '' } })).toBe('verify');
  });
});
