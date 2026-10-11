import "server-only";
import { languageName } from "@/i18n/display";
import { aiJson } from "./platform";

/** Entries per request, so one long description cannot push a batch past the model's output. */
const BATCH = 40;

/**
 * Translates store copy with the platform text model. Takes and returns a map
 * of opaque keys to text; a key the model leaves out or answers with something
 * other than text is simply missing from the result.
 */
export async function machineTranslate(
  texts: Record<string, string>,
  from: string,
  to: string,
): Promise<Record<string, string>> {
  const entries = Object.entries(texts).filter(([, text]) => text.trim() !== "");
  const batches: [string, string][][] = [];
  for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

  const source = languageName("en", from);
  const target = languageName("en", to);
  const results = await Promise.all(
    batches.map((batch) =>
      aiJson<Record<string, unknown>>(
        `Translate the values of this JSON object from ${source} to ${target}. They are texts from an online shop: ` +
          `headings, buttons, product names, product descriptions and colour names. Keep the keys exactly as they are. ` +
          `Keep line breaks, numbers, brand names, product codes and anything in curly braces unchanged. ` +
          `Use the tone a professional shop uses in ${target}. Return a JSON object with the same keys.\n\n` +
          JSON.stringify(Object.fromEntries(batch)),
      ),
    ),
  );

  const out: Record<string, string> = {};
  for (const result of results) {
    for (const [key, value] of Object.entries(result ?? {})) {
      if (key in texts && typeof value === "string" && value.trim() !== "") out[key] = value.trim();
    }
  }
  return out;
}
