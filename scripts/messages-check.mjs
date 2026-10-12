// Self-check for the interface translations: npm run messages-check
//
// English (messages/en.json) is the source. Every other language has to carry
// every key English has, with a non-empty value, the same placeholders and the
// same rich-text tags, and nothing English no longer has. A missing key would
// show the raw key to someone using the workspace in that language. Components
// are scanned too: an aria-label or sr-only text written as an English literal
// would be read out in English whatever the language.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import { DEFAULT_LOCALE, LOCALES } from "../src/i18n/locales.ts";

const read = (locale) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url)), "utf8"));

/** "home.features.sourcing.points.0" -> value, for strings anywhere in the tree. */
function flatten(value, prefix = "", out = new Map()) {
  if (typeof value === "string") {
    out.set(prefix, value);
  } else if (Array.isArray(value)) {
    value.forEach((entry, i) => flatten(entry, `${prefix}.${i}`, out));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) flatten(entry, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out.set(prefix, value);
  }
  return out;
}

/** The placeholders and tags a message uses, e.g. ["arg:count", "tag:code"]. */
function slots(message) {
  const found = new Set();
  (function walk(nodes) {
    for (const node of nodes) {
      if (node.type === TYPE.argument || node.type === TYPE.number || node.type === TYPE.date || node.type === TYPE.time) {
        found.add(`arg:${node.value}`);
      } else if (node.type === TYPE.select || node.type === TYPE.plural) {
        found.add(`arg:${node.value}`);
        for (const option of Object.values(node.options)) walk(option.value);
      } else if (node.type === TYPE.tag) {
        found.add(`tag:${node.value}`);
        walk(node.children);
      }
    }
  })(parse(message));
  return [...found].sort();
}

const source = flatten(read(DEFAULT_LOCALE));
assert.ok(source.size > 100, "messages/en.json looks almost empty");

const problems = [];
for (const locale of LOCALES) {
  let messages;
  try {
    messages = flatten(read(locale));
  } catch (error) {
    problems.push(`${locale}: messages/${locale}.json is missing or not valid JSON (${error.message})`);
    continue;
  }
  for (const [key, english] of source) {
    if (!messages.has(key)) {
      problems.push(`${locale}: missing ${key}`);
      continue;
    }
    const value = messages.get(key);
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${locale}: empty ${key}`);
      continue;
    }
    let expected, actual;
    try {
      expected = slots(english);
      actual = slots(value);
    } catch (error) {
      problems.push(`${locale}: ${key} is not a valid message (${error.message})`);
      continue;
    }
    if (expected.join() !== actual.join()) {
      problems.push(`${locale}: ${key} uses ${actual.join(", ") || "nothing"}, English uses ${expected.join(", ") || "nothing"}`);
    }
    // The copy rules: no em dashes in interface text.
    if (value.includes("—")) problems.push(`${locale}: ${key} contains an em dash`);
  }
  for (const key of messages.keys()) {
    if (!source.has(key)) problems.push(`${locale}: ${key} is not in English`);
  }
}

/* ------------------------------------- screen-reader text in the components */

// An aria-label or an sr-only element written as an English literal reads out
// in English on every language, however complete the message files are. Every
// such string in a component has to come from a translator call instead. Only
// the brand name is the same in every language.
const UNTRANSLATED_OK = new Set(["Parcelith"]);
const WORDS = /\p{L}{2,}/u;

function* components(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* components(path);
    else if (entry.name.endsWith(".tsx")) yield path;
  }
}

/** Index of the brace closing the one at `start`. */
function closingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length;
}

/** String literals with words in them in a JSX expression, leaving out keys passed to a translator such as t("close"). */
function literalsIn(expression) {
  const rest = expression.replace(/[\w$.]+\(\s*(["'`])[^"'`]*\1/g, "").replace(/\$\{[^}]*\}/g, "");
  return [...rest.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((match) => match[2]).filter((text) => WORDS.test(text));
}

/** Text a JSX body would read out: bare text between tags, plus string literals inside {expressions}. */
function spokenText(body) {
  let text = "";
  const literals = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") {
      const end = closingBrace(body, i);
      literals.push(...literalsIn(body.slice(i + 1, end)));
      i = end;
    } else text += body[i];
  }
  const bare = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return [...(WORDS.test(bare) ? [bare] : []), ...literals];
}

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
let scanned = 0;
for (const file of components(srcDir)) {
  scanned++;
  const code = readFileSync(file, "utf8");
  const where = (index) => `${file.slice(srcDir.length - 3)}:${code.slice(0, index).split("\n").length}`;
  const report = (index, kind, texts) => {
    for (const text of texts) if (!UNTRANSLATED_OK.has(text)) problems.push(`${where(index)}: untranslated ${kind} "${text}"`);
  };

  // aria-label="Close", aria-label={"Close"}, aria-label={open ? "Close" : "Open"}, "aria-label": "Close"
  for (const match of code.matchAll(/aria-label=(?:"([^"]*)"|'([^']*)'|\{)|["']aria-label["']\s*:\s*(["'`])((?:(?!\3).)*)\3/g)) {
    if (match[1] !== undefined || match[2] !== undefined) {
      const text = match[1] ?? match[2];
      report(match.index, "aria-label", WORDS.test(text) ? [text] : []);
    } else if (match[4] !== undefined) {
      report(match.index, "aria-label", WORDS.test(match[4]) ? [match[4]] : []);
    } else {
      const start = match.index + match[0].length - 1;
      report(match.index, "aria-label", literalsIn(code.slice(start + 1, closingBrace(code, start))));
    }
  }

  // <span className="sr-only">Close</span>, and any other element styled sr-only.
  for (const match of code.matchAll(/\bsr-only\b/g)) {
    const open = code.lastIndexOf("<", match.index);
    const tag = /^<([A-Za-z][\w.]*)/.exec(code.slice(open))?.[1];
    if (!tag) continue;
    // The end of the opening tag, stepping over {expressions} that may hold ">".
    let end = open;
    while (end < code.length && code[end] !== ">") end = code[end] === "{" ? closingBrace(code, end) + 1 : end + 1;
    if (code[end - 1] === "/") continue;
    const close = code.indexOf(`</${tag}>`, end);
    if (close < 0) continue;
    report(open, "sr-only text", spokenText(code.slice(end + 1, close)));
  }
}
assert.ok(scanned > 50, "no components were scanned");

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\nmessages-check failed: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(`messages-check ok: ${source.size} messages in ${LOCALES.length} languages, ${scanned} components free of untranslated screen-reader text`);
