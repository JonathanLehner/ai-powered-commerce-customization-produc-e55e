import "server-only";

const BASE = "https://www.clawcorp.ai/api/platform";

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

/**
 * Thin typed wrapper over the ClawCorp project-scoped MongoDB.
 * Note: the platform API has no upsert and Mongo `_id` values never match the
 * string ids we generate, so every document carries its own `id` field and all
 * lookups go through it.
 */
export const db = {
  async find<T>(collection: string, filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
    const rows = await callDb<T[]>({ collection, action: "find", filter, options });
    return applyOptions(Array.isArray(rows) ? rows : [], options);
  },
  findOne<T>(collection: string, filter: Record<string, unknown>) {
    return callDb<T | null>({ collection, action: "findOne", filter });
  },
  insertOne(collection: string, document: Record<string, unknown>) {
    return callDb<unknown>({ collection, action: "insertOne", document });
  },
  insertMany(collection: string, documents: Record<string, unknown>[]) {
    return callDb<unknown>({ collection, action: "insertMany", documents });
  },
  updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    return callDb<unknown>({ collection, action: "updateOne", filter, update });
  },
  updateMany(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    return callDb<unknown>({ collection, action: "updateMany", filter, update });
  },
  deleteOne(collection: string, filter: Record<string, unknown>) {
    return callDb<unknown>({ collection, action: "deleteOne", filter });
  },
  deleteMany(collection: string, filter: Record<string, unknown>) {
    return callDb<unknown>({ collection, action: "deleteMany", filter });
  },
  count(collection: string, filter: Record<string, unknown> = {}) {
    return callDb<number>({ collection, action: "countDocuments", filter });
  },
};

/** Gemini text generation. Returns plain text. */
export async function geminiText(prompt: string, model = "gemini-2.5-flash"): Promise<string> {
  const res = await fetch(`${BASE}/gemini`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt, model }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}

/** Gemini text generation constrained to a JSON object/array response. */
export async function geminiJson<T>(prompt: string): Promise<T> {
  const text = await geminiText(
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
    throw new Error("Gemini returned a response that was not valid JSON");
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
