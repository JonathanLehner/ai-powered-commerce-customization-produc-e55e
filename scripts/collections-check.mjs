// Self-check for product collections: npm run collections-check
//
// A collection is an ordered list of product ids the browser edits by drag and
// drop, so the rules that matter are the ones that keep that list honest: a
// stale tab or a forged request cannot duplicate a product, add one from
// another store or lose one added elsewhere; the storefront shows only what is
// on sale, in the team's order; the sorts are stable; a handle is a clean,
// unique address; and the name and description fall back to the source.
import assert from "node:assert/strict";
import {
  applyOrder,
  cleanIdList,
  collectionFields,
  collectionProducts,
  isValidHandle,
  localizeCollection,
  navCollectionIds,
  normalizeHandle,
  parseSort,
  sortProducts,
  uniqueHandle,
} from "../src/lib/collections.ts";
import { withTranslation } from "../src/lib/translations.ts";
import { matchesRoute } from "../src/lib/routes.ts";

/* ------------------------------------------------------------------ handles */

assert.equal(normalizeHandle("New hires"), "new-hires");
assert.equal(normalizeHandle("  Tassen & Becher "), "tassen-becher");
assert.equal(normalizeHandle("Café Crème"), "cafe-creme", "accents are folded, not dropped");
assert.ok(isValidHandle("new-hires"));
for (const bad of ["", "New", "a--b", "-a", "a-", "a b", "ä"]) assert.ok(!isValidHandle(bad), `"${bad}" is not a handle`);
assert.equal(uniqueHandle("Apparel", []), "apparel");
assert.equal(uniqueHandle("Apparel", ["apparel"]), "apparel-2");
assert.equal(uniqueHandle("Apparel", ["apparel", "apparel-2"]), "apparel-3");
assert.equal(uniqueHandle("!!!", []), "collection", "a name with no letters still gets an address");
assert.ok(uniqueHandle("x".repeat(80), ["x".repeat(60)]).length <= 60, "a suffixed handle stays within the limit");

/* ---------------------------------------------------------- lists from the browser */

const store = ["p1", "p2", "p3", "p4"];
assert.deepEqual(cleanIdList(["p2", "p1", "p2"], store), ["p2", "p1"], "a product appears once");
assert.deepEqual(cleanIdList(["p1", "other-store", 7, null], store), ["p1"], "only this store's products");
assert.deepEqual(cleanIdList("p1", store), [], "anything but a list is nothing");

// A drag in a tab that has not seen a product added since: the new one keeps
// its place after the reordered ones instead of being dropped.
assert.deepEqual(applyOrder(["p1", "p2", "p3"], ["p3", "p1"]), ["p3", "p1", "p2"]);
// A product removed elsewhere is not brought back by a stale order.
assert.deepEqual(applyOrder(["p1", "p3"], ["p3", "p2", "p1"]), ["p3", "p1"]);
assert.deepEqual(applyOrder(["p1", "p2"], ["p2", "p2", "p1"]), ["p2", "p1"], "repeats in a request are ignored");

/* ---------------------------------------------------------------- storefront */

const live = [
  { id: "p1", price: 3200, publishedAt: "2026-09-01T00:00:00Z", importedAt: "2026-08-01T00:00:00Z" },
  { id: "p2", price: 1800, publishedAt: "2026-10-01T00:00:00Z", importedAt: "2026-08-02T00:00:00Z" },
  { id: "p3", price: 3200, publishedAt: null, importedAt: "2026-09-15T00:00:00Z" },
];
// p4 is in the collection but not on sale, so the shopper never sees it.
const featured = collectionProducts(["p3", "p4", "p1", "p2"], live);
assert.deepEqual(featured.map((p) => p.id), ["p3", "p1", "p2"], "the team's order, without what is off sale");

const ids = (list) => list.map((p) => p.id);
assert.deepEqual(ids(sortProducts(featured, "featured")), ["p3", "p1", "p2"]);
assert.deepEqual(ids(sortProducts(featured, "price-asc")), ["p2", "p3", "p1"], "equal prices keep the featured order");
assert.deepEqual(ids(sortProducts(featured, "price-desc")), ["p3", "p1", "p2"]);
assert.deepEqual(ids(sortProducts(featured, "newest")), ["p2", "p3", "p1"], "never published falls back to the import date");
assert.deepEqual(ids(featured), ["p3", "p1", "p2"], "sorting does not reorder the list it was given");
assert.equal(parseSort("price-asc"), "price-asc");
assert.equal(parseSort("random"), "featured");
assert.equal(parseSort(undefined), "featured");

assert.ok(matchesRoute("/s/northwind-supply/collections/new-hires"));
assert.ok(matchesRoute("/s/northwind-supply/de/collections/new-hires"));
assert.ok(!matchesRoute("/s/northwind-supply/collections"), "there is no collection index page");
assert.ok(matchesRoute("/app/stores/str_1/catalog/collections"));
assert.ok(matchesRoute("/app/stores/str_1/catalog/collections/col_1"));

/* ------------------------------------------------------------- translations */

const apparel = {
  name: "Apparel",
  description: "Tees and hoodies.",
  translations: withTranslation(undefined, "de", "name", "Bekleidung"),
};
assert.deepEqual(collectionFields(apparel).map((f) => f.key), ["name", "description"]);
const german = localizeCollection(apparel, "de", "en");
assert.equal(german.name, "Bekleidung");
assert.equal(german.description, "Tees and hoodies.", "an untranslated description shows the source");
assert.equal(localizeCollection(apparel, "fr", "en").name, "Apparel");
assert.equal(localizeCollection(apparel, "en", "en"), apparel, "the default language is the source itself");

/* --------------------------------------------------------------- navigation */

assert.deepEqual(navCollectionIds({ ROOT: { props: { navCollections: ["c1", 4, "c2"] } } }), ["c1", "c2"]);
assert.deepEqual(navCollectionIds({ ROOT: { props: {} } }), []);
assert.deepEqual(navCollectionIds(null), []);
// The header resolves ids against the store's collections, so one deleted
// since the page was published is skipped rather than linked.
assert.deepEqual(
  collectionProducts(["c2", "gone", "c1"], [{ id: "c1" }, { id: "c2" }]).map((c) => c.id),
  ["c2", "c1"],
);

console.log("collections-check ok");
