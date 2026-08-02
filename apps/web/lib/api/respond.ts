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
