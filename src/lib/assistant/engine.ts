import "server-only";
import { z } from "zod";
import type { ApiOperation } from "../api/define";
import { toolName } from "../api/define";
import { refusalOf } from "../api/http";
import type { OperationContext } from "../operations/context";
import { newId } from "../util";
import type { ModelCall, ModelMessage, ToolCall, ToolDefinition } from "./model";
import { confirmReasons, DRAFT_OPERATIONS, EXCLUDED_OPERATIONS, redactSecrets, scopeGranted, type ConfirmReason } from "./policy";
import { runViaAssistant } from "./via";

/**
 * The chat assistant's tool loop. Each turn sends the conversation and the
 * tools the person may use to the model, runs the operations it calls (the
 * Admin API's own, in-process, as the person) and goes round again until the
 * model answers in words. A call that is irreversible or reaches shoppers is
 * not run: the turn stops with it pending, and only `confirmPending` runs it,
 * with exactly the arguments shown to the person.
 *
 * Everything outside the loop (the model, the registry, the checkpoint taken
 * before a storefront edit) is passed in, so `npm run assistant-chat-check`
 * runs the loop against a stubbed model.
 */

/** Model rounds per turn before the assistant stops and says so. */
export const MAX_ROUNDS = 12;
/** Stored messages the model is shown, newest last. */
const CONTEXT_MESSAGES = 40;
/** Messages kept per conversation. */
const KEPT_MESSAGES = 120;
/** Characters of one operation's result the model is shown. */
const RESULT_LIMIT = 16_000;

/** The tool that adds another area's operations to the conversation. */
export const LOAD_TOOLS = "load_tools";

export interface MessageUi {
  at: string;
  /** Images the person attached, by stored URL. */
  attachments?: string[];
  /** The operation a tool message reports on. */
  operationId?: string;
  status?: "done" | "error" | "declined";
  /** Why a step failed, in words for the person. */
  message?: string;
  /** A message the chat wrote rather than the person or the model. */
  note?: "undo" | "cancelled" | "stopped";
}

export type StoredMessage = ModelMessage & { ui?: MessageUi };

export interface PendingCall {
  toolCallId: string;
  operationId: string;
  args: Record<string, unknown>;
  reasons: ConfirmReason[];
}

export interface PendingConfirmation {
  id: string;
  calls: PendingCall[];
}

export interface UndoPoint {
  /** The storefront version saved just before the assistant's first draft change of a turn. */
  versionId: string;
  turn: number;
  at: string;
}

export interface ConversationState {
  messages: StoredMessage[];
  /** The API tags whose operations are offered as tools. */
  groups: string[];
  pending: PendingConfirmation | null;
  undo: UndoPoint | null;
  /** Counts the person's messages, so a checkpoint is taken once per turn. */
  turn: number;
}

export interface PendingView {
  id: string;
  actions: { toolCallId: string; operationId: string; title: string; reasons: ConfirmReason[]; params: { key: string; value: string }[] }[];
}

export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "step"; id: string; operationId: string; label: string; status: "running" | "done" | "error"; message?: string }
  | { type: "confirm"; pending: PendingView }
  | { type: "changed"; storefront: boolean }
  | { type: "undo"; available: boolean }
  | { type: "notice"; note: NonNullable<MessageUi["note"]> };

export interface EngineDeps {
  model: ModelCall;
  /** The operation registry; `API_OPERATIONS` outside the checks. */
  operations: readonly ApiOperation[];
  /** The store, the person as the actor, and their workspace language. */
  ctx: OperationContext;
  /** What the person may do here, from `assistantScopes`. */
  scopes: readonly string[];
  system: string;
  emit(event: AssistantEvent): void;
  /** The progress line and the confirmation title of an operation, in the person's language. */
  label(operationId: string): { step: string; action: string };
  /**
   * Saves the storefront draft as it is into the version history before the
   * assistant changes it, and returns that version's id (null when there is
   * no page yet to keep).
   */
  checkpoint(): Promise<string | null>;
  /**
   * Reads the store again after a call changed it, so the rest of the turn
   * sees the change (a language enabled, then translated into).
   */
  refreshStore?(): Promise<void>;
}

/* ------------------------------------------------------------------ tools */

/** Store operations the assistant may ever be offered, before the person's scopes. */
export function assistantOperations(operations: readonly ApiOperation[]): ApiOperation[] {
  return operations.filter((operation) => !operation.shop && !operation.admin && !EXCLUDED_OPERATIONS.has(operation.id));
}

/** The operations this person may run, by their scopes. */
export function allowedOperations(deps: Pick<EngineDeps, "operations" | "scopes">): ApiOperation[] {
  return assistantOperations(deps.operations).filter((operation) => scopeGranted(deps.scopes, operation.scope));
}

function parameters(operation: ApiOperation): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema: _schema, ...schema } = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return schema;
}

const definitions = new WeakMap<ApiOperation, ToolDefinition>();

/** An operation as a tool: its MCP name, and its summary and description from the registry. */
export function toolDefinition(operation: ApiOperation): ToolDefinition {
  let definition = definitions.get(operation);
  if (!definition) {
    const confirmed = confirmReasons(operation, {}).length > 0;
    definition = {
      type: "function",
      function: {
        name: toolName(operation),
        description: `${operation.summary}. ${operation.description}${
          confirmed
            ? " The person is shown a confirmation with the exact arguments before it runs; call it directly rather than asking first."
            : ""
        }`,
        parameters: parameters(operation),
      },
    };
    definitions.set(operation, definition);
  }
  return definition;
}

/** The tools offered this round: the loaded areas' operations, and `load_tools` for the rest. */
export function offeredTools(state: Pick<ConversationState, "groups">, deps: Pick<EngineDeps, "operations" | "scopes">): ToolDefinition[] {
  const allowed = allowedOperations(deps);
  const tools = allowed.filter((operation) => state.groups.includes(operation.tag)).map(toolDefinition);
  const more = [...new Set(allowed.map((operation) => operation.tag))].filter((tag) => !state.groups.includes(tag));
  if (more.length > 0) {
    tools.push({
      type: "function",
      function: {
        name: LOAD_TOOLS,
        description:
          "Adds the tools of more areas of the store to this conversation. The areas not loaded yet are listed in the enum. Load an area before working in it.",
        parameters: {
          type: "object",
          properties: { areas: { type: "array", items: { type: "string", enum: more }, minItems: 1 } },
          required: ["areas"],
        },
      },
    });
  }
  return tools;
}

/* ---------------------------------------------------------------- running */

function now() {
  return new Date().toISOString();
}

function resultText(value: unknown): string {
  const text = JSON.stringify(redactSecrets(value ?? { ok: true })) ?? "null";
  return text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}… [truncated: ask for fewer records or one record]` : text;
}

function parseArgs(call: ToolCall): Record<string, unknown> | null {
  try {
    const value = JSON.parse(call.function.arguments || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function findOperation(deps: EngineDeps, name: string): ApiOperation | null {
  return assistantOperations(deps.operations).find((operation) => toolName(operation) === name) ?? null;
}

function pushTool(
  state: ConversationState,
  call: { id: string },
  operationId: string,
  content: string,
  status: MessageUi["status"],
  message?: string,
) {
  state.messages.push({ role: "tool", tool_call_id: call.id, content, ui: { at: now(), operationId, status, ...(message ? { message } : {}) } });
}

/** Why the person may not run this operation, in words for the model to pass on; null when they may. */
function refusal(deps: EngineDeps, operation: ApiOperation | null, name: string): string | null {
  if (!operation) return `There is no tool called ${name}.`;
  if (!scopeGranted(deps.scopes, operation.scope)) {
    const [resource, access] = operation.scope.split(":");
    return `Not allowed: ${deps.ctx.actor.name}'s role in this store does not let them ${access === "write" ? "change" : "see"} ${resource.replace("_", " ")}. Tell them a store administrator can do it or change their role.`;
  }
  return null;
}

/** Runs one operation as the person, marked as done via the assistant, and reports it. */
async function execute(
  state: ConversationState,
  deps: EngineDeps,
  operation: ApiOperation,
  call: ToolCall,
  args: Record<string, unknown>,
) {
  const label = deps.label(operation.id).step;
  deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "running" });
  let changed = false;
  try {
    const input = operation.input.parse(args);
    const changes = operation.method !== "GET" && !operation.scope.endsWith(":read");
    if (DRAFT_OPERATIONS.has(operation.id) && state.undo?.turn !== state.turn) {
      const versionId = await runViaAssistant(() => deps.checkpoint());
      if (versionId) {
        state.undo = { versionId, turn: state.turn, at: now() };
      }
    }
    const result = await runViaAssistant(() => operation.run(deps.ctx, input as never));
    changed = changes;
    pushTool(state, call, operation.id, resultText(result), "done");
    deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "done" });
    if (changes) {
      deps.emit({ type: "changed", storefront: operation.scope.startsWith("storefront") || operation.scope.startsWith("content") });
      if (DRAFT_OPERATIONS.has(operation.id) && state.undo) deps.emit({ type: "undo", available: true });
    }
  } catch (error) {
    const refused = refusalOf(error);
    if (!refused) console.error(`Assistant tool ${operation.id} failed`, error);
    const message = refused ? `${refused.message}${refused.details ? ` ${JSON.stringify(refused.details)}` : ""}` : "Something went wrong. Try again.";
    const shown = refused?.message ?? "Something went wrong. Try again.";
    pushTool(state, call, operation.id, JSON.stringify({ error: message }), "error", shown);
    deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "error", message: shown });
  }
  if (changed && !DRAFT_OPERATIONS.has(operation.id) && deps.refreshStore) {
    await deps.refreshStore().catch((error) => console.error("Assistant could not read the store again", error));
  }
}

export function pendingView(pending: PendingConfirmation, deps: Pick<EngineDeps, "label">): PendingView {
  return {
    id: pending.id,
    actions: pending.calls.map((call) => ({
      toolCallId: call.toolCallId,
      operationId: call.operationId,
      title: deps.label(call.operationId).action,
      reasons: call.reasons,
      params: Object.entries(call.args)
        .filter(([key]) => key !== "idempotencyKey")
        .map(([key, value]) => {
          const text = typeof value === "string" ? value : JSON.stringify(value);
          return { key, value: text.length > 600 ? `${text.slice(0, 600)}…` : text };
        }),
    })),
  };
}

/** The messages the model reads: the latest stretch, starting at one of the person's messages. */
function context(state: ConversationState, system: string): ModelMessage[] {
  let recent = state.messages.slice(-CONTEXT_MESSAGES);
  const start = recent.findIndex((message) => message.role === "user");
  recent = start > 0 ? recent.slice(start) : recent;
  // The chat's own notes ("Cancelled") are for the person; the tool results already tell the model.
  const kept = recent.filter((message) => !(message.role === "assistant" && !message.content && !message.tool_calls?.length));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return [{ role: "system", content: system }, ...kept.map(({ ui: _ui, ...message }) => message as ModelMessage)];
}

/** Goes round with the model until it answers in words, asks for confirmation, or runs out of rounds. */
async function loop(state: ConversationState, deps: EngineDeps): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const reply = await deps.model({ messages: context(state, deps.system), tools: offeredTools(state, deps) });
    const text = reply.content?.trim() ?? "";
    state.messages.push({
      role: "assistant",
      content: text || null,
      ...(reply.toolCalls.length > 0 ? { tool_calls: reply.toolCalls } : {}),
      ui: { at: now() },
    });
    if (text) deps.emit({ type: "text", text });
    if (reply.toolCalls.length === 0) return;

    const waiting: PendingCall[] = [];
    for (const call of reply.toolCalls) {
      const args = parseArgs(call);
      if (call.function.name === LOAD_TOOLS) {
        const areas = Array.isArray(args?.areas) ? args.areas.filter((a): a is string => typeof a === "string") : [];
        const known = new Set<string>(allowedOperations(deps).map((operation) => operation.tag));
        const added = areas.filter((area) => known.has(area) && !state.groups.includes(area));
        state.groups.push(...added);
        pushTool(state, call, LOAD_TOOLS, JSON.stringify({ loaded: added, unavailable: areas.filter((a) => !known.has(a)) }), "done");
        continue;
      }
      const operation = findOperation(deps, call.function.name);
      const refused = refusal(deps, operation, call.function.name);
      if (refused || !operation) {
        pushTool(state, call, operation?.id ?? call.function.name, JSON.stringify({ error: refused }), "error");
        if (operation) {
          deps.emit({ type: "step", id: call.id, operationId: operation.id, label: deps.label(operation.id).step, status: "error", message: refused ?? undefined });
        }
        continue;
      }
      if (!args) {
        pushTool(state, call, operation.id, JSON.stringify({ error: "The arguments were not a JSON object." }), "error");
        continue;
      }
      const checked = operation.input.safeParse(args);
      if (!checked.success) {
        const issue = checked.error.issues[0];
        pushTool(state, call, operation.id, JSON.stringify({ error: `${issue?.path.join(".") || "input"}: ${issue?.message ?? "invalid"}` }), "error");
        continue;
      }
      const reasons = confirmReasons(operation, args);
      if (reasons.length > 0) {
        waiting.push({ toolCallId: call.id, operationId: operation.id, args, reasons });
        continue;
      }
      await execute(state, deps, operation, call, args);
    }

    if (waiting.length > 0) {
      state.pending = { id: newId("acn"), calls: waiting };
      deps.emit({ type: "confirm", pending: pendingView(state.pending, deps) });
      return;
    }
  }
  state.messages.push({ role: "assistant", content: null, ui: { at: now(), note: "stopped" } });
  deps.emit({ type: "notice", note: "stopped" });
}

function trim(state: ConversationState) {
  if (state.messages.length <= KEPT_MESSAGES) return;
  let cut = state.messages.length - KEPT_MESSAGES;
  while (cut < state.messages.length && state.messages[cut].role !== "user") cut += 1;
  state.messages = state.messages.slice(cut);
}

/** Answers the calls still waiting with "declined", so the model knows nothing was done. */
function declinePending(state: ConversationState) {
  if (!state.pending) return;
  for (const call of state.pending.calls) {
    pushTool(state, { id: call.toolCallId }, call.operationId, JSON.stringify({ declined: true, message: "The person did not confirm this. Nothing was done." }), "declined");
  }
  state.pending = null;
}

/** The person's message, then the loop. A confirmation still waiting is declined by writing something new. */
export async function sendMessage(
  state: ConversationState,
  deps: EngineDeps,
  input: { text: string; attachments?: string[] },
): Promise<void> {
  declinePending(state);
  state.turn += 1;
  const attachments = (input.attachments ?? []).slice(0, 4);
  const content = attachments.length
    ? `${input.text}\n\nAttached images (already uploaded, use these URLs in image fields):\n${attachments.join("\n")}`
    : input.text;
  state.messages.push({ role: "user", content, ui: { at: now(), ...(attachments.length ? { attachments } : {}) } });
  await loop(state, deps);
  trim(state);
}

/**
 * Runs the calls the person confirmed, exactly as they were shown, then lets
 * the model carry on. Refused unless `pendingId` is the confirmation waiting.
 */
export async function confirmPending(state: ConversationState, deps: EngineDeps, pendingId: string): Promise<boolean> {
  const pending = state.pending;
  if (!pending || pending.id !== pendingId) return false;
  state.pending = null;
  for (const call of pending.calls) {
    const operation = findOperation(deps, toolName({ id: call.operationId }));
    const refused = refusal(deps, operation, call.operationId);
    const toolCall: ToolCall = { id: call.toolCallId, type: "function", function: { name: toolName({ id: call.operationId }), arguments: JSON.stringify(call.args) } };
    if (refused || !operation) {
      pushTool(state, toolCall, call.operationId, JSON.stringify({ error: refused }), "error");
      deps.emit({ type: "step", id: call.toolCallId, operationId: call.operationId, label: deps.label(call.operationId).step, status: "error", message: refused ?? undefined });
      continue;
    }
    await execute(state, deps, operation, toolCall, call.args);
  }
  await loop(state, deps);
  trim(state);
  return true;
}

/** Declines the waiting calls without asking the model again. */
export function cancelPending(state: ConversationState, deps: EngineDeps, pendingId: string): boolean {
  if (!state.pending || state.pending.id !== pendingId) return false;
  declinePending(state);
  state.messages.push({ role: "assistant", content: null, ui: { at: now(), note: "cancelled" } });
  deps.emit({ type: "notice", note: "cancelled" });
  return true;
}

/**
 * Puts the storefront draft back to the version saved before the assistant's
 * last change, through the same restore operation the version history uses.
 */
export async function undoLast(state: ConversationState, deps: EngineDeps): Promise<boolean> {
  const undo = state.undo;
  const operation = assistantOperations(deps.operations).find((op) => op.id === "restoreStorefrontVersion");
  if (!undo || !operation || !scopeGranted(deps.scopes, operation.scope)) return false;
  const call: ToolCall = { id: `undo_${undo.versionId}`, type: "function", function: { name: toolName(operation), arguments: "{}" } };
  const label = deps.label(operation.id).step;
  deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "running" });
  try {
    await runViaAssistant(() => operation.run(deps.ctx, operation.input.parse({ versionId: undo.versionId }) as never));
  } catch (error) {
    const refused = refusalOf(error);
    if (!refused) console.error("Assistant undo failed", error);
    deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "error", message: refused?.message });
    return false;
  }
  state.undo = null;
  state.messages.push({
    role: "user",
    content: "(I used the Undo button: the storefront draft is back to how it was before your last changes.)",
    ui: { at: now(), note: "undo" },
  });
  deps.emit({ type: "step", id: call.id, operationId: operation.id, label, status: "done" });
  deps.emit({ type: "notice", note: "undo" });
  deps.emit({ type: "changed", storefront: true });
  deps.emit({ type: "undo", available: false });
  return true;
}

export function emptyState(groups: string[]): ConversationState {
  return { messages: [], groups, pending: null, undo: null, turn: 0 };
}
