import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks the operations the chat assistant runs, so the audit entries they
 * write say the change was made by the person via the assistant. The
 * operations themselves stay the same ones the API and the workspace run.
 */
const via = new AsyncLocalStorage<"assistant">();

export function runViaAssistant<T>(work: () => Promise<T>): Promise<T> {
  return via.run("assistant", work);
}

/** "assistant" while an assistant call is running, else null. */
export function currentVia(): "assistant" | null {
  return via.getStore() ?? null;
}
