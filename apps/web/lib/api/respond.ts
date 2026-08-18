/**
 * Turning services into HTTP.
 *
 * Route handlers here are thin: parse the body against a shared schema, call
 * a service, serialise whatever comes back. All the branching on failure
 * lives in `toErrorResponse` so no handler has to remember which status a
 * given failure maps to.
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { ScoringError } from '@open-innings/scoring';
import { HTTP, type ApiError } from '@open-innings/shared';
import { ServiceError } from '@/lib/services/errors';

/**
 * Parse a JSON body against a schema.
 *
 * Throws `ServiceError` on malformed JSON or a schema failure, so handlers can
 * let it fall through to `toErrorResponse` like any other error.
 */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError('Request body must be valid JSON', HTTP.badRequest);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(
      issue?.message ?? 'Invalid input',
      HTTP.badRequest,
      issue?.path.join('.') || undefined,
    );
  }

  return parsed.data;
}

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * What a broken unique constraint means to a client, per constraint.
 *
 * Keyed on the constraint **name** rather than on the bare SQLSTATE, because
 * more than one thing in this schema is unique and they mean different things
 * to whoever is asking. Anything not listed falls through to a generic 409:
 * still the right status, just without a code worth branching on.
 */
const UNIQUE_CONFLICTS: Record<string, { error: string; code: string; field?: string }> = {
  /*
   * Two requests recorded the same delivery.
   *
   * POST /ball derives ballNumber from a count, so a double tap — or a retry
   * after a timeout on ground-side mobile data — computes the same number
   * twice. The index refuses the second write, which is correct and is the
   * whole reason it exists.
   *
   * What was wrong is what the client heard: an unrecognised driver error
   * became `500 Internal error`, indistinguishable from a real fault, so a
   * retrying client kept retrying something that could never succeed. A 409
   * says "already recorded" — refresh, do not resend.
   */
  ball_events_innings_idx: {
    error: 'That delivery is already recorded. Refresh to see the current score.',
    code: 'DUPLICATE_BALL',
  },
  users_email_unique: {
    error: 'An account with that email already exists',
    code: 'EMAIL_TAKEN',
    field: 'email',
  },
};

/**
 * The constraint a driver error names, if it names one.
 *
 * postgres.js puts the SQLSTATE on `code` and the constraint on
 * `constraint_name`. Read defensively — this is an untyped driver object, and
 * guessing wrong here would turn a conflict back into a 500.
 */
function uniqueViolation(error: unknown): { error: string; code: string; field?: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const driver = error as { code?: unknown; constraint_name?: unknown };
  if (driver.code !== UNIQUE_VIOLATION) return null;

  const constraint = typeof driver.constraint_name === 'string' ? driver.constraint_name : '';
  return (
    UNIQUE_CONFLICTS[constraint] ?? {
      error: 'That already exists.',
      code: 'DUPLICATE',
    }
  );
}

/**
 * Map a thrown error onto the API's error contract.
 *
 * Only errors we raised deliberately get their message forwarded. Anything
 * else becomes a flat 500 — an unexpected exception can carry a connection
 * string or a query fragment, and that must not reach a client.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiError> {
  if (error instanceof ServiceError) {
    const body: ApiError = { error: error.message };
    if (error.field) body.field = error.field;
    return NextResponse.json(body, { status: error.status });
  }

  // A unique constraint did its job. That is a conflict, not a server fault,
  // and the difference decides whether a client retries forever.
  const conflict = uniqueViolation(error);
  if (conflict) {
    const body: ApiError = { error: conflict.error, code: conflict.code };
    if (conflict.field) body.field = conflict.field;
    return NextResponse.json(body, { status: HTTP.conflict });
  }

  // The scoring engine rejected the delivery — a client bug or a rule the
  // scorer got wrong, not a server fault. `code` lets clients branch on it.
  if (error instanceof ScoringError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: HTTP.badRequest },
    );
  }

  console.error('[api] unhandled error', error);
  return NextResponse.json({ error: 'Internal error' }, { status: HTTP.serverError });
}

/**
 * Wrap a handler so thrown errors become responses.
 *
 * Without this, every handler needs its own try/catch and they drift apart —
 * one leaks a stack trace, another returns 200 with an error body.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
