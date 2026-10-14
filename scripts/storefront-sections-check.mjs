// Self-check for section-by-section storefront editing: npm run storefront-sections-check
//
// The tree edits first, without a database: add, update, move, duplicate and
// remove keep ids stable, never touch the tree they were given, and refuse bad
// field values with one issue per field. Then the real Admin API operations
// from the registry, run as an API key would run them, against a throwaway
// store in the development database:
// - listStorefrontSections reads the draft, falling back to the published page;
// - addStorefrontSection, updateStorefrontSection, moveStorefrontSection,
//   duplicateStorefrontSection and removeStorefrontSection each return the
//   resulting section list with the same ids, and change the draft only;
// - field values are checked against SECTION_DEFS, and a bad one comes back
//   as a 422 naming every field with what is allowed;
// - translations are written per enabled language and refused for others;
// - an unknown section id is a 404;
// - previewStorefront signs a link that opens, and stops opening once edited
//   or expired;
// - updateStorefrontSiteContent changes the header copy, uploadStorefrontImage
//   refuses a file that is not an image, and updateTheme is partial.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("storefront-sections-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
process.env.APP_ORIGIN = "https://example.test";

/* ------------------------------------------------------------- tree edits */

const edits = await import("../src/lib/storefront-sections.ts");
const { treeFromSections } = await import("../src/lib/storefront-schema.ts");
const rules = { collectionIds: ["col_summer"] };

const start = treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }]);
const frozen = JSON.stringify(start);
const [hero, grid] = edits.listSections(start);
assert.equal(hero.type, "HeroSection");
assert.equal(hero.position, 0);
assert.equal(grid.fields.limit, 6, "defaults are read for every field");

let added = edits.addSection(start, { type: "Testimonial", position: 1, fields: { author: "Ana" } }, rules);
assert.equal(JSON.stringify(start), frozen, "an edit never changes the tree it was given");
let list = edits.listSections(added.tree);
assert.deepEqual(list.map((s) => s.id), [hero.id, added.id, grid.id], "inserted at the position, other ids unchanged");
assert.equal(list[1].fields.author, "Ana");
assert.equal(list[1].fields.quote.length > 0, true, "fields left out take the defaults");

let tree = edits.updateSection(added.tree, { sectionId: grid.id, fields: { columns: 4, title: "New in" }, defaultLocale: "en" }, rules);
assert.equal(edits.listSections(tree)[2].fields.columns, "4", "a select stores its option value");
assert.equal(edits.listSections(tree)[2].fields.subtitle, grid.fields.subtitle, "fields left out keep their value");

assert.throws(
  () => edits.updateSection(tree, { sectionId: grid.id, fields: { columns: 5, limit: 99, nope: "x", showPrice: "yes" }, defaultLocale: "en" }, rules),
  (error) => {
    assert.ok(error instanceof edits.SectionEditError);
    assert.deepEqual(error.issues.map((i) => i.field).sort(), ["fields.columns", "fields.limit", "fields.nope", "fields.showPrice"]);
    assert.match(error.issues.find((i) => i.field === "fields.columns").message, /2, 3, 4/);
    assert.match(error.issues.find((i) => i.field === "fields.nope").message, /title, subtitle/);
    return true;
  },
  "every bad field is reported at once",
);
assert.throws(() => edits.updateSection(tree, { sectionId: hero.id, fields: { imageUrl: "javascript:alert(1)" }, defaultLocale: "en" }, rules), /https/);
assert.throws(() => edits.updateSection(tree, { sectionId: grid.id, fields: { source: "col_other" }, defaultLocale: "en" }, rules), /col_summer/);
tree = edits.updateSection(tree, { sectionId: grid.id, fields: { source: "col_summer" }, defaultLocale: "en" }, rules);

tree = edits.updateSection(tree, { sectionId: hero.id, fields: { headline: "Hallo" }, locale: "de", defaultLocale: "en" }, rules);
assert.deepEqual(edits.listSections(tree)[0].translations, { de: { headline: "Hallo" } });
assert.equal(edits.listSections(tree)[0].fields.headline, hero.fields.headline, "a translation leaves the source alone");
assert.throws(() => edits.updateSection(tree, { sectionId: hero.id, fields: { tone: "dark" }, locale: "de", defaultLocale: "en" }, rules), /Only text fields/);

tree = edits.moveSection(tree, { sectionId: hero.id, position: 2 });
assert.deepEqual(edits.listSections(tree).map((s) => s.id), [added.id, grid.id, hero.id]);
assert.throws(() => edits.moveSection(tree, { sectionId: hero.id, position: 3 }), /0 to 2/);

const copy = edits.duplicateSection(tree, { sectionId: hero.id });
list = edits.listSections(copy.tree);
assert.deepEqual(list.map((s) => s.id), [added.id, grid.id, hero.id, copy.id], "the copy goes just below");
assert.deepEqual(list[3].translations, list[2].translations, "translations are copied");
assert.notEqual(copy.id, hero.id);

tree = edits.removeSection(copy.tree, { sectionId: added.id });
assert.deepEqual(edits.listSections(tree).map((s) => s.id), [grid.id, hero.id, copy.id]);
assert.equal(tree[added.id], undefined, "the node is gone");
assert.throws(() => edits.removeSection(tree, { sectionId: added.id }), (error) => error.kind === "not_found");

/* ------------------------------------------------------- the operations */

const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const { API_OPERATIONS } = await import("../src/lib/api/operations.ts");
const { refusalOf, runOperation } = await import("../src/lib/api/http.ts");
const { previewLinkValid } = await import("../src/lib/storefront-preview.ts");

const operation = (id) => API_OPERATIONS.find((o) => o.id === id) ?? assert.fail(`no operation ${id}`);
const SECTION_OPS = [
  "listStorefrontSectionTypes",
  "listStorefrontSections",
  "getStorefrontSection",
  "addStorefrontSection",
  "updateStorefrontSection",
  "moveStorefrontSection",
  "duplicateStorefrontSection",
  "removeStorefrontSection",
  "previewStorefront",
];
for (const id of SECTION_OPS) {
  const op = operation(id);
  assert.ok(op.description.length > 80, `${id} is described for an AI client`);
  assert.equal(op.scope, op.method === "GET" ? "storefront:read" : "storefront:write", `${id} scope`);
}

const suffix = Math.random().toString(36).slice(2, 10);
const store = {
  id: `str_sections_${suffix}`,
  agencyId: `agc_sections_${suffix}`,
  name: "Sections check",
  slug: `sections-check-${suffix}`,
  clientName: "Check",
  status: "active",
  logoUrl: null,
  theme: "atelier",
  defaultLanguage: "en",
  languages: ["en", "de"],
  currencies: ["USD"],
  defaultCurrency: "USD",
  customDomain: null,
};
const ctx = { store, actor: { id: "key_sections_check", name: "Sections check" }, locale: "en" };
const published = treeFromSections([{ type: "HeroSection", props: { headline: "Live" } }, { type: "RichText" }]);

async function run(id, input = {}) {
  return runOperation(operation(id), ctx, input);
}
async function refused(id, input) {
  try {
    await run(id, input);
  } catch (error) {
    const refusal = refusalOf(error);
    assert.ok(refusal, `${id} threw a fault: ${error}`);
    return refusal;
  }
  assert.fail(`${id} accepted ${JSON.stringify(input)}`);
}

try {
  await db.insertOne(COLLECTIONS.storefronts, {
    id: `sfr_${suffix}`,
    storeId: store.id,
    draft: null,
    published,
    publishedAt: new Date().toISOString(),
    publishedBy: "check",
    draftUpdatedAt: new Date().toISOString(),
    history: [],
  });
  await db.insertOne(COLLECTIONS.productCollections, { id: `col_${suffix}`, storeId: store.id, name: "Summer", handle: "summer", productIds: [] });

  const types = await run("listStorefrontSectionTypes");
  assert.equal(types.data.length, 23);
  assert.ok(types.data.find((t) => t.type === "ImageHero").fields.some((f) => f.key === "imageUrlFocal" && f.type === "focal"), "image fields carry a focal point");
  assert.ok(types.data.find((t) => t.type === "ProductGrid").fields.find((f) => f.key === "limit").max === 12);

  let { sections } = await run("listStorefrontSections");
  assert.deepEqual(sections.map((s) => s.type), ["HeroSection", "RichText"], "with no draft, the published page is the draft");
  const [liveHero, liveText] = sections;

  const add = await run("addStorefrontSection", { type: "ProductGrid", position: 1, fields: { title: "Summer", source: `col_${suffix}`, limit: 4 } });
  assert.ok(add.id);
  assert.deepEqual(add.sections.map((s) => s.id), [liveHero.id, add.id, liveText.id], "the new id, the others unchanged");
  assert.equal(add.sections[1].fields.source, `col_${suffix}`);

  let refusal = await refused("addStorefrontSection", { type: "ProductGrid", fields: { limit: 1, columns: "9", colour: "red" } });
  assert.equal(refusal.status, 422);
  assert.equal(refusal.code, "invalid_request");
  assert.deepEqual(refusal.details.issues.map((i) => i.field).sort(), ["fields.colour", "fields.columns", "fields.limit"]);
  refusal = await refused("addStorefrontSection", { type: "Carousel" });
  assert.equal(refusal.status, 422, "an unknown type is refused by the schema");
  assert.equal(refusal.field, "type");

  const updated = await run("updateStorefrontSection", { sectionId: liveHero.id, fields: { headline: "Draft headline", tone: "dark" } });
  assert.equal(updated.sections[0].fields.headline, "Draft headline");
  assert.equal(updated.sections[0].fields.ctaLabel, liveHero.fields.ctaLabel, "partial: the rest is kept");
  refusal = await refused("updateStorefrontSection", { sectionId: liveHero.id, fields: { tone: "neon" } });
  assert.equal(refusal.field, "fields.tone");
  assert.match(refusal.message, /accent, light, dark/);
  refusal = await refused("updateStorefrontSection", { sectionId: "nope", fields: { headline: "x" } });
  assert.equal(refusal.status, 404);

  const german = await run("updateStorefrontSection", { sectionId: liveHero.id, fields: { headline: "Neu" }, locale: "de" });
  assert.deepEqual(german.sections[0].translations.de, { headline: "Neu" });
  refusal = await refused("updateStorefrontSection", { sectionId: liveHero.id, fields: { headline: "Nouveau" }, locale: "fr" });
  assert.equal(refusal.field, "locale", "only enabled languages");

  const moved = await run("moveStorefrontSection", { sectionId: liveHero.id, position: 2 });
  assert.deepEqual(moved.sections.map((s) => s.id), [add.id, liveText.id, liveHero.id]);

  const dup = await run("duplicateStorefrontSection", { sectionId: liveHero.id });
  assert.deepEqual(dup.sections.map((s) => s.id), [add.id, liveText.id, liveHero.id, dup.id]);
  assert.equal(dup.sections[3].fields.headline, "Draft headline");

  const removed = await run("removeStorefrontSection", { sectionId: liveText.id });
  assert.deepEqual(removed.sections.map((s) => s.id), [add.id, liveHero.id, dup.id]);

  const one = await run("getStorefrontSection", { sectionId: dup.id });
  assert.equal(one.position, 2);
  assert.equal((await refused("getStorefrontSection", { sectionId: liveText.id })).status, 404);

  ({ sections } = await run("listStorefrontSections"));
  assert.deepEqual(sections.map((s) => s.id), [add.id, liveHero.id, dup.id], "the draft was saved");
  const saved = await db.findOne(COLLECTIONS.storefronts, { storeId: store.id });
  assert.deepEqual(saved.published, published, "the published page is untouched until publishStorefront");
  assert.ok((await db.count(COLLECTIONS.audit, { storeId: store.id, action: "storefront.draft_edited" })) >= 5, "each edit is in the activity");

  const site = await run("updateStorefrontSiteContent", { announcement: "Free shipping" });
  assert.equal(site.content.en.announcement, "Free shipping");
  const siteDe = await run("updateStorefrontSiteContent", { announcement: "Gratis Versand", locale: "de" });
  assert.equal(siteDe.content.de.announcement, "Gratis Versand");
  assert.equal(siteDe.content.en.announcement, "Free shipping");

  const preview = await run("previewStorefront", {});
  const url = new URL(preview.url);
  assert.equal(url.pathname, `/s/${store.slug}/preview`);
  assert.ok(await previewLinkValid(store.id, url.searchParams.get("expires"), url.searchParams.get("t")));
  assert.equal(await previewLinkValid(store.id, url.searchParams.get("expires"), "x".repeat(32)), false, "a forged token fails");
  assert.equal(await previewLinkValid("str_other", url.searchParams.get("expires"), url.searchParams.get("t")), false, "another store fails");
  assert.equal(await previewLinkValid(store.id, url.searchParams.get("expires"), url.searchParams.get("t"), Date.now() + 25 * 3600 * 1000), false, "it expires");
  const previewDe = await run("previewStorefront", { locale: "de" });
  assert.match(new URL(previewDe.url).pathname, /\/de\/preview$/);

  // Header and footer settings, checked like section fields.
  const layout = await run("updateStorefrontLayout", { settings: { headerLayout: "center", megaMenu: true } });
  assert.equal(layout.settings.headerLayout, "center");
  assert.equal(layout.settings.headerSticky, true, "settings left out keep their value");
  refusal = await refused("updateStorefrontLayout", { settings: { headerLayout: "middle", socialX: "http://x.com/a", nope: true } });
  assert.deepEqual(refusal.details.issues.map((i) => i.field).sort(), ["settings.headerLayout", "settings.nope", "settings.socialX"]);

  // The product page template: the gallery and buy box stays, blocks keep their ids.
  const template = await run("getProductPageTemplate");
  assert.equal(template.blocks[0].type, "ProductMain");
  assert.ok(template.blockTypes.length >= 8);
  const reordered = await run("updateProductPageTemplate", {
    blocks: [
      { id: template.blocks[0].id, type: "ProductMain", settings: { galleryLayout: "grid" } },
      { type: "SizeGuide", settings: { title: "Fit" } },
    ],
  });
  assert.equal(reordered.blocks[0].id, template.blocks[0].id);
  assert.equal(reordered.blocks[0].props.galleryLayout, "grid");
  assert.equal(reordered.blocks[1].props.title, "Fit");
  refusal = await refused("updateProductPageTemplate", { blocks: [{ type: "Reviews" }] });
  assert.equal(refusal.status, 422, "the gallery and buy box is required");
  const translated = await run("updateProductPageTemplate", {
    blocks: reordered.blocks.map((b) => ({ id: b.id, type: b.type, settings: b.type === "SizeGuide" ? { title: "Passform" } : {} })),
    locale: "de",
  });
  assert.equal(translated.blocks[1].props.title, "Fit", "a translation leaves the source alone");
  assert.equal(translated.blocks[1].props.i18n.de.title.value, "Passform");

  refusal = await refused("uploadStorefrontImage", { kind: "section", contentType: "text/plain", data: Buffer.from("hello").toString("base64") });
  assert.equal(refusal.field, "data");

  const theme = await run("getTheme");
  assert.deepEqual(Object.keys(theme).slice(0, 2), ["theme", "logoUrl"], "every theme setting is read");
  assert.equal(operation("updateTheme").input.safeParse({}).success, true, "updateTheme is partial");
  assert.equal(operation("updateTheme").input.safeParse({ logoUrl: "https://evil.example/x.png" }).success, false, "logos come from the asset storage");
  assert.equal(operation("updateTheme").input.safeParse({ colors: { primary: "red" } }).success, false, "colours are #rrggbb");
  assert.ok(theme.fonts.length >= 20 && theme.pairings.length > 0, "the curated fonts and pairings are listed");
  assert.ok(theme.contrast.text.ratio > 1);
} finally {
  await db.deleteMany(COLLECTIONS.storefronts, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.productCollections, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.audit, { storeId: store.id });
}

console.log("storefront-sections-check ok: tree edits, field checks, and the section, site copy, preview and theme operations");
process.exit(0);
