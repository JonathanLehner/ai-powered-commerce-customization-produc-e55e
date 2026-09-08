// Self-check for the storefront languages: npm run locale-check
//
// The workspace offers a language dropdown, so the promise it makes has to hold
// for every entry in it: a full dictionary, matching placeholders, a locale tag
// that actually changes how money and dates read, and no English left behind.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_OPTIONS,
  copyFor,
  fmt,
  fmtAround,
  isLanguageCode,
  joinList,
  localeDate,
  localeMoney,
  localeTag,
  resolveLanguage,
  storefrontLocale,
} from "../src/lib/i18n.ts";
import { localCountries, localCountryName, matchCountry, searchCountries } from "../src/lib/countries.ts";

/* ------------------------------------------- the dropdown lists what exists */

assert.equal(LANGUAGE_OPTIONS.length, LANGUAGES.length);
assert.deepEqual(
  LANGUAGE_OPTIONS.map((l) => l.code),
  LANGUAGES.map((l) => l.code),
  "the dropdown must offer exactly the languages that have a dictionary",
);
for (const option of LANGUAGE_OPTIONS) {
  assert.ok(option.label, `${option.code} has no English label`);
  assert.ok(option.endonym, `${option.code} has no native name`);
}

/* ------------------------------------------------- every dictionary is whole */

/** Flattens to "group.key" -> string so two dictionaries can be compared. */
function flatten(value, prefix = "") {
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object") Object.assign(out, flatten(entry, path));
    else out[path] = entry;
  }
  return out;
}

// The set of names, not their count: a translation may repeat one where the
// sentence reads better for it, but it must not drop or invent one.
const placeholders = (template) =>
  [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

const english = flatten(copyFor("en"));
const englishKeys = Object.keys(english).sort();
assert.ok(englishKeys.length > 150, "the English dictionary looks truncated");

for (const { code } of LANGUAGES) {
  const dictionary = flatten(copyFor(code));
  assert.deepEqual(
    Object.keys(dictionary).sort(),
    englishKeys,
    `${code} does not have the same keys as English`,
  );
  for (const [key, value] of Object.entries(dictionary)) {
    assert.equal(typeof value, "string", `${code}.${key} is not a string`);
    assert.ok(value.trim().length > 0, `${code}.${key} is empty`);
    // A dropped placeholder silently prints the wrong sentence, e.g. a total
    // with no amount in it, so parity with English is enforced.
    assert.deepEqual(
      placeholders(value),
      placeholders(english[key]),
      `${code}.${key} does not carry the same placeholders as English`,
    );
  }
}

// Every non-English storefront actually reads differently: a dictionary copied
// wholesale from English would pass the shape checks above but not this one.
const SAMPLE = ["basket.title", "checkout.title", "order.whatYouOrdered", "shop.title"];
for (const { code } of LANGUAGES) {
  if (code === "en") continue;
  const dictionary = flatten(copyFor(code));
  for (const key of SAMPLE) {
    assert.notEqual(dictionary[key], english[key], `${code}.${key} is still the English string`);
  }
}

/* --------------------------------------------------------- resolving a code */

assert.equal(resolveLanguage("de"), "de");
assert.equal(resolveLanguage("kl"), DEFAULT_LANGUAGE, "an unsupported code falls back to English");
assert.equal(resolveLanguage(null), DEFAULT_LANGUAGE);
assert.equal(resolveLanguage(undefined), DEFAULT_LANGUAGE);
assert.equal(isLanguageCode("ja"), true);
assert.equal(isLanguageCode("kl"), false);

/* ------------------------------------------------ money and dates follow the language */

// Intl separates groups and the symbol with non-breaking spaces in several of
// these languages; the check is about the shape, not which space was used.
const spaces = (value) => value.replace(/[\u00a0\u202f\u2009]/g, " ");

// The bug this check exists for: every storefront formatted as US English.
assert.equal(spaces(localeMoney(249900, "EUR", "de")), "2.499,00 \u20ac");
assert.equal(spaces(localeMoney(249900, "EUR", "fr")), "2 499,00 \u20ac");
assert.equal(spaces(localeMoney(249900, "EUR", "en")), "\u20ac2,499.00");
assert.notEqual(localeMoney(249900, "EUR", "de"), localeMoney(249900, "EUR", "en"));

// Zero-decimal currencies still round-trip in every language.
assert.equal(spaces(localeMoney(2500, "JPY", "ja")), "\uffe52,500");

const day = "2026-03-09T10:30:00.000Z";
assert.notEqual(localeDate(day, "de"), localeDate(day, "en"));
assert.notEqual(localeDate(day, "ja"), localeDate(day, "en"));
for (const { code, tag } of LANGUAGES) {
  assert.equal(localeTag(code), tag);
  assert.ok(localeDate(day, code).length > 0, `${code} cannot format a date`);
}
assert.equal(localeTag("kl"), localeTag("en"), "an unknown code still formats as English");

/* --------------------------------------------------------------- interpolation */

assert.equal(fmt("Basket ({count})", { count: 3 }), "Basket (3)");
assert.equal(fmt("Hello {name}", {}), "Hello {name}", "an unfilled placeholder is left visible");
assert.deepEqual(fmtAround("before {x} after", "x"), ["before ", " after"]);
assert.deepEqual(fmtAround("no placeholder", "x"), ["no placeholder", ""]);
// Word order is the translation's, not English's.
assert.deepEqual(fmtAround(copyFor("ja").checkout.paymentNote, "account")[0].includes("Stripe"), true);

assert.equal(joinList(["a"], "and"), "a");
assert.equal(joinList(["a", "b"], "and"), "a and b");
assert.equal(joinList(["a", "b", "c"], "und"), "a, b und c");

/* ----------------------------------------------------- the per-request bundle */

const german = storefrontLocale({ defaultLanguage: "de" });
assert.equal(german.language, "de");
assert.equal(german.tag, "de-DE");
assert.equal(german.t.basket.title, "Ihr Warenkorb");
assert.equal(spaces(german.money(1999, "EUR")), "19,99 \u20ac");
assert.ok(german.dateTime(day).length > 0);

const legacy = storefrontLocale({ defaultLanguage: "kl" });
assert.equal(legacy.language, "en", "a store saved with a retired language still renders");

/* ------------------------------------------------- country names follow the language */

assert.equal(localCountryName("DE", "de-DE"), "Deutschland");
assert.equal(localCountryName("DE", "fr-FR"), "Allemagne");
assert.equal(localCountryName("DE"), "Germany");
assert.equal(localCountryName("ZZ", "de-DE"), "ZZ", "an unknown code is shown as itself");

// A German storefront lists German names, in German alphabetical order.
const germanCountries = localCountries("de-DE");
assert.equal(germanCountries.length, localCountries().length);
assert.deepEqual(
  germanCountries.map((c) => c.name),
  [...germanCountries.map((c) => c.name)].sort((a, b) => a.localeCompare(b, "de-DE")),
);

// Both the translated and the English name find the row, so autofill still works.
assert.equal(searchCountries("Deutschland", "de-DE")[0].code, "DE");
assert.equal(searchCountries("Germany", "de-DE")[0].code, "DE");
assert.equal(matchCountry("Deutschland", "de-DE")?.code, "DE");
assert.equal(matchCountry("Germany", "de-DE")?.code, "DE");
assert.equal(matchCountry("DE", "de-DE")?.code, "DE");

/* --------------------------------- the demo tenancy shows more than one language */

// Nine dictionaries are worth nothing on a tour if every seeded store is set to
// English, which is exactly how this shipped: the feature existed and nothing a
// visitor could click showed it. The seed is read as text — it talks to the
// platform database when it runs, so it cannot be imported — and checked for a
// store that is actually set to a non-English language, with its own copy.
const seed = await readFile(new URL("./seed.mjs", import.meta.url), "utf8");

const declared = seed.match(/const FERRO_LANGUAGE = "([a-z]{2})";/);
assert.ok(declared, "the seed no longer declares the language of the non-English demo store");
const demoLanguage = declared[1];
assert.ok(isLanguageCode(demoLanguage), `the demo store is set to ${demoLanguage}, which has no dictionary`);
assert.notEqual(demoLanguage, "en", "at least one demo store has to run in a language other than English");

/** The literal between `id: "str_x",` and the end of that store record. */
function storeBlock(id) {
  const start = seed.indexOf(`    id: "${id}",`);
  assert.notEqual(start, -1, `${id} is not in the seed any more`);
  const end = seed.indexOf("\n  },", start);
  return seed.slice(start, end);
}

assert.match(
  storeBlock("str_ferro"),
  /defaultLanguage: FERRO_LANGUAGE,/,
  "the German demo store must read its language from the shared constant",
);
// Its checkout only renders at all with a payment account behind it, so the
// language is only visible end to end if the store is actually able to sell.
assert.match(storeBlock("str_ferro"), /stripe: \{ connected: true[^}]*chargesEnabled: true/);

// The contrast is the point: the other stores stay English.
for (const id of ["str_northwind", "str_lumen", "str_halcyon", "str_rivet"]) {
  assert.match(storeBlock(id), /defaultLanguage: "en",/, `${id} should stay English for contrast`);
}

// Seeded copy, not just a seeded setting: the shopper-facing strings the store
// owns — product names, descriptions and the personalisation label — have to be
// written in that language rather than left in English.
const ferroPlans = seed
  .split(/\n  \{\n/)
  .filter((block) => block.startsWith('    storeId: "str_ferro", catalogId:'));
assert.ok(
  ferroPlans.filter((block) => block.includes('status: "published"')).length >= 3,
  "the German demo store needs published products, or its storefront is empty",
);
for (const block of ferroPlans) {
  const description = block.match(/description:\s*\n?\s*"([\s\S]*?)",\n/);
  assert.ok(description, "a Ferro product has no description");
  assert.match(
    description[1],
    /[äöüßÄÖÜ]/,
    "Ferro product descriptions must be written in German, not English",
  );
  assert.match(block, /textLabel: "[^"]*[äöüÄÖÜ]?[^"]*"/, "a Ferro product has no personalisation label");
}

console.log("locale-check: OK");
