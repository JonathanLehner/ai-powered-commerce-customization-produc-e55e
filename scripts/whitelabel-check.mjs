// Self-check for white-labelled shopper metadata: npm run whitelabel-check
//
// A client storefront is the client's shop, not Parcelith's. The bug this
// guards against is the storefront reusing the platform's shared metadata, so
// every tab read "… · Parcelith" and every share preview pitched the agency
// platform instead of the shop the shopper is standing in.
import assert from "node:assert/strict";
import { LANGUAGES, copyFor } from "../src/lib/i18n.ts";
import { giftPortalMetadata, storeTagline, storefrontMetadata } from "../src/lib/storefront-meta.ts";
import { treeFromSections } from "../src/lib/storefront-schema.ts";

const store = {
  id: "sto_1",
  name: "Northwind Supply Co",
  clientName: "Northwind Ltd",
  slug: "northwind-supply",
  logoUrl: "https://assets.clawcorp.ai/logos/northwind.png",
  defaultLanguage: "en",
};

/* ------------------------------------------- the tagline is the store's own */

const published = treeFromSections([
  { type: "HeroSection", props: { headline: "Kit the whole team out" } },
  { type: "ProductGrid", props: {} },
]);
assert.equal(storeTagline(published), "Kit the whole team out");
assert.equal(storeTagline(treeFromSections([{ type: "ProductGrid", props: {} }])), null);
assert.equal(storeTagline(undefined), null, "an unpublished storefront simply has no tagline");
assert.equal(
  storeTagline(treeFromSections([{ type: "HeroSection", props: { headline: "   " } }])),
  null,
  "a blank headline is not a tagline",
);

/* --------------------------------------------- the storefront names the shop */

const meta = storefrontMetadata(store, storeTagline(published));

assert.equal(meta.title.template, "%s · Northwind Supply Co", "child pages carry the store, not the platform");
assert.ok(meta.title.default.startsWith("Northwind Supply Co"), "the store home is titled after the store");

// Name, client and the store's own tagline — and nothing about the platform.
assert.ok(meta.description.includes("Kit the whole team out."), "the tagline is punctuated into the sentence");
assert.ok(meta.description.includes("Northwind Supply Co"));
assert.ok(meta.description.includes("Northwind Ltd"));

// The share preview is the shop's, with the shop's logo.
assert.equal(meta.openGraph.siteName, "Northwind Supply Co");
assert.equal(meta.openGraph.title, meta.title.default);
assert.equal(meta.openGraph.description, meta.description);
assert.deepEqual(meta.openGraph.images, [
  { url: "https://assets.clawcorp.ai/logos/northwind.png", alt: "Northwind Supply Co" },
]);

// A store without a logo gets no share image rather than a stand-in one.
assert.equal(storefrontMetadata({ ...store, logoUrl: null }, null).openGraph.images, undefined);

// Without a published hero the description still describes this store.
const plain = storefrontMetadata(store, null);
assert.ok(plain.description.includes("Northwind Supply Co") && plain.description.includes("Northwind Ltd"));

/* ------------------------------------------- the gift portal names the portal */

const catalogue = {
  name: "Northwind employee gifting",
  slug: "northwind-gifts",
  companyName: "Northwind Nordic AB",
  intro: "Pick a welcome gift for every new starter",
};
const gift = giftPortalMetadata(catalogue, store);

assert.equal(gift.title.template, "%s · Northwind employee gifting");
assert.ok(gift.title.default.startsWith("Northwind employee gifting"));
assert.ok(gift.description.startsWith("A private gift catalogue for Northwind Nordic AB"), "who runs it survives the clamp");
assert.ok(gift.description.includes("Pick a welcome gift for every new starter."));
assert.ok(gift.description.includes("Northwind Ltd"));
assert.equal(gift.openGraph.siteName, "Northwind employee gifting");
assert.deepEqual(gift.openGraph.images[0].url, store.logoUrl);
// A private catalogue has no business in a search index — for every page in it.
assert.deepEqual(gift.robots, { index: false, follow: false });

// A catalogue that never filled in an intro still gets a sentence.
const bare = giftPortalMetadata({ ...catalogue, intro: "  " }, store);
assert.ok(bare.description.includes("Northwind Ltd"));

// A company running its own programme is not named twice in a row.
const ownProgramme = giftPortalMetadata({ ...catalogue, companyName: store.clientName }, store);
assert.ok(ownProgramme.description.startsWith("A private gift catalogue run by Northwind Ltd through"));

/* --------------------------------------- no shopper-facing surface says it */

const strings = (m) => [
  m.title.default,
  m.title.template,
  m.description,
  m.openGraph.title,
  m.openGraph.description,
  m.openGraph.siteName,
];

for (const { code } of LANGUAGES) {
  const localised = storefrontMetadata({ ...store, defaultLanguage: code }, "Kit the whole team out");
  for (const value of strings(localised)) {
    assert.ok(value, `${code} produced an empty metadata field`);
    assert.ok(!value.includes("Parcelith"), `${code} storefront metadata still names the platform: ${value}`);
  }
  // The footer credit is the one place the platform is still named, and it stays.
  assert.ok(copyFor(code).chrome.legal.includes("Parcelith"), `${code} lost the powered-by credit`);
}

for (const value of strings(gift)) {
  assert.ok(!value.includes("Parcelith"), `gift portal metadata still names the platform: ${value}`);
}

// Descriptions are share-preview length, not an article.
for (const m of [meta, plain, gift, bare]) assert.ok(m.description.length <= 200);

console.log("whitelabel-check: OK");
