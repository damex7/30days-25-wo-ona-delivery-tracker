// Errors a service can throw. Actions and route handlers turn them into a
// message for the person (or a 404) instead of a crash.

/**
 * The record doesn't exist OR it isn't yours. Both look identical from the
 * outside, so nobody can probe ids to learn what exists (404, not 403).
 */
export class NotFoundError extends Error {
  constructor(what = "That page") {
    super(`${what} could not be found.`);
  }
}

/** You're logged in but your role can't do this (e.g. a client sending a proposal). */
export class ForbiddenError extends Error {
  constructor(message = "You can't do that with this account.") {
    super(message);
  }
}

/** The request is valid, but the current state doesn't allow it. */
export class ConflictError extends Error {}

/** Input failed a business rule that Zod couldn't express. */
export class RuleError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export function isServiceError(e: unknown): e is Error {
  return (
    e instanceof NotFoundError ||
    e instanceof ForbiddenError ||
    e instanceof ConflictError ||
    e instanceof RuleError
  );
}
