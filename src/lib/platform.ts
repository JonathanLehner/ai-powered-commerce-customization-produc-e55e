import "server-only";
import { cache } from "react";

const BASE = "https://www.clawcorp.ai/api/platform";

/** Platform text model. An implementation detail — never surface it in the UI. */
const TEXT_MODEL = "gemini-2.5-flash";

function apiKey(): string {
  const key = process.env.CLAWCORP_API_KEY;
  if (!key) throw new Error("CLAWCORP_API_KEY is not configured");
  return key;
}

type DbAction =
  | "find"
  | "findOne"
  | "insertOne"
  | "insertMany"
  | "updateOne"
  | "updateMany"
  | "deleteOne"
  | "deleteMany"
  | "countDocuments";

type DbBody = {
  collection: string;
  action: DbAction;
  filter?: Record<string, unknown>;
  document?: Record<string, unknown>;
  documents?: Record<string, unknown>[];
  update?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

async function callDb<T>(body: DbBody): Promise<T> {
  const res = await fetch(`${BASE}/db`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Platform DB ${body.action} on ${body.collection} failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

function valueAt(doc: unknown, path: string): unknown {
  let current: unknown = doc;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The platform DB endpoint accepts `sort`/`limit` but does not apply them, so
 * every list would come back in insertion order. Ordering and truncation are
 * therefore done here, over the (at most 100) documents the API returns.
 */
function applyOptions<T>(rows: T[], options: Record<string, unknown>): T[] {
  const sort = options.sort as Record<string, number> | undefined;
  let out = rows;
  if (sort && Object.keys(sort).length > 0) {
    const keys = Object.entries(sort);
    out = [...rows].sort((a, b) => {
      for (const [key, direction] of keys) {
        const result = compare(valueAt(a, key), valueAt(b, key));
        if (result !== 0) return direction < 0 ? -result : result;
      }
      return 0;
    });
  }
  const limit = Number(options.limit);
  if (Number.isFinite(limit) && limit > 0 && out.length > limit) out = out.slice(0, limit);
  return out;
}

/* ------------------------------------------------------------------ caching */

/**
 * Every read is a round trip to the platform API, and one costs roughly half a
 * second — far more than anything the app itself does. A page that resolved the
 * session, the store, the membership, the product and its catalog entry paid
 * that toll once per call, and again for every caller that needed the same
 * record, which is what made saving a placement or generating a mockup feel
 * slow.
 *
 * Two caches sit in front of the API:
 *
 * 1. A per-request memo. React's `cache` gives one map per request, so the
 *    layout, the page and the action that ran before them share a single read
 *    of the same document. It is dropped the moment anything is written, so a
 *    mutation and the re-render that follows it never disagree. Outside a
 *    request scope (route handlers, scripts) React hands back a fresh map and
 *    reads simply go straight through.
 * 2. A short-lived process cache for the three reference collections that are
 *    global, admin-managed and read on nearly every screen. Writes to them
 *    clear it immediately; on another instance the change lands within the TTL.
 */
const requestReads = cache((): Map<string, Promise<unknown>> => new Map());

const SHARED_COLLECTIONS = new Set(["catalog_products", "suppliers", "tax_brackets"]);
const SHARED_TTL_MS = 60_000;

const sharedRows = new Map<string, { startedAt: number; rows: Promise<unknown[]> }>();

function readKey(body: DbBody): string {
  return JSON.stringify([body.collection, body.action, body.filter ?? null, body.options ?? null]);
}

function memoRead<T>(body: DbBody, run: () => Promise<T>): Promise<T> {
  const reads = requestReads();
  const key = readKey(body);
  const hit = reads.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  // A failed read must not be remembered, or a transient error would be
  // replayed to every later caller in the same request.
  const pending = run().catch((error: unknown) => {
    reads.delete(key);
    throw error;
  });
  reads.set(key, pending);
  return pending;
}

/** Drops every memoised read. Called after any write so nothing serves stale data. */
function invalidate(collection: string): void {
  requestReads().clear();
  sharedRows.delete(collection);
}

/**
 * The whole of a reference collection, shared across requests for `SHARED_TTL_MS`.
 * Callers get a structured copy so a document can never be mutated in the cache.
 */
async function sharedCollection<T>(collection: string): Promise<T[]> {
  const entry = sharedRows.get(collection);
  if (entry && Date.now() - entry.startedAt < SHARED_TTL_MS) {
    return structuredClone(await entry.rows) as T[];
  }
  const rows = callDb<unknown[]>({ collection, action: "find", filter: {}, options: {} })
    .then((result) => (Array.isArray(result) ? result : []))
    .catch((error: unknown) => {
      sharedRows.delete(collection);
      throw error;
    });
  sharedRows.set(collection, { startedAt: Date.now(), rows });
  return structuredClone(await rows) as T[];
}

/**
 * Thin typed wrapper over the ClawCorp project-scoped MongoDB.
 * Note: the platform API has no upsert and Mongo `_id` values never match the
 * string ids we generate, so every document carries its own `id` field and all
 * lookups go through it.
 */
export const db = {
  async find<T>(collection: string, filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
    const body: DbBody = { collection, action: "find", filter, options };
    const rows = await memoRead(body, () =>
      SHARED_COLLECTIONS.has(collection) && Object.keys(filter).length === 0
        ? sharedCollection<T>(collection)
        : callDb<T[]>(body),
    );
    return applyOptions(Array.isArray(rows) ? rows : [], options);
  },
  findOne<T>(collection: string, filter: Record<string, unknown>) {
    const body: DbBody = { collection, action: "findOne", filter };
    return memoRead(body, () => callDb<T | null>(body));
  },
  async insertOne(collection: string, document: Record<string, unknown>) {
    const result = await callDb<unknown>({ collection, action: "insertOne", document });
    invalidate(collection);
    return result;
  },
  async insertMany(collection: string, documents: Record<string, unknown>[]) {
    const result = await callDb<unknown>({ collection, action: "insertMany", documents });
    invalidate(collection);
    return result;
  },
  async updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    const result = await callDb<unknown>({ collection, action: "updateOne", filter, update });
    invalidate(collection);
    return result;
  },
  async updateMany(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    const result = await callDb<unknown>({ collection, action: "updateMany", filter, update });
    invalidate(collection);
    return result;
  },
  async deleteOne(collection: string, filter: Record<string, unknown>) {
    const result = await callDb<unknown>({ collection, action: "deleteOne", filter });
    invalidate(collection);
    return result;
  },
  async deleteMany(collection: string, filter: Record<string, unknown>) {
    const result = await callDb<unknown>({ collection, action: "deleteMany", filter });
    invalidate(collection);
    return result;
  },
  count(collection: string, filter: Record<string, unknown> = {}) {
    const body: DbBody = { collection, action: "countDocuments", filter };
    return memoRead(body, () => callDb<number>(body));
  },
};

/** Platform text generation. Returns plain text. */
export async function aiText(prompt: string, model = TEXT_MODEL): Promise<string> {
  const res = await fetch(`${BASE}/gemini`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt, model }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Text generation failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}

/** Platform text generation constrained to a JSON object/array response. */
export async function aiJson<T>(prompt: string): Promise<T> {
  const text = await aiText(
    `${prompt}\n\nRespond with raw JSON only. No markdown fences, no commentary.`,
  );
  return parseJsonLoose<T>(text);
}

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("The assistant returned a response that was not valid JSON");
  }
}

/** Uploads raw bytes to the platform asset store and returns a permanent URL. */
export async function uploadFile(bytes: ArrayBuffer | Uint8Array | Buffer, mimeType: string): Promise<string> {
  const body =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : (bytes as Uint8Array);
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "content-type": mimeType,
    },
    body: body as unknown as BodyInit,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { url: string };
  return json.url;
}
