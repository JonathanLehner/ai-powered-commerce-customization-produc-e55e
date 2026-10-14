import type { NextRequest } from "next/server";
import {
  AssistantRefusal,
  assistantSession,
  conversationView,
  findConversation,
  listConversations,
  runAssistantRequest,
  type AssistantRequest,
  type StreamEvent,
} from "@/lib/assistant/service";

/**
 * The workspace chat assistant, for the signed-in person in one store.
 *
 * GET lists their conversations in the store and reads one. POST runs a turn
 * (a message, a confirmation, a cancellation or an undo) and answers with
 * newline-delimited JSON events as the turn goes: the reply, each tool step,
 * a confirmation to show, and what changed.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const TEXT_LIMIT = 4000;

function refused(error: unknown): Response {
  if (error instanceof AssistantRefusal) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
  throw error;
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  try {
    const session = await assistantSession(params.get("storeId") ?? "");
    const id = params.get("conversationId");
    const [conversations, record] = await Promise.all([listConversations(session), id ? findConversation(session, id) : null]);
    return Response.json(
      { conversations, conversation: record ? conversationView(record, session.locale) : null, canWrite: session.scopes.some((s) => s.endsWith(":write")) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return refused(error);
  }
}

function readRequest(body: Record<string, unknown>): AssistantRequest | null {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const page = text(body.page);
  const conversationId = text(body.conversationId);
  if (body.action === "message") {
    const message = text(body.text).trim().slice(0, TEXT_LIMIT);
    const attachments = Array.isArray(body.attachments) ? body.attachments.filter((a): a is string => typeof a === "string") : [];
    if (!message && attachments.length === 0) return null;
    return { action: "message", conversationId: conversationId || null, text: message, attachments, page };
  }
  if (!conversationId) return null;
  if (body.action === "confirm" || body.action === "cancel") {
    const pendingId = text(body.pendingId);
    return pendingId ? { action: body.action, conversationId, pendingId, page } : null;
  }
  if (body.action === "undo") return { action: "undo", conversationId, page };
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "The request body is not valid JSON." }, { status: 400, headers: NO_STORE });
  }
  let session;
  try {
    session = await assistantSession(typeof body.storeId === "string" ? body.storeId : "");
  } catch (error) {
    return refused(error);
  }
  const parsed = readRequest(body);
  if (!parsed) return Response.json({ error: "Nothing to send." }, { status: 422, headers: NO_STORE });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; the turn still finishes and is saved.
        }
      };
      try {
        await runAssistantRequest(session, parsed, emit);
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, {
    headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
  });
}
