import "server-only";

const BASE = "https://www.clawcorp.ai/api/platform";

/** Platform text model. An implementation detail — never surface it in the UI. */
const TEXT_MODEL = "gemini-2.5-flash";

function apiKey(): string {
  const key = process.env.CLAWCORP_API_KEY;
  if (!key) throw new Error("CLAWCORP_API_KEY is not configured");
  return key;
}

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
