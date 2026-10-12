// Self-check for storefront search: npm run search-check
//
// The search page and the header's instant results run the same Fuse.js
// search over the same documents, so this checks that: a slip of a letter or
// two still finds the product meant; unrelated words do not match; several
// words must all match; only what a shopper can see is searchable (published
// pages and posts, collections with products in them); and everything is
// searched and shown in the shopper's language.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesRoute } from "../src/lib/routes.ts";
import { cleanQuery, SEARCH_LIMITS, searchDocuments, searchStore } from "../src/lib/search.ts";
import { withTranslation } from "../src/lib/translations.ts";

const product = (id, name, extra = {}) => ({
  id,
  name,
  slug: id,
  description: extra.description ?? `${name} made to order.`,
  tags: extra.tags ?? [],
  price: extra.price ?? 2500,
  currency: "EUR",
  variants: [{ id: `${id}-v`, price: extra.price ?? 2500, enabled: true }],
  mockups: [{ url: `https://assets.clawcorp.ai/${id}.png` }],
  shopperCustomization: { artworkUpload: false, textLine: false, textLabel: "", maxTextLength: 0 },
  translations: extra.translations,
});
const products = [
  product("hoodie", "Heavyweight Hoodie", { tags: ["apparel"], translations: withTranslation(undefined, "de", "name", "Schwerer Kapuzenpulli") }),
  product("tee", "Organic Field T-Shirt", { tags: ["apparel", "cotton"] }),
  product("mug", "Enamel Camp Mug", { description: "A blue enamel mug for coffee.", tags: ["drinkware"] }),
  product("blue-tote", "Blue Canvas Tote", { tags: ["bags"] }),
];
const collections = [
  { id: "col_1", name: "Winter layers", handle: "winter", description: "Warm things", imageUrl: null, productIds: ["hoodie"], translations: withTranslation(undefined, "de", "name", "Winterlagen") },
  { id: "col_2", name: "Empty shelf", handle: "empty", description: "", imageUrl: null, productIds: [] },
];
const entry = (id, kind, title, status = "published", extra = {}) => ({
  id,
  kind,
  title,
  handle: id,
  body: extra.body ?? "<p>Text</p>",
  excerpt: extra.excerpt ?? "",
  seoTitle: "",
  seoDescription: "",
  coverImageUrl: null,
  status,
  translations: extra.translations,
});
const entries = [
  entry("shipping-faq", "page", "Shipping FAQ", "published", { body: "<p>We deliver across Europe in five days.</p>" }),
  entry("about", "page", "About us", "published", { translations: withTranslation(undefined, "de", "title", "Über uns") }),
  entry("draft-sale", "post", "Secret summer sale", "draft"),
  entry("care", "post", "How to care for enamel", "published"),
];

const docs = searchDocuments({ products, collections, entries }, "en", "en");
const titles = (query, list = docs) => searchStore(list, query).map((doc) => doc.title);

/* ---------------------------------------------------------------- matching */

assert.equal(titles("hoodie")[0], "Heavyweight Hoodie");
assert.equal(titles("hodie")[0], "Heavyweight Hoodie", "a missing letter still finds it");
assert.equal(titles("hoddie")[0], "Heavyweight Hoodie", "a doubled letter still finds it");
assert.equal(titles("tshirt")[0], "Organic Field T-Shirt", "punctuation in the name does not matter");
assert.equal(titles("emanel")[0], "Enamel Camp Mug", "swapped letters still find it");
assert.equal(titles("shiping")[0], "Shipping FAQ", "pages are searched too");
assert.ok(titles("winter").includes("Winter layers"), "and collections");
assert.ok(titles("care").includes("How to care for enamel"), "and blog posts");
assert.deepEqual(titles("xylophone"), [], "an unrelated word finds nothing");
assert.deepEqual(titles("blue mug"), ["Enamel Camp Mug"], "every word has to match: not the blue tote");
assert.ok(titles("apparel").includes("Heavyweight Hoodie"), "tags are searched");

/* ---------------------------------------------------------- what is shown */

assert.ok(!titles("secret sale").length, "a draft post is not searchable");
assert.ok(!titles("empty shelf").length, "an empty collection is not searchable");
assert.deepEqual(searchStore(docs, "h"), [], "one letter is not a search");
assert.equal(cleanQuery("  blue   mug  "), "blue mug");
assert.equal(cleanQuery("x".repeat(200)).length, SEARCH_LIMITS.query);
assert.equal(cleanQuery(undefined), "");
const many = searchDocuments({ products: Array.from({ length: 30 }, (_, i) => product(`tee-${i}`, `Field Tee ${i}`)), collections: [], entries: [] }, "en", "en");
assert.equal(searchStore(many, "tee", SEARCH_LIMITS.instant).length, SEARCH_LIMITS.instant, "instant results are capped");

const hoodie = docs.find((doc) => doc.id === "hoodie");
assert.equal(hoodie.path, "/products/hoodie");
assert.equal(hoodie.price, 2500);
assert.equal(docs.find((doc) => doc.id === "shipping-faq").path, "/pages/shipping-faq");
assert.equal(docs.find((doc) => doc.id === "care").path, "/blog/care");

/* ------------------------------------------------------------ in German */

const german = searchDocuments({ products, collections, entries }, "de", "en");
assert.equal(titles("kapuzenpuli", german)[0], "Schwerer Kapuzenpulli", "the translated name is searched, typos and all");
assert.ok(titles("winterlagen", german).includes("Winterlagen"));
assert.ok(titles("uber uns", german).includes("Über uns") || titles("über uns", german).includes("Über uns"));
assert.equal(titles("enamel", german)[0], "Enamel Camp Mug", "an untranslated product is found by its source name");

/* ----------------------------------------------------------------- wiring */

assert.ok(matchesRoute("/s/north/search") && matchesRoute("/s/north/de/search"), "the search page is a page");
const layout = readFileSync(new URL("../src/app/s/[slug]/[locale]/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /<StoreSearch /, "the header carries the search box");
const box = readFileSync(new URL("../src/components/StoreSearch.tsx", import.meta.url), "utf8");
assert.match(box, /setTimeout\(/, "instant results wait for a pause in typing");
assert.match(box, /request === latest\.current/, "a slow earlier answer cannot replace a newer one");
assert.match(box, /action=\{`\$\{base\}\/search`\}/, "without JavaScript the box opens the search page");

console.log("search-check ok");
