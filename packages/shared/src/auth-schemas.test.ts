/**
 * The password rule, and the shapes the recovery endpoints accept.
 *
 * The rule these exist to protect: **a reset must not accept a weaker password
 * than signup.** If it did, the reset form would not be an exception to the
 * policy, it would be the way around it — sign up with anything, immediately
 * reset to `1`. The two used to be separate literals, one in `signupSchema`
 * and none anywhere else, which is precisely the arrangement that drifts by a
 * character and is never noticed.
 */
import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  passwordSchema,
  requestResetSchema,
  confirmResetSchema,
  confirmEmailSchema,
} from './schemas';

describe('the password rule is one rule', () => {
  it('rejects the same passwords everywhere it is applied', () => {
    for (const weak of ['', 'a', 'short', '1234567']) {
      expect(passwordSchema.safeParse(weak).success, weak).toBe(false);
      expect(confirmResetSchema.safeParse({ token: 't', password: weak }).success, weak).toBe(
        false,
      );
      expect(signupSchema.safeParse({ email: 'a@b.co', password: weak }).success, weak).toBe(false);
    }
  });

  it('accepts the same passwords everywhere it is applied', () => {
    for (const good of ['12345678', 'a-perfectly-fine-password']) {
      expect(passwordSchema.safeParse(good).success, good).toBe(true);
      expect(confirmResetSchema.safeParse({ token: 't', password: good }).success, good).toBe(true);
      expect(signupSchema.safeParse({ email: 'a@b.co', password: good }).success, good).toBe(true);
    }
  });

  it('agrees on the boundary exactly', () => {
    // Eight is the rule. Seven fails, eight passes, in both schemas — the
    // off-by-one is the drift this test is really watching for.
    expect(signupSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false);
    expect(confirmResetSchema.safeParse({ token: 't', password: '1234567' }).success).toBe(false);
    expect(signupSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true);
    expect(confirmResetSchema.safeParse({ token: 't', password: '12345678' }).success).toBe(true);
  });
});

describe('requesting a reset', () => {
  it('validates the address for shape', () => {
    expect(requestResetSchema.safeParse({ email: 'not-an-address' }).success).toBe(false);
    expect(requestResetSchema.safeParse({ email: 'someone@club.example' }).success).toBe(true);
  });

  it('takes nothing else — there is nothing else to say', () => {
    // Whether the address has an account is never disclosed, so the request
    // carries no other input that could be used to probe for one.
    const parsed = requestResetSchema.safeParse({
      email: 'someone@club.example',
      userId: 'sneaky',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'userId' in parsed.data).toBe(false);
  });
});

describe('spending a link', () => {
  it('refuses an empty or whitespace token', () => {
    for (const token of ['', '   ']) {
      expect(confirmEmailSchema.safeParse({ token }).success, JSON.stringify(token)).toBe(false);
      expect(confirmResetSchema.safeParse({ token, password: '12345678' }).success).toBe(false);
    }
  });

  it('accepts a base64url token unchanged', () => {
    // The token is `randomBytes(32).toString('base64url')`, so it can contain
    // `-` and `_` and must survive parsing byte for byte — a schema that
    // trimmed or normalised it would produce a hash that matches nothing.
    const token = 'VNy-TsbQAEUVZuIh542PG4W6YTKduOe58eUshLrvR4Y';
    const parsed = confirmEmailSchema.safeParse({ token });
    expect(parsed.success && parsed.data.token).toBe(token);
  });
});
