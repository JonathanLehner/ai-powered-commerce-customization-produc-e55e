/**
 * Translates every store template's copy into the eight other shopper
 * languages and writes src/lib/templates/i18n.json, which is committed.
 * Strings that already have a translation are kept, so a rerun only fills
 * what is new or changed in English.
 *
 *   node --env-file=.env.local --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/translate-templates.mjs [--only id,id]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCALES } from "../src/i18n/locales.ts";
import { TEMPLATE_DEFS, templateSourceCopy } from "../src/lib/templates/index.ts";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const FILE = path.join(process.cwd(), "src/lib/templates/i18n.json");
const SOURCE_FILE = path.join(process.cwd(), ".tmp/templates-i18n-source.json");
const NAMES = { de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese (Portugal)", ja: "Japanese", sv: "Swedish" };

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function translate(strings, locale, brand) {
  const prompt = `Translate the values of this JSON object from English into ${NAMES[locale]} for an online merch store.
Rules:
- Keep every key exactly as it is. Return a JSON object with the same keys.
- Write natural, short shop copy a native speaker would write. Keep the tone (playful, formal, punchy) of the original.
- Keep brand, band, club, company, podcast, person, venue and city names unchanged, including "${brand}". Keep product names' brand part unchanged and translate the rest naturally.
- Keep @handles, numbers, dates, prices, "$", "|" table separators and line breaks exactly.
- No em dashes.
${JSON.stringify(strings, null, 1)}

Respond with raw JSON only.`;
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
      const missing = Object.keys(strings).filter((k) => typeof out[k] !== "string" || !out[k].trim());
      if (missing.length > 0) throw new Error(`missing ${missing.slice(0, 5).join(", ")}`);
      return Object.fromEntries(Object.keys(strings).map((k) => [k, out[k].replace(/\s*—\s*/g, ", ")]));
    } catch (err) {
      last = String(err);
      console.log(`  retry ${locale} ${attempt}: ${last}`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(last);
}

const table = JSON.parse(await readFile(FILE, "utf8"));
// The English each translation was made from, so a changed string is translated again.
let sources = {};
try {
  sources = JSON.parse(await readFile(SOURCE_FILE, "utf8"));
} catch {
  // First run, or a fresh checkout: keep what is translated.
}

const jobs = [];
for (const def of TEMPLATE_DEFS.filter((t) => !only || only.includes(t.id))) {
  const source = templateSourceCopy(def);
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    const have = table[def.id]?.[locale] ?? {};
    const todo = Object.fromEntries(
      Object.entries(source).filter(([k, v]) => !have[k] || (sources[def.id] && sources[def.id][k] !== undefined && sources[def.id][k] !== v)),
    );
    if (Object.keys(todo).length > 0) jobs.push({ def, locale, todo, source });
  }
}
console.log(`${jobs.length} template-language pairs to translate`);

await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const { def, locale, todo, source } = jobs.shift();
      const done = await translate(todo, locale, def.brand.name);
      table[def.id] ??= {};
      table[def.id][locale] = Object.fromEntries(
        Object.keys(source).map((k) => [k, done[k] ?? table[def.id][locale]?.[k]]).filter(([, v]) => v),
      );
      sources[def.id] = source;
      await writeFile(FILE, `${JSON.stringify(table, null, 1)}\n`);
      await writeFile(SOURCE_FILE, JSON.stringify(sources));
      console.log(`ok  ${def.id} ${locale} (${Object.keys(todo).length})`);
    }
  }),
);
console.log("done");
