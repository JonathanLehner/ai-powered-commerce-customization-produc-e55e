/**
 * What every store operation is given, whoever called it.
 *
 * The workspace's server actions and the Admin REST API run the same
 * operations in `src/lib/operations`. An action passes the signed-in person and
 * the language they use the workspace in; the API passes its key, named as the
 * key's owner named it, and English. Either way the audit history says who did
 * it and the messages come back in the caller's language.
 */
import type { Locale } from "@/i18n/locales";
import type { Store } from "../types";

/** Who a change is recorded against: a person, or an API key under its name. */
export interface Actor {
  id: string;
  name: string;
}

export interface OperationContext {
  store: Store;
  actor: Actor;
  /** The language refusals are written in. */
  locale: Locale;
}

/**
 * What a platform administration operation is given: no store, only who did it
 * (a platform administrator, or a platform key under its name) and the language
 * refusals are written in. The Admin API's `AdminContext` has the same shape.
 */
export interface PlatformContext {
  actor: Actor;
  locale: Locale;
}

/**
 * - `invalid`: the input breaks a rule; `field` names the input.
 * - `not_found`: the record is not in this store.
 * - `conflict`: the record's state does not allow it, or it changed meanwhile.
 * - `payment_failed`: the payment provider refused.
 */
export type OperationErrorCode = "invalid" | "not_found" | "conflict" | "payment_failed";

/** A refusal with a message ready to show. Anything else thrown is a fault. */
export class OperationError extends Error {
  readonly code: OperationErrorCode;
  readonly field?: string;

  constructor(code: OperationErrorCode, message: string, field?: string) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.field = field;
  }
}

export function isOperationError(error: unknown): error is OperationError {
  return error instanceof OperationError;
}
