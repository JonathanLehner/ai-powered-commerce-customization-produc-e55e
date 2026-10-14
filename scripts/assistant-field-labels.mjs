/**
 * Writes src/lib/assistant/field-labels.ts, which is committed: for every field
 * and option of the calls the chat assistant asks the person to confirm, in
 * each workspace language, the label its confirmation card shows ("Expires on",
 * "In review") instead of the raw argument name. Entries that already exist
 * are kept, so a rerun only fills fields added to the registry since.
 *
 *   npm run assistant-field-labels
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LOCALES } from "../src/i18n/locales.ts";

const { API_OPERATIONS } = await import("../src/lib/api/operations.ts");
const { assistantOperations } = await import("../src/lib/assistant/engine.ts");
const { confirmReasons, scopeGranted, RESOURCE_CAPABILITIES } = await import("../src/lib/assistant/policy.ts");
const { CURRENCY_FIELDS, HIDDEN_FIELDS, LANGUAGE_FIELDS } = await import("../src/lib/assistant/describe.ts");

const FILE = path.join(process.cwd(), "src/lib/assistant/field-labels.ts");
const HEADER = "// Written by `npm run assistant-field-labels`; edit labels here, the script keeps them.\n\nexport const FIELD_LABELS: Record<string, { fields: Record<string, string>; values: Record<string, string> }> = ";
const NAMES = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese (Portugal)",
  ja: "Japanese",
  sv: "Swedish",
};
/** Options shown some other way: language and currency names, rounding amounts and font names. */
const OWN_FORMAT = new Set([...LANGUAGE_FIELDS, ...CURRENCY_FIELDS, "rounding", "headingFont", "bodyFont"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every field name and enum option of the operations whose calls wait for confirmation. */
export function collect() {
  const scopes = Object.keys(RESOURCE_CAPABILITIES).map((resource) => `${resource}:write`);
  const fields = new Map();
  const values = new Map();
  function walk(schema, op) {
    if (!schema || typeof schema !== "object") return;
    for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) walk(branch, op);
    if (schema.items) walk(schema.items, op);
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") walk(schema.additionalProperties, op);
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (HIDDEN_FIELDS.has(key)) continue;
      if (!fields.has(key)) fields.set(key, `${op.summary}: ${property.description ?? ""}`.slice(0, 160));
      const options = [property, ...(property.anyOf ?? []), property.items ?? {}].flatMap((s) => s.enum ?? []);
      for (const option of options) if (typeof option === "string" && !OWN_FORMAT.has(key)) values.set(`${key}.${option}`, op.summary);
      walk(property, op);
    }
  }
  for (const op of assistantOperations(API_OPERATIONS)) {
    if (!scopeGranted(scopes, op.scope) || confirmReasons(op, {}).length === 0) continue;
    walk(z.toJSONSchema(op.input, { io: "input", unrepresentable: "any" }), op);
  }
  return { fields, values };
}

function parseJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
}

async function ask(prompt, keys) {
  const KEY = process.env.CLAWCORP_API_KEY;
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://www.clawcorp.ai/api/platform/gemini", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: "gemini-2.5-flash" }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const out = parseJson((await res.json()).text ?? "");
      const bad = keys.filter((k) => typeof out[k] !== "string" || !out[k].trim());
      if (bad.length > 0) throw new Error(`missing ${bad.slice(0, 5).join(", ")}`);
      return Object.fromEntries(keys.map((k) => [k, out[k].trim().replace(/[.…:]+$/, "").replace(/\s*—\s*/g, ", ")]));
    } catch (error) {
      last = String(error);
      console.log(`  retry ${attempt}: ${last}`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(last);
}

function englishPrompt(entries, kind) {
  return kind === "fields"
    ? `These are argument names of an e-commerce store admin's operations, each with the operation it belongs to. A merchant confirms each call on a card that lists its arguments. For each, write a short English label a merchant understands, sentence case, 1 to 4 words, no trailing punctuation. Say what it is to the merchant (minimumSubtotal: "Minimum order", expiresAt: "Expires on", productIds: "Products", notifyCustomer: "Email the customer"). Never mention ids, APIs or minor units.
Return a JSON object mapping each name to its label.
${JSON.stringify(Object.fromEntries(entries), null, 1)}

Respond with raw JSON only.`
    : `These are option values of an e-commerce store admin's operations, as "field.option", each with the operation it belongs to. A merchant confirms each call on a card. For each, write the option as a short English label a merchant understands, sentence case, 1 to 4 words, no trailing punctuation (status.in_review: "In review", kind.percentage: "Percentage").
Return a JSON object mapping each "field.option" to its label.
${JSON.stringify(Object.fromEntries(entries), null, 1)}

Respond with raw JSON only.`;
}

function translatePrompt(strings, locale) {
  return `Translate these interface labels of a store admin's confirmation cards from English into ${NAMES[locale]}.
Keep each key and return an object of the same shape. Write short, natural product copy a native speaker would see in Shopify or Linear. Keep terms like storefront, SKU and SEO consistent. No trailing punctuation, no em dashes.
${JSON.stringify(strings, null, 1)}

Respond with raw JSON only.`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.CLAWCORP_API_KEY) {
    console.error("CLAWCORP_API_KEY missing");
    process.exit(1);
  }
  let table = {};
  try {
    const text = await readFile(FILE, "utf8");
    table = JSON.parse(text.slice(text.indexOf("= {") + 2).replace(/;\s*$/, ""));
  } catch {
    // First run.
  }
  for (const locale of LOCALES) {
    table[locale] ??= {};
    table[locale].fields ??= {};
    table[locale].values ??= {};
  }
  const save = () => writeFile(FILE, `${HEADER}${JSON.stringify(table, null, 1)};\n`);
  const found = collect();
  const BATCH = 60;

  for (const kind of ["fields", "values"]) {
    const missing = [...found[kind]].filter(([key]) => !table.en[kind][key]);
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      console.log(`en ${kind} ${i + batch.length}/${missing.length}`);
      Object.assign(table.en[kind], await ask(englishPrompt(batch, kind), batch.map(([key]) => key)));
      await save();
    }
  }

  await Promise.all(
    LOCALES.filter((locale) => locale !== "en").map(async (locale) => {
      for (const kind of ["fields", "values"]) {
        const keys = Object.keys(table.en[kind]).filter((key) => !table[locale][kind][key]);
        for (let i = 0; i < keys.length; i += BATCH) {
          const batch = keys.slice(i, i + BATCH);
          console.log(`${locale} ${kind} ${i + batch.length}/${keys.length}`);
          Object.assign(
            table[locale][kind],
            await ask(translatePrompt(Object.fromEntries(batch.map((key) => [key, table.en[kind][key]])), locale), batch),
          );
          await save();
        }
      }
    }),
  );
  console.log("done");
}
