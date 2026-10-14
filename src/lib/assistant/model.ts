import "server-only";

/**
 * The chat assistant's model: the ClawCorp platform's OpenAI proxy, which
 * takes chat messages with `tools` and `tool_choice` and answers with the
 * completion under `response`. The deployment is ASSISTANT_MODEL, else the
 * most capable one with tool calling.
 */

const ENDPOINT = "https://www.clawcorp.ai/api/platform/openai";
const DEFAULT_MODEL = "gpt-5.6-sol";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ModelReply {
  content: string | null;
  toolCalls: ToolCall[];
}

/** One completion. The tool loop takes this as a parameter, so the checks can stub it. */
export type ModelCall = (request: { messages: ModelMessage[]; tools: ToolDefinition[] }) => Promise<ModelReply>;

export class ModelError extends Error {}

export const platformModel: ModelCall = async ({ messages, tools }) => {
  const key = process.env.CLAWCORP_API_KEY;
  if (!key) throw new ModelError("CLAWCORP_API_KEY is not configured");
  const model = process.env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new ModelError(`Assistant model failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const json = (await response.json()) as {
    text?: string;
    response?: { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  };
  const message = json.response?.choices?.[0]?.message;
  return {
    content: message?.content ?? json.text ?? null,
    toolCalls: (message?.tool_calls ?? []).filter((call) => call.type === "function" && call.function?.name),
  };
};
