// Self-check for the interface translations: npm run messages-check
//
// English (messages/en.json) is the source. Every other language has to carry
// every key English has, with a non-empty value, the same placeholders and the
// same rich-text tags, and nothing English no longer has. A missing key would
// show the raw key to someone using the workspace in that language.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\nmessages-check failed: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(`messages-check ok: ${source.size} messages in ${LOCALES.length} languages`);
