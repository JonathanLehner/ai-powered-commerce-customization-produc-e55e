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
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const sliced = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  // Models sometimes put a raw line break inside a string value, which JSON
  // forbids, so the last attempt escapes control characters inside strings.
  for (const candidate of [cleaned, sliced, escapeControlCharacters(sliced)]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next, more forgiving reading
    }
  }
  throw new Error("The assistant returned a response that was not valid JSON");
}

function escapeControlCharacters(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of json) {
    if (inString && !escaped && char < " ") {
      out += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : "";
      continue;
    }
    if (char === '"' && !escaped) inString = !inString;
    escaped = inString && char === "\\" && !escaped;
    out += char;
  }
  return out;
}
