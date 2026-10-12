// Self-check for pages, the blog and the menus: npm run content-check
//
// Merchants write pages and blog posts in a rich-text editor, so what matters
// is that nothing they paste (or an API client sends) can put script on a
// storefront: the HTML is cleaned by sanitize-html before it is stored and
// again when it is shown. Beyond that: a handle is a clean, unique address;
// every field falls back to the default language; a menu link is checked
// against the store's own records and resolves to the right address, or is
// left out when its target is gone; and published pages and posts are in the
// store's sitemap in every language with hreflang alternates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTENT_FIELDS,
  cleanMenu,
  contentPath,
  entrySummary,
  isMenuUrl,
  isValidContentHandle,
  localizeEntry,
  menuHref,
  normalizeContentHandle,
  resolveMenu,
  storeMenus,
  textFromHtml,
  uniqueContentHandle,
} from "../src/lib/content.ts";
import { isBlankRichText, sanitizeRichText } from "../src/lib/rich-text.ts";
import { matchesRoute } from "../src/lib/routes.ts";
import { storeSitemap } from "../src/lib/seo.ts";
import { withTranslation } from "../src/lib/translations.ts";

/* ------------------------------------------------------------------ handles */

assert.equal(normalizeContentHandle("About us"), "about-us");
assert.equal(normalizeContentHandle("  Über uns & FAQ "), "uber-uns-faq", "accents are folded, symbols dropped");
assert.ok(isValidContentHandle("shipping-faq"));
for (const bad of ["", "About", "a--b", "-a", "a-", "a b", "ä"]) assert.ok(!isValidContentHandle(bad), `"${bad}" is not a handle`);
assert.equal(uniqueContentHandle("FAQ", [], "page"), "faq");
assert.equal(uniqueContentHandle("FAQ", ["faq", "faq-2"], "page"), "faq-3");
assert.equal(uniqueContentHandle("???", [], "post"), "post", "a title with no letters still gets an address");
assert.equal(contentPath("page", "about-us"), "/pages/about-us");
assert.equal(contentPath("post", "autumn"), "/blog/autumn");

/* ------------------------------------------------------- the HTML is cleaned */

const hostile = [
  '<p>Hello<script>alert(1)</script></p>',
  '<p onclick="steal()">Click</p>',
  '<a href="javascript:alert(1)">x</a>',
  '<img src="x" onerror="alert(1)">',
  '<img src="http://tracker.example/pixel.gif">',
  '<iframe src="https://evil.example"></iframe>',
  '<p style="position:fixed;inset:0">overlay</p>',
  '<svg><script>alert(1)</script></svg>',
  '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
  '<form action="https://evil.example"><input name="card"></form>',
].join("");
const cleaned = sanitizeRichText(hostile);
for (const forbidden of ["<script", "onclick", "onerror", "javascript:", "<iframe", "style=", "<svg", "data:", "<form", "<input", "http://tracker"]) {
  assert.ok(!cleaned.toLowerCase().includes(forbidden), `sanitised HTML keeps ${forbidden}: ${cleaned}`);
}
assert.ok(cleaned.includes("<p>Hello</p>") && cleaned.includes("Click") && cleaned.includes("overlay"), "the words stay");

const kept = sanitizeRichText(
  '<h1>Title</h1><h2>About</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul><ol><li>Two</li></ol>' +
    '<blockquote>Quote</blockquote><p><a href="https://example.com" target="_blank">site</a> <a href="/s/x/pages/faq">faq</a></p>' +
    '<img src="https://assets.clawcorp.ai/a.png" alt="A">',
);
assert.match(kept, /<h2>Title<\/h2><h2>About<\/h2>/, "a top heading becomes a section heading: the page has its own h1");
assert.match(kept, /<strong>Bold<\/strong> and <em>italic<\/em>/);
assert.match(kept, /<ul><li>One<\/li><\/ul><ol><li>Two<\/li><\/ol><blockquote>Quote<\/blockquote>/);
assert.match(kept, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow">site<\/a>/, "a new-tab link cannot reach back");
assert.match(kept, /<a href="\/s\/x\/pages\/faq">faq<\/a>/, "a link inside the store stays as it is");
assert.match(kept, /<img src="https:\/\/assets.clawcorp.ai\/a.png" alt="A" \/>/);
assert.ok(isBlankRichText("<p></p><p> </p>"), "an empty editor is blank");
assert.ok(!isBlankRichText('<p><img src="https://assets.clawcorp.ai/a.png"></p>'), "an image alone is content");

assert.equal(textFromHtml("<h2>Our story</h2><p>Made in <strong>Leeds</strong> &amp; Porto.</p>"), "Our story\nMade in Leeds & Porto.");
assert.equal(entrySummary({ excerpt: "", body: "<p>" + "word ".repeat(80) + "</p>" }, 50).length, 50, "a summary is cut to length");
assert.equal(entrySummary({ excerpt: "Short summary", body: "<p>Body</p>" }), "Short summary", "the excerpt wins");

/* ---------------------------------------------------------- translations */

const page = {
  title: "About us",
  excerpt: "Who we are",
  body: "<p>We make bags.</p>",
  seoTitle: "",
  seoDescription: "",
  translations: withTranslation(withTranslation(undefined, "de", "title", "Über uns"), "de", "body", "<p>Wir machen Taschen.</p>"),
};
const german = localizeEntry(page, "de", "en");
assert.equal(german.title, "Über uns");
assert.equal(german.body, "<p>Wir machen Taschen.</p>");
assert.equal(german.excerpt, "Who we are", "an untranslated field falls back to the source");
assert.equal(localizeEntry(page, "fr", "en").title, "About us", "no French: the source");
assert.equal(localizeEntry(page, "en", "en"), page, "the default language reads the record itself");
assert.deepEqual([...CONTENT_FIELDS], ["title", "excerpt", "body", "seoTitle", "seoDescription"]);

/* -------------------------------------------------------------------- menus */

let next = 0;
const newItemId = () => `mnu_test${String(++next).padStart(8, "0")}`;
const targets = {
  collection: new Set(["col_1"]),
  product: new Set(["prd_1"]),
  page: new Set(["cnt_about"]),
  post: new Set(["cnt_post"]),
};
const good = cleanMenu(
  [
    { label: "Home", kind: "home" },
    { label: " Shop all ", kind: "products" },
    { label: "Summer", kind: "collection", targetId: "col_1" },
    { label: "Tote", kind: "product", targetId: "prd_1" },
    { id: "mnu_keepthisid1", label: "About", kind: "page", targetId: "cnt_about", translations: { de: { label: { value: "Über uns" } }, fr: { label: { value: " " } } } },
    { label: "Blog", kind: "blog" },
    { label: "Story", kind: "post", targetId: "cnt_post" },
    { label: "Instagram", kind: "url", url: "https://instagram.com/brand" },
    { label: "Mail", kind: "url", url: "mailto:hello@example.com" },
  ],
  targets,
  newItemId,
);
assert.ok("items" in good, JSON.stringify(good));
assert.equal(good.items.length, 9);
assert.equal(good.items[1].label, "Shop all", "labels are trimmed");
assert.equal(good.items[4].id, "mnu_keepthisid1", "an existing link keeps its id");
assert.deepEqual(good.items[4].translations, { de: { label: { value: "Über uns" } } }, "an empty translation is dropped");
assert.equal(good.items[0].targetId, null, "a home link points at nothing");

const problem = (items) => {
  const result = cleanMenu(items, targets, newItemId);
  return "problem" in result ? `${result.problem}@${result.index}` : "ok";
};
assert.equal(problem([{ label: "", kind: "home" }]), "labelRequired@0");
assert.equal(problem([{ label: "x".repeat(41), kind: "home" }]), "labelTooLong@0");
assert.equal(problem([{ label: "A", kind: "home" }, { label: "B", kind: "teleport" }]), "kindInvalid@1");
assert.equal(problem([{ label: "Other store", kind: "collection", targetId: "col_from_another_store" }]), "targetMissing@0", "a link can only reach this store's records");
assert.equal(problem([{ label: "Evil", kind: "url", url: "javascript:alert(1)" }]), "urlInvalid@0");
assert.equal(problem(Array.from({ length: 21 }, () => ({ label: "A", kind: "home" }))), "tooMany@20");
assert.ok(isMenuUrl("https://example.com") && isMenuUrl("tel:+441234") && !isMenuUrl("ftp://x") && !isMenuUrl("//evil.example"));

const lookups = {
  collections: new Map([["col_1", "summer"]]),
  products: new Map([["prd_1", "canvas-tote"]]),
  pages: new Map([["cnt_about", "about-us"]]),
  posts: new Map(),
};
assert.equal(menuHref({ kind: "home", targetId: null, url: null }, "", lookups), "/", "home on a custom domain");
assert.equal(menuHref({ kind: "home", targetId: null, url: null }, "/s/north/de", lookups), "/s/north/de");
assert.equal(menuHref({ kind: "page", targetId: "cnt_about", url: null }, "/s/north/de", lookups), "/s/north/de/pages/about-us");
assert.equal(menuHref({ kind: "collection", targetId: "col_1", url: null }, "/s/north", lookups), "/s/north/collections/summer");
assert.equal(menuHref({ kind: "product", targetId: "prd_1", url: null }, "/s/north", lookups), "/s/north/products/canvas-tote");
assert.equal(menuHref({ kind: "blog", targetId: null, url: null }, "/s/north", lookups), "/s/north/blog");
const resolved = resolveMenu(good.items, "/s/north/de", lookups, "de", "en");
assert.ok(!resolved.some((link) => link.label === "Story"), "a link to an unpublished or deleted post is left out");
assert.equal(resolved.find((link) => link.id === "mnu_keepthisid1").label, "Über uns", "labels are translated");
assert.equal(resolved.find((link) => link.label === "Instagram").external, true);
assert.deepEqual(storeMenus({}), { header: [], footer: [], updatedAt: "" }, "a store without menus keeps the built-in links");

/* ------------------------------------------------------------------ sitemap */

const store = {
  slug: "north",
  customDomain: null,
  domainStatus: "unset",
  defaultLanguage: "en",
  languages: ["en", "de"],
  status: "active",
};
const entries = storeSitemap(store, [], [], [
  { kind: "page", handle: "about-us", updatedAt: "2026-01-02T00:00:00.000Z", coverImageUrl: "https://assets.clawcorp.ai/a.png" },
  { kind: "post", handle: "autumn", updatedAt: "2026-02-02T00:00:00.000Z", coverImageUrl: null },
]);
const about = entries.filter((entry) => entry.url.endsWith("/pages/about-us"));
assert.equal(about.length, 2, "one entry per language");
for (const entry of about) {
  assert.deepEqual(Object.keys(entry.languages).sort(), ["de", "en", "x-default"], "each lists every language as an alternate");
  assert.ok(entry.languages.de.endsWith("/s/north/de/pages/about-us"));
  assert.deepEqual(entry.images, ["https://assets.clawcorp.ai/a.png"]);
}
assert.ok(entries.some((entry) => entry.url.endsWith("/s/north/de/blog/autumn")), "posts are listed");
assert.ok(entries.some((entry) => entry.url.endsWith("/s/north/blog")), "so is the blog");
assert.ok(!storeSitemap(store, [], [], []).some((entry) => entry.url.endsWith("/blog")), "no blog without posts");

/* ----------------------------------------------------- routes and the API */

for (const path of ["/s/north/pages/about-us", "/s/north/de/pages/about-us", "/s/north/blog", "/s/north/de/blog/autumn", "/app/stores/str_1/content", "/app/stores/str_1/content/cnt_1", "/app/stores/str_1/content/menus", "/api/v1/stores/str_1/content/cnt_1/translations/de", "/api/v1/stores/str_1/menus/header"]) {
  assert.ok(matchesRoute(path), `${path} is a page`);
}
const operations = readFileSync(new URL("../src/lib/api/operations.ts", import.meta.url), "utf8");
for (const id of ["listContent", "getContent", "createContent", "updateContent", "deleteContent", "updateContentTranslation", "getMenus", "updateMenu"]) {
  assert.ok(operations.includes(`id: "${id}"`), `the Admin API and MCP offer ${id}`);
}
// The body is only ever stored and shown through the sanitiser.
const operation = readFileSync(new URL("../src/lib/operations/content.ts", import.meta.url), "utf8");
assert.ok(/sanitizeRichText\(input\.body\)/.test(operation), "saving an entry sanitises the body");
assert.ok(/sanitizeRichText\(String\(raw/.test(operation), "saving a translation sanitises its body");
const article = readFileSync(new URL("../src/components/ContentArticle.tsx", import.meta.url), "utf8");
assert.ok(/__html: sanitizeRichText\(body\)/.test(article), "the storefront sanitises again when it renders");

console.log("content-check ok");
