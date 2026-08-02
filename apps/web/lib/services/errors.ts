/**
 * The error type services throw.
 *
 * Services can't redirect (that's a web-form idea) and can't build a
 * `NextResponse` (that's a REST idea). They throw this instead, and each
 * transport translates it: server actions redirect back to the form with the
 * message, route handlers serialise it to `{ error }` with the status.
 *
 * One rule per failure, expressed once.
 */
import { HTTP } from '@open-innings/shared';

export class ServiceError extends Error {
  readonly status: number;
  /** Schema path this failure belongs to, when it maps to one field. */
  readonly field?: string;

  constructor(message: string, status: number = HTTP.badRequest, field?: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.field = field;
  }
}

/** 401 — no valid session on the request. */
export function unauthorized(message = 'Sign in to continue'): ServiceError {
  return new ServiceError(message, HTTP.unauthorized);
}

/**
 * 404 — not found, or found but owned by someone else.
 *
 * Deliberately conflated: telling a stranger "this match exists but isn't
 * yours" leaks that it exists at all. Ownership failures are not-found.
 */
export function notFound(message = 'Not found'): ServiceError {
  return new ServiceError(message, HTTP.notFound);
}

/** 400 — the request was understood but breaks a rule. */
export function invalid(message: string, field?: string): ServiceError {
  return new ServiceError(message, HTTP.badRequest, field);
}

/** 409 — valid, but conflicts with current state (duplicate email, etc). */
export function conflict(message: string, field?: string): ServiceError {
  return new ServiceError(message, HTTP.conflict, field);
}
