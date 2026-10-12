import type { ActionState } from "@/app/actions/stores";
import { isOperationError } from "./context";

/**
 * An operation's refusal as the form shows it. Anything other than a refusal
 * is a fault and is thrown on, as it would have been without the operation.
 */
export function refusal(error: unknown): ActionState {
  if (isOperationError(error)) return { status: "error", message: error.message, field: error.field };
  throw error;
}
