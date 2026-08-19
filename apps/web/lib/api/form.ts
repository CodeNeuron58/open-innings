/**
 * Bridge HTML forms to shared Zod schemas to ensure consistent validation.
 */
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { ServiceError } from '@/lib/services/errors';

/**
 * Read named fields out of a form into a plain object.
 *
 * Empty strings become `undefined` — an untouched `<select>` submits `''`,
 * and the schemas treat "not provided" and "provided as blank" the same way.
 */
export function formValues<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === 'string' && value.trim() !== '') {
      out[key] = value;
    }
  }
  return out;
}

/** Redirect back to a form with a message in the query string. */
export function redirectWithError(path: string, error: unknown): never {
  let message = 'Something went wrong. Please try again.';

  if (error instanceof ServiceError) {
    message = error.message;
  } else {
    console.error('[action] unhandled error', error);
  }

  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

/**
 * Validate form values, redirecting back to `path` on the first problem.
 */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
  path: string,
): z.infer<T> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid input';
    redirectWithError(path, new ServiceError(message));
  }
  return parsed.data;
}
