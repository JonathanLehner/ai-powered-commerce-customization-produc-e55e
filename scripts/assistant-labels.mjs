/**
 * Writes src/lib/assistant/labels.json, which is committed: for every store
 * operation the chat assistant can call, in each workspace language, the line
 * shown while it runs ("Updating a storefront section") and the line on its
 * confirmation card ("Publish the storefront"). Entries that already exist
 * are kept, so a rerun only fills operations added to the registry since.
 *
 *   npm run assistant-labels
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCALES } from "../src/i18n/locales.ts";

const { API_OPERATIONS } = await import("../src/lib/api/operations.ts");

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const FILE = path.join(process.cwd(), "src/lib/assistant/labels.json");
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
}

async function ask(prompt, keys) {
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
      const bad = keys.filter(
        (k) => !Array.isArray(out[k]) || out[k].length !== 2 || out[k].some((s) => typeof s !== "string" || !s.trim()),
      );
      if (bad.length > 0) throw new Error(`missing ${bad.slice(0, 5).join(", ")}`);
      return Object.fromEntries(keys.map((k) => [k, out[k].map((s) => s.trim().replace(/[.…]+$/, "").replace(/\s*[—–]\s*/g, ", "))]));
    } catch (error) {
      last = String(error);
      console.log(`  retry ${attempt}: ${last}`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(last);
}

function englishPrompt(batch) {
  return `These are operations of an e-commerce store admin. For each, write two short English labels for a chat assistant's interface:
1. "step": what the assistant is doing while it runs, present participle, sentence case, no trailing punctuation, 2 to 5 words. Example: "Updating a storefront section".
2. "action": the same as a plain imperative a person confirms, sentence case, 2 to 6 words. Example: "Update a storefront section".
Return a JSON object mapping each id to ["step", "action"].
${JSON.stringify(Object.fromEntries(batch.map((op) => [op.id, op.summary])), null, 1)}

Respond with raw JSON only.`;
}

function translatePrompt(strings, locale) {
  return `Translate these interface labels of a store admin's chat assistant from English into ${NAMES[locale]}.
Each value is a pair ["what the assistant is doing while it runs", "the action a person confirms"]. Keep each key and return pairs in the same shape.
Write short, natural product copy a native speaker would see in Shopify or Linear. Keep terms like storefront, SKU, webhook and API consistent. No trailing punctuation, no em dashes.
${JSON.stringify(strings, null, 1)}

Respond with raw JSON only.`;
}

let table = {};
try {
  table = JSON.parse(await readFile(FILE, "utf8"));
} catch {
  // First run.
}
for (const locale of LOCALES) table[locale] ??= {};

const operations = API_OPERATIONS.filter((op) => !op.shop && !op.admin);
const BATCH = 40;

const missingEnglish = operations.filter((op) => !table.en[op.id]);
for (let i = 0; i < missingEnglish.length; i += BATCH) {
  const batch = missingEnglish.slice(i, i + BATCH);
  console.log(`en ${i + batch.length}/${missingEnglish.length}`);
  Object.assign(table.en, await ask(englishPrompt(batch), batch.map((op) => op.id)));
  await writeFile(FILE, `${JSON.stringify(table, null, 1)}\n`);
}

await Promise.all(
  LOCALES.filter((locale) => locale !== "en").map(async (locale) => {
    const ids = operations.map((op) => op.id).filter((id) => !table[locale][id]);
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      console.log(`${locale} ${i + batch.length}/${ids.length}`);
      Object.assign(table[locale], await ask(translatePrompt(Object.fromEntries(batch.map((id) => [id, table.en[id]])), locale), batch));
    }
  }),
);

// Registry order, and nothing for operations that no longer exist.
const order = operations.map((op) => op.id);
const sorted = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(order.filter((id) => table[locale][id]).map((id) => [id, table[locale][id]]))]),
);
await writeFile(FILE, `${JSON.stringify(sorted, null, 1)}\n`);
console.log("done");
