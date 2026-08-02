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

class DbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const READ_ACTIONS = new Set<DbAction>(["find", "findOne", "countDocuments"]);

/**
 * The platform API answers a small share of calls with a 500. A read that fails
 * takes the whole page or action down with it, so reads get one immediate second
 * chance — they have no side effects, and the retry costs a round trip only on
 * the rare occasion it is needed. Writes are never retried automatically,
 * because an insert that did land would be repeated.
 */
async function callDb<T>(body: DbBody): Promise<T> {
  const attempts = READ_ACTIONS.has(body.action) ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await requestDb<T>(body);
    } catch (error) {
      lastError = error;
      const status = error instanceof DbError ? error.status : 0;
      const worthRetrying = status === 0 || status >= 500;
      if (attempt === attempts || !worthRetrying) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

async function requestDb<T>(body: DbBody): Promise<T> {
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
    throw new DbError(`Platform DB ${body.action} on ${body.collection} failed: ${res.status} ${text}`, res.status);
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
 * Three caches sit in front of the API:
 *
 * 1. A per-request memo. React's `cache` gives one map per render, so the layout
 *    and the page share a single read of the same document. Writing drops the
 *    memo for the collection that was written, so a mutation and anything read
 *    after it never disagree. Outside a request scope (route handlers, scripts)
 *    React hands back a fresh map and reads simply go straight through.
 * 2. A ten-second process cache for the four collections every workspace request
 *    re-resolves before it can do anything: the signed-in user, the store, the
 *    membership list and the agency. Between them they were four round trips on
 *    every page *and* every mutation — and a server action and the re-render
 *    that follows it are separate render scopes, so the memo above does not span
 *    them and each one paid the toll again. They are also the app's least
 *    written records. A write drops the collection at once, so the instance that
 *    made the change never serves the old value; another instance picks it up
 *    within the window.
 * 3. A one-minute process cache for the three reference collections that are
 *    global, admin-managed and read on nearly every screen. Writes to them
 *    clear it immediately; on another instance the change lands within the TTL.
 *
 * Everything a person actually edits — products, storefronts, orders, carts —
 * is read fresh every time. The one exception is `db.primeOne`, which hands a
 * document straight from the write that produced it to the render that follows,
 * so it is the newest value in existence rather than a cached older one.
 */
type MemoEntry = { collection: string; result: Promise<unknown> };

const requestReads = cache((): Map<string, MemoEntry> => new Map());

const SHARED_COLLECTIONS = new Set(["catalog_products", "suppliers", "tax_brackets"]);
const SHARED_TTL_MS = 60_000;

const IDENTITY_COLLECTIONS = new Set(["users", "stores", "memberships", "agencies"]);
const IDENTITY_TTL_MS = 10_000;
/** How long a just-written document answers reads for. One mutation and its re-render. */
const WRITTEN_TTL_MS = 3_000;
const RECENT_MAX_ENTRIES = 500;

const sharedRows = new Map<string, { startedAt: number; rows: Promise<unknown[]> }>();
const recentReads = new Map<string, { collection: string; until: number; result: Promise<unknown> }>();

function readKey(body: DbBody): string {
  return JSON.stringify([body.collection, body.action, body.filter ?? null, body.options ?? null]);
}

function memoRead<T>(body: DbBody, run: () => Promise<T>): Promise<T> {
  const reads = requestReads();
  const key = readKey(body);
  const hit = reads.get(key);
  if (hit) return hit.result as Promise<T>;
  // A failed read must not be remembered, or a transient error would be
  // replayed to every later caller in the same request.
  const pending = recentRead(key, body, run).catch((error: unknown) => {
    reads.delete(key);
    throw error;
  });
  reads.set(key, { collection: body.collection, result: pending });
  return pending;
}

/** The process cache described in (2). Callers get a copy, never the cached document. */
async function recentRead<T>(key: string, body: DbBody, run: () => Promise<T>): Promise<T> {
  const hit = recentReads.get(key);
  if (hit && hit.until > Date.now()) return structuredClone(await hit.result) as T;
  if (!IDENTITY_COLLECTIONS.has(body.collection)) return run();

  const pending = run().catch((error: unknown) => {
    recentReads.delete(key);
    throw error;
  });
  remember(key, body.collection, pending, IDENTITY_TTL_MS);
  return structuredClone(await pending) as T;
}

function remember(key: string, collection: string, result: Promise<unknown>, ttl: number): void {
  if (recentReads.size >= RECENT_MAX_ENTRIES) {
    const now = Date.now();
    for (const [existing, entry] of recentReads) {
      if (entry.until <= now) recentReads.delete(existing);
    }
    // Still full: the oldest insertions go, Map iteration being insertion-ordered.
    while (recentReads.size >= RECENT_MAX_ENTRIES) {
      const oldest = recentReads.keys().next();
      if (oldest.done) break;
      recentReads.delete(oldest.value);
    }
  }
  recentReads.set(key, { collection, until: Date.now() + ttl, result });
}

/**
 * Drops the cached reads of one collection. Called after any write to it, so
 * nothing serves a document that has just been changed. Reads of other
 * collections survive, because a write cannot have changed them.
 */
function invalidate(collection: string): void {
  const reads = requestReads();
  for (const [key, entry] of reads) {
    if (entry.collection === collection) reads.delete(key);
  }
  for (const [key, entry] of recentReads) {
    if (entry.collection === collection) recentReads.delete(key);
  }
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
  /**
   * Records the document a write has just produced, so the render that follows
   * the mutation reads it from memory instead of paying another round trip for
   * a value the server already knows. Call it *after* the write, because the
   * write invalidates the collection.
   */
  primeOne<T>(collection: string, filter: Record<string, unknown>, document: T): void {
    const body: DbBody = { collection, action: "findOne", filter };
    const key = readKey(body);
    const result = Promise.resolve(structuredClone(document));
    requestReads().set(key, { collection, result });
    remember(key, collection, result, WRITTEN_TTL_MS);
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
