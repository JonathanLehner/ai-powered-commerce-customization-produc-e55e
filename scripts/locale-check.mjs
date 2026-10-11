// Self-check for the storefront languages: npm run locale-check
//
// Storefronts and gift portals read their built-in copy from messages/<locale>.json
// through next-intl, and each store chooses which of the nine languages it is
// available in. The promise the settings page makes has to hold for every one
// of them: a full set of shopper messages, the same placeholders as English,
// money and dates that actually read differently, addresses that carry the
// language, and negotiation that never lands on a language the store has not
// enabled.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "../src/i18n/locales.ts";
import { formatMinorUnits } from "../src/i18n/format.ts";
import { negotiateShopperLocale } from "../src/i18n/shopper-negotiation.ts";
import { localeBase, storeLanguages, switchLocalePath } from "../src/i18n/storefront-routing.ts";
import { localCountries, localCountryName, matchCountry, searchCountries } from "../src/lib/countries.ts";
import { read, shopperFormat, shopperT } from "./shopper-intl.mjs";
import { productContent } from "./store-content.mjs";

/* -------------------------------------------- the hand-rolled layer is gone */

for (const path of ["../src/lib/i18n.ts", "../src/lib/copy"]) {
  assert.ok(!existsSync(new URL(path, import.meta.url)), `${path.slice(3)} is back; the shopper copy lives in messages/`);
}

/* ------------------------------------------ every language has the shopper copy */

/** Flattens to "group.key" -> string so two languages can be compared. */
function flatten(value, prefix = "") {
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object") Object.assign(out, flatten(entry, path));
    else out[path] = entry;
  }
  return out;
}

/** The ICU arguments a message uses. A translation must not drop or invent one. */
function placeholders(message) {
  const found = new Set();
  (function walk(nodes) {
    for (const node of nodes) {
      if (node.type === TYPE.argument || node.type === TYPE.number || node.type === TYPE.date) found.add(node.value);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        found.add(node.value);
        for (const option of Object.values(node.options)) walk(option.value);
      }
      if (node.type === TYPE.tag) walk(node.children);
    }
  })(parse(message, { ignoreTag: false }));
  return [...found].sort();
}

const english = flatten(read("en").storefront);
const englishKeys = Object.keys(english).sort();
assert.ok(englishKeys.length > 150, "the English shopper messages look truncated");

for (const code of LOCALES) {
  const messages = flatten(read(code).storefront);
  assert.deepEqual(Object.keys(messages).sort(), englishKeys, `${code} does not have the same shopper keys as English`);
  for (const [key, value] of Object.entries(messages)) {
    assert.equal(typeof value, "string", `${code}.${key} is not a string`);
    assert.ok(value.trim().length > 0, `${code}.${key} is empty`);
    // A dropped placeholder silently prints the wrong sentence, e.g. a total
    // with no amount in it, so parity with English is enforced.
    assert.deepEqual(placeholders(value), placeholders(english[key]), `${code}.${key} does not carry English's placeholders`);
    // The copy rules: no em dashes anywhere a shopper reads.
    assert.ok(!value.includes("\u2014"), `${code}.${key} uses an em dash`);
  }
}

// Every non-English storefront actually reads differently: messages copied
// wholesale from English would pass the shape checks above but not this one.
const SAMPLE = ["basket.title", "checkout.title", "order.whatYouOrdered", "shop.title", "actions.basketEmpty", "payment.invalidNumber"];
for (const code of LOCALES) {
  if (code === "en") continue;
  const messages = flatten(read(code).storefront);
  for (const key of SAMPLE) {
    assert.notEqual(messages[key], english[key], `${code}.${key} is still the English string`);
  }
}

// next-intl formats them: placeholders fill, nothing is left in braces.
assert.equal(shopperT("en", "actions")("outOfStock", { variant: "Navy / M" }), "Navy / M is out of stock.");
assert.equal(shopperT("de", "basket")("title"), "Ihr Warenkorb");
for (const code of LOCALES) {
  const filled = shopperT(code, "discount")("applied", { code: "SPRING10", amount: "5" });
  assert.ok(filled.includes("SPRING10") && !/\{\w+\}/.test(filled), `${code} discount.applied did not fill`);
}

/* ------------------------------------- the gift portal is translated as well */

// The bug this exists for: the private gift portal under src/app/g shipped with
// its copy written straight into the JSX — "Preview coming soon" beside a
// product with no mockup, "Over limit" on a badge — so a German store's
// storefront read in German while its own gifting portal stayed in English. The
// portal is the store's surface too, and it renders in the store's language, so
// every shopper-facing string in it has to come from the messages.
for (const code of LOCALES) {
  if (code === "en") continue;
  const messages = flatten(read(code).storefront);
  for (const key of ["gift.startOrder", "gift.previewSoon", "gift.overLimit", "gift.recipientsTitle"]) {
    assert.notEqual(messages[key], english[key], `${code}.${key} is still the English string`);
  }
}

const PORTAL = fileURLToPath(new URL("../src/app/g/", import.meta.url));

/**
 * The English the portal is still allowed to contain, and why.
 *
 * Each of these renders only for an address that belongs to no catalogue, or to
 * a catalogue whose store could not be loaded. There is no store language to
 * read at that point, so Parcelith's own English is all that is left to say —
 * exactly as on the storefront's "no such shop" page.
 */
const ALLOWED_ENGLISH = new Set([
  "Corporate gifting powered by Parcelith.",
  "Bulk gift order",
  "Gift campaign",
]);

const portalFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) portalFiles.push(path);
  }
})(PORTAL);
assert.ok(portalFiles.length >= 8, "the gift portal scan found almost nothing — has src/app/g moved?");

/** Drops comments, so prose explaining the rule is not read as breaking it. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Two short English words in a row, either case on the first. Portal copy now
 * arrives as `{t("…")}`, so a sentence left in the source — in the JSX, in a
 * template literal, in a validation message — still reads like English and
 * nothing else in TypeScript does. The second word has to be plain lowercase so
 * `of readdirSync` and `of giftProductOptions` are not mistaken for prose.
 */
const ENGLISH_WORDS = [
  "the", "your", "you", "every", "their", "this", "that", "with", "from", "are", "was", "has",
  "have", "its", "not", "any", "and", "all", "of", "is", "it", "or", "be", "no", "we", "our",
  "will", "can", "cannot", "until", "once", "nothing", "something",
];
const PROSE = new RegExp(
  `\\b(?:${ENGLISH_WORDS.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|")})` +
    `\\s+[a-z]{2,}\\b(?![\\w.(])`,
  "g",
);

/** A bare JSX text node that has a word in it was never passed through a translator. */
const JSX_TEXT = />([^<>{}]+)<\//g;

// Props and object keys that carry a sentence to the screen: a literal there is
// copy, wherever in the file it sits.
const COPY_PROPS =
  /(?:^|[\s{(,])(?:title|description|label|submitLabel|pendingLabel|confirmLabel|cancelLabel|question|eyebrow|note|placeholder|approverLabel|aria-label)\s*[:=]\s*\{?\s*"([^"]+)"/g;

const allowed = (value) => ALLOWED_ENGLISH.has(value.trim());

for (const path of portalFiles) {
  const source = withoutComments(readFileSync(path, "utf8"));
  const name = `src/app/g/${path.slice(PORTAL.length)}`;

  for (const [, text] of source.matchAll(JSX_TEXT)) {
    const value = text.trim();
    if (!value || !/[A-Za-z]{2,}/.test(value) || allowed(value)) continue;
    assert.fail(`${name} renders the untranslated string “${value}”`);
  }

  for (const [, value] of source.matchAll(COPY_PROPS)) {
    if (!/[A-Za-z]{2,}/.test(value) || allowed(value)) continue;
    assert.fail(`${name} passes the untranslated string “${value}”`);
  }

  for (const [phrase] of source.matchAll(PROSE)) {
    assert.fail(`${name} still writes English copy in the source: “${phrase}…”`);
  }
}

/* ------------------------------------------------------ languages per store */

// A store saved before languages could be chosen is available in its default only.
assert.deepEqual(storeLanguages({ defaultLanguage: "de" }), { locales: ["de"], defaultLocale: "de" });
// The default is always enabled, the order is the switcher's, and a retired code is dropped.
assert.deepEqual(storeLanguages({ defaultLanguage: "fr", languages: ["ja", "en", "kl"] }), {
  locales: ["en", "fr", "ja"],
  defaultLocale: "fr",
});
assert.equal(storeLanguages({ defaultLanguage: "kl" }).defaultLocale, DEFAULT_LOCALE, "a retired default falls back to English");

/* ------------------------------------------------- the language is in the path */

const root = "/s/northwind-supply";
assert.equal(localeBase(root, "en", "en"), root, "the default language keeps the plain address");
assert.equal(localeBase(root, "de", "en"), `${root}/de`);
assert.equal(switchLocalePath(`${root}/products/tee`, root, "de", "en"), `${root}/de/products/tee`);
assert.equal(switchLocalePath(`${root}/de/products/tee`, root, "fr", "en"), `${root}/fr/products/tee`);
assert.equal(switchLocalePath(`${root}/de/products/tee`, root, "en", "en"), `${root}/products/tee`);
assert.equal(switchLocalePath(`${root}/de`, root, "en", "en"), root);
assert.equal(switchLocalePath("/g/helio/c/CMP-1", "/g/helio", "de", "fr"), "/g/helio/de/c/CMP-1");

/* -------------------------------- negotiation: cookie, Accept-Language, default */

const northwind = storeLanguages({ defaultLanguage: "en", languages: ["en", "de"] });
const negotiate = (cookie, acceptLanguage, store = northwind) =>
  negotiateShopperLocale({ cookie, acceptLanguage }, store);

assert.equal(negotiate(undefined, null), "en", "nothing to go on serves the store default");
assert.equal(negotiate(undefined, "de-CH,de;q=0.9,en;q=0.8"), "de", "the browser's language when the store has it");
assert.equal(negotiate(undefined, "fr-FR,fr;q=0.9"), "en", "a language the store has not enabled is never chosen");
assert.equal(negotiate(undefined, "fr-FR,de;q=0.5"), "de", "the browser's best enabled language wins");
assert.equal(negotiate("de", "en-US"), "de", "the cookie comes before Accept-Language");
assert.equal(negotiate("fr", "de"), "de", "a cookie for a language the store has not enabled is ignored");
assert.equal(negotiate(undefined, "de", storeLanguages({ defaultLanguage: "en" })), "en", "a one-language store never moves");
assert.equal(negotiate(undefined, "***;;q=x"), "en", "a malformed header falls back to the default");

/* ------------------------------------ money and dates follow the language, via next-intl */

// Intl separates groups and the symbol with non-breaking spaces in several of
// these languages; the check is about the shape, not which space was used.
const spaces = (value) => value.replace(/[\u00a0\u202f\u2009]/g, " ");
const money = (minor, currency, locale) => formatMinorUnits(shopperFormat(locale), minor, currency);

// The bug this check exists for: every storefront formatted as US English.
assert.equal(spaces(money(249900, "EUR", "de")), "2.499,00 \u20ac");
assert.equal(spaces(money(249900, "EUR", "fr")), "2 499,00 \u20ac");
assert.equal(spaces(money(249900, "EUR", "en")), "\u20ac2,499.00");
// Zero-decimal currencies still round-trip.
assert.equal(spaces(money(2500, "JPY", "ja")), "\uffe52,500");

const day = new Date("2026-03-09T10:30:00.000Z");
const date = (locale) => shopperFormat(locale).dateTime(day, { year: "numeric", month: "short", day: "numeric" });
assert.notEqual(date("de"), date("en"));
assert.notEqual(date("ja"), date("en"));
for (const code of LOCALES) assert.ok(date(code).length > 0, `${code} cannot format a date`);

/* ------------------------------------------------- country names follow the language */

assert.equal(localCountryName("DE", "de"), "Deutschland");
assert.equal(localCountryName("DE", "fr"), "Allemagne");
assert.equal(localCountryName("DE"), "Germany");
assert.equal(localCountryName("ZZ", "de"), "ZZ", "an unknown code is shown as itself");

// A German storefront lists German names, in German alphabetical order.
const germanCountries = localCountries("de");
assert.equal(germanCountries.length, localCountries().length);
assert.deepEqual(
  germanCountries.map((c) => c.name),
  [...germanCountries.map((c) => c.name)].sort((a, b) => a.localeCompare(b, "de")),
);

// Both the translated and the English name find the row, so autofill still works.
assert.equal(searchCountries("Deutschland", "de")[0].code, "DE");
assert.equal(searchCountries("Germany", "de")[0].code, "DE");
assert.equal(matchCountry("Deutschland", "de")?.code, "DE");
assert.equal(matchCountry("Germany", "de")?.code, "DE");
assert.equal(matchCountry("DE", "de")?.code, "DE");

/* --------------------------------- the demo tenancy shows more than one language */

// Nine languages are worth nothing on a tour if every seeded store is set to
// English, which is exactly how this shipped: the feature existed and nothing a
// visitor could click showed it. The seed is read as text — it talks to the
// platform database when it runs, so it cannot be imported — and checked for a
// store that is actually set to a non-English language, with its own copy.
const seed = await readFile(new URL("./seed.mjs", import.meta.url), "utf8");

const declared = seed.match(/const FERRO_LANGUAGE = "([a-z]{2})";/);
assert.ok(declared, "the seed no longer declares the language of the non-English demo store");
const demoLanguage = declared[1];
assert.ok(isLocale(demoLanguage), `the demo store is set to ${demoLanguage}, which has no messages`);
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

// The tour shows the switcher: Northwind sells in English and German, Lumen in
// English and French, each with English as the default.
assert.match(storeBlock("str_northwind"), /languages: \["en", "de"\],/);
assert.match(storeBlock("str_lumen"), /languages: \["en", "fr"\],/);

// Seeded copy, not just a seeded setting: the shopper-facing strings the store
// owns — product names, descriptions and the personalisation label — have to be
// written in that language rather than left in English. The seed takes them
// from store-content.mjs by slug.
const ferroPlans = seed
  .split(/\n  \{\n/)
  .filter((block) => block.startsWith('    storeId: "str_ferro", catalogId:'));
assert.ok(
  ferroPlans.filter((block) => block.includes('status: "published"')).length >= 3,
  "the German demo store needs published products, or its storefront is empty",
);
for (const block of ferroPlans) {
  const slug = block.match(/slug: "([^"]+)"/)?.[1];
  const copy = productContent(slug);
  assert.ok(copy?.description, `Ferro product ${slug} has no description`);
  assert.match(copy.description, /[äöüßÄÖÜ]/, "Ferro product descriptions must be written in German, not English");
  assert.ok(copy.textLabel, `Ferro product ${slug} has no personalisation label`);
  assert.ok(copy.i18n?.en?.description, `Ferro product ${slug} has no English description`);
}

console.log("locale-check: OK");
