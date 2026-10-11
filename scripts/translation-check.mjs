// Self-check for per-language storefront content and Shop text: npm run translation-check
//
// Store content is written in the store's default language and translated per
// language beside it; a missing translation must fall back to the source, never
// to an empty string. Shop text overrides are merged over the built-in messages
// at request time; only editable strings may be overridden, an override must
// win over the built-in text in its own language only, and resetting it must
// bring the built-in text back.
import assert from "node:assert/strict";
import { createTranslator } from "next-intl";
import { LOCALES } from "../src/i18n/locales.ts";
import { applyShopText, flattenShopText, isShopTextKey, shopTextEntries, SHOP_TEXT_GROUPS } from "../src/lib/shop-text.ts";
import { overrideProblem } from "../src/lib/shop-text-validate.ts";
import { treeFromSections } from "../src/lib/storefront-schema.ts";
import {
  applyTreeTranslations,
  localized,
  localizedIntro,
  localizeProduct,
  localizeSectionProps,
  missingProductFields,
  missingTreeFields,
  siteContent,
  translationState,
  withTranslation,
  colourKey,
  tagKey,
} from "../src/lib/translations.ts";
import { read } from "./shopper-intl.mjs";

/* ------------------------------------------------------------ content fallback */

const translations = withTranslation(undefined, "de", "headline", "Neue Kollektion");
assert.equal(localized("New collection", translations, "de", "en", "headline"), "Neue Kollektion");
assert.equal(localized("New collection", translations, "fr", "en", "headline"), "New collection", "no French: source");
assert.equal(localized("New collection", translations, "en", "en", "headline"), "New collection", "default reads the source");
assert.equal(
  localized("New collection", withTranslation(translations, "de", "headline", "   "), "de", "en", "headline"),
  "New collection",
  "an emptied translation is removed, so the source shows again",
);
assert.equal(translationState("New collection", translations, "fr", "en", "headline"), "missing");
assert.equal(translationState("", translations, "fr", "en", "body"), "source", "nothing to translate");
assert.equal(
  translationState("x", withTranslation(undefined, "fr", "headline", "y", true), "fr", "en", "headline"),
  "machine",
);
assert.equal(translationState("x", withTranslation(undefined, "fr", "headline", "y"), "fr", "en", "headline"), "translated");

// Sections: copy fields fall back one by one; layout props are never translated.
const tree = treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }]);
const [heroId, gridId] = tree.ROOT.nodes;
tree[heroId].props.i18n = { de: { headline: { value: "Markenware nach Maß" } } };
tree[heroId].props.tone = "dark";
const hero = localizeSectionProps("HeroSection", tree[heroId].props, "de", "en");
assert.equal(hero.headline, "Markenware nach Maß");
assert.equal(hero.body, tree[heroId].props.body, "untranslated body falls back to the source");
assert.equal(hero.tone, "dark");
assert.equal(hero.ctaHref, "products");
assert.equal(localizeSectionProps("HeroSection", tree[heroId].props, "en", "en").headline, tree[heroId].props.headline);

// Header and footer copy on the root node.
tree.ROOT.props = { announcement: "Free delivery", navShop: "", footerNote: "Made in Leeds", i18n: { de: { announcement: { value: "Kostenloser Versand" } } } };
assert.deepEqual(siteContent(tree, "de", "en"), {
  announcement: "Kostenloser Versand",
  navShop: "",
  navOrders: "",
  footerNote: "Made in Leeds",
  metaTitle: "",
  metaDescription: "",
});

// Translate missing: finds only untranslated copy and never overwrites.
const missing = missingTreeFields(tree, "de");
assert.ok(!(`section:${heroId}:headline` in missing), "translated headline is not missing");
assert.ok(`section:${heroId}:body` in missing);
assert.ok(`section:${gridId}:title` in missing);
assert.ok("site:footerNote" in missing && !("site:announcement" in missing) && !("site:navShop" in missing));
assert.ok(!(`section:${heroId}:imageUrl` in missing), "links are not copy");
const filled = applyTreeTranslations(
  tree,
  "de",
  { [`section:${heroId}:headline`]: "Überschrieben", [`section:${heroId}:body`]: "Auf Bestellung gedruckt.", "site:footerNote": "Hergestellt in Leeds" },
  true,
);
assert.equal(filled[heroId].props.i18n.de.headline.value, "Markenware nach Maß", "existing translation kept");
assert.equal(filled[heroId].props.i18n.de.body.machine, true, "results are marked machine-translated");
assert.equal(siteContent(filled, "de", "en").footerNote, "Hergestellt in Leeds");
assert.equal(tree[heroId].props.i18n.de.body, undefined, "the input tree is not mutated");

// Products: name, description, option label and colours, with variants and
// mockups relabelled together so the product page still pairs them.
const product = {
  name: "Heavyweight Hoodie",
  description: "Brushed fleece.",
  shopperCustomization: { textLine: true, textLabel: "Name on sleeve" },
  variants: [
    { id: "v1", colour: "Black", name: "Black / M" },
    { id: "v2", colour: "Sand", name: "Sand / M" },
  ],
  mockups: [{ colour: "Black" }, { colour: "Sand" }],
  translations: {
    de: {
      name: { value: "Schwerer Hoodie" },
      [colourKey("Black")]: { value: "Schwarz" },
    },
  },
};
const german = localizeProduct(product, "de", "en");
assert.equal(german.name, "Schwerer Hoodie");
assert.equal(german.description, "Brushed fleece.", "description falls back");
assert.equal(german.shopperCustomization.textLabel, "Name on sleeve");
assert.deepEqual(german.variants.map((v) => [v.colour, v.name]), [["Schwarz", "Schwarz / M"], ["Sand", "Sand / M"]]);
assert.deepEqual(german.mockups.map((m) => m.colour), ["Schwarz", "Sand"]);
assert.equal(localizeProduct(product, "fr", "en"), product, "no French translations: unchanged");
assert.deepEqual(Object.keys(missingProductFields(product, "de")).sort(), ["colour:Sand", "description", "textLabel"]);

// Tags are the shop's filter labels: translated ones replace the source, the rest fall back.
const tagged = { ...product, tags: ["hoodies", "fleece"], translations: { de: { [tagKey("hoodies")]: { value: "Kapuzenpullis" } } } };
assert.deepEqual(localizeProduct(tagged, "de", "en").tags, ["Kapuzenpullis", "fleece"]);
assert.deepEqual(Object.keys(missingProductFields(tagged, "de")).filter((k) => k.startsWith("tag:")), ["tag:fleece"]);

assert.equal(localizedIntro({ intro: "Welcome", translations: { sv: { intro: { value: "Välkommen" } } } }, "sv", "en"), "Välkommen");
assert.equal(localizedIntro({ intro: "Welcome" }, "sv", "en"), "Welcome");

/* ---------------------------------------------------------- Shop text merging */

const en = read("en").storefront;
const de = read("de").storefront;
const entries = shopTextEntries(en);
const pages = new Set(entries.map((e) => e.page));
assert.deepEqual([...pages], SHOP_TEXT_GROUPS.map((g) => g.id), "every page has editable text");
assert.ok(entries.some((e) => e.key === "purchase.addToBasket"), "buttons are editable");
assert.ok(entries.some((e) => e.key.startsWith("checkout.")), "checkout labels are editable");
assert.ok(entries.some((e) => e.key.startsWith("status.")), "order status messages are editable");
assert.ok(entries.some((e) => e.key.startsWith("actions.")), "validation messages are editable");
assert.ok(entries.some((e) => e.key.startsWith("gift.")), "gift portal text is editable");
assert.ok(!entries.some((e) => e.key.startsWith("email.")), "emails are not shop text");
for (const locale of LOCALES) {
  const keys = shopTextEntries(read(locale).storefront).map((e) => e.key);
  assert.deepEqual(keys, entries.map((e) => e.key), `${locale} offers the same strings`);
}

const overrides = {
  purchase: { addToBasket: "In die Tasche" },
  checkout: { title: "" },
  email: { orderSubject: "hijack" },
  nope: { x: "y" },
};
assert.deepEqual(flattenShopText(overrides), {
  "purchase.addToBasket": "In die Tasche",
  "email.orderSubject": "hijack",
  "nope.x": "y",
});
const merged = applyShopText(de, overrides);
assert.equal(merged.purchase.addToBasket, "In die Tasche", "override wins");
assert.equal(merged.checkout.title, de.checkout.title, "an empty override keeps the built-in text");
assert.equal(merged.email.orderSubject, de.email.orderSubject, "non-editable strings cannot be overridden");
assert.equal(merged.nope, undefined, "unknown groups are ignored");
assert.equal(merged.purchase.adding, de.purchase.adding, "siblings keep the built-in text");
assert.equal(de.purchase.addToBasket, read("de").storefront.purchase.addToBasket, "built-in messages are not mutated");
assert.equal(applyShopText(de, undefined), de, "no overrides: same messages");

// Through next-intl, as the storefront reads it: the override in German, the
// built-in text in English, and the built-in text again once reset.
const t = (locale, messages) => createTranslator({ locale, messages: { storefront: messages }, namespace: "storefront" });
assert.equal(t("de", merged)("purchase.addToBasket"), "In die Tasche");
assert.equal(t("en", applyShopText(en, undefined))("purchase.addToBasket"), en.purchase.addToBasket);
const reset = applyShopText(de, { purchase: {} });
assert.equal(t("de", reset)("purchase.addToBasket"), de.purchase.addToBasket, "reset restores the built-in text");

// Placeholders: an override may use the built-in string's own, and nothing else.
const placeholderKey = entries.find((e) => /\{count\b/.test(e.text) || /\{name\}/.test(e.text) || /\{product\}/.test(e.text));
assert.ok(placeholderKey, "some editable string takes a placeholder");
const withPlaceholder = applyShopText(en, { actions: { addedToBasket: "{product} is in your bag" } });
assert.equal(t("en", withPlaceholder)("actions.addedToBasket", { product: "Mug" }), "Mug is in your bag");
assert.equal(overrideProblem(en.actions.addedToBasket, "{product} is in your bag"), null);
assert.equal(overrideProblem(en.actions.addedToBasket, "Added"), null, "dropping a placeholder is allowed");
assert.deepEqual(overrideProblem(en.actions.addedToBasket, "{price} added"), { kind: "placeholder", name: "{price}" });
assert.deepEqual(overrideProblem(en.actions.addedToBasket, "Added {product"), { kind: "invalid" });

assert.ok(isShopTextKey("checkout.title", en));
assert.ok(!isShopTextKey("email.orderSubject", en));
assert.ok(!isShopTextKey("checkout.title.extra", en));
assert.ok(!isShopTextKey("checkout.missing", en));

console.log(`translation-check ok: content fallback and ${entries.length} Shop text strings in ${LOCALES.length} languages`);
