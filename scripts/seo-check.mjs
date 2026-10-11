// Self-check for storefront and marketing SEO: npm run seo-check
//
// Sitemaps, canonical addresses and structured data are read by crawlers, not
// people, so a broken one fails silently: a sitemap entry pointing at a page
// that does not exist, an hreflang set that leaves a language out, a Product
// without a price. This checks the builders in `src/lib/seo.ts` offline.
//
// With a running server it also checks the real output:
//   npm run seo-check -- --live http://localhost:3000 northwind-supply
// fetches that store's sitemap and robots file, and the JSON-LD of its home
// page and first product.
import assert from "node:assert/strict";
import { LOCALES, MARKETING_PATHS } from "../src/i18n/locales.ts";
import { matchesRoute } from "../src/lib/routes.ts";
import {
  SITE_ORIGIN,
  breadcrumbJsonLd,
  decimalPrice,
  jsonLdScript,
  marketingSitemap,
  organizationJsonLd,
  productJsonLd,
  sitemapXml,
  storeRobotsTxt,
  storeSitemap,
  storeUrl,
} from "../src/lib/seo.ts";

/* ----------------------------------------------------------- validators */

const SCHEMA = "https://schema.org";
const AVAILABILITY = new Set(["InStock", "LimitedAvailability", "OutOfStock"].map((v) => `${SCHEMA}/${v}`));

function absolute(url, label) {
  let parsed;
  assert.doesNotThrow(() => (parsed = new URL(url)), `${label}: "${url}" is not an absolute URL`);
  assert.equal(parsed.protocol, "https:", `${label}: ${url} is not https`);
  return parsed;
}

/**
 * A sitemap entry: an absolute address on `host`, whose page exists, with
 * hreflang alternates that list every language and include the entry itself.
 */
function checkEntry(entry, { host, languages, toRoute }) {
  const url = absolute(entry.url, "sitemap entry");
  if (host) assert.equal(url.host, host, `${entry.url} is not on ${host}`);
  if (toRoute) assert.ok(matchesRoute(toRoute(url)), `${entry.url} is not a page (${toRoute(url)})`);
  if (languages.length < 2) {
    assert.equal(entry.languages, undefined, `${entry.url}: a single-language page has no alternates`);
    return;
  }
  assert.deepEqual(
    Object.keys(entry.languages).sort(),
    [...languages, "x-default"].sort(),
    `${entry.url}: hreflang alternates do not match the enabled languages`,
  );
  assert.ok(Object.values(entry.languages).includes(entry.url), `${entry.url} is missing from its own alternates`);
  for (const href of Object.values(entry.languages)) absolute(href, `${entry.url} alternate`);
  if (entry.lastModified) assert.ok(!Number.isNaN(Date.parse(entry.lastModified)), `${entry.url}: bad lastmod`);
  for (const image of entry.images ?? []) absolute(image, `${entry.url} image`);
}

function checkSitemap(entries, options) {
  const urls = entries.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, "a sitemap lists an address twice");
  for (const entry of entries) checkEntry(entry, options);
}

function checkProductLd(ld) {
  assert.equal(ld["@context"], SCHEMA);
  assert.equal(ld["@type"], "Product");
  assert.ok(typeof ld.name === "string" && ld.name.trim(), "Product has no name");
  assert.ok(typeof ld.description === "string", "Product has no description");
  absolute(ld.url, "Product url");
  assert.ok(Array.isArray(ld.image) && ld.image.length > 0, "Product has no images");
  for (const image of ld.image) absolute(image, "Product image");
  assert.equal(ld.brand?.["@type"], "Brand");
  assert.ok(ld.brand.name, "Product brand has no name");
  const offer = ld.offers;
  assert.ok(offer && ["Offer", "AggregateOffer"].includes(offer["@type"]), "Product has no offers");
  assert.match(offer.priceCurrency, /^[A-Z]{3}$/, "offer currency is not an ISO code");
  assert.ok(AVAILABILITY.has(offer.availability), `offer availability ${offer.availability} is not a schema.org value`);
  if (offer["@type"] === "Offer") {
    assert.match(offer.price, /^\d+(\.\d+)?$/, "offer price is not a plain decimal");
  } else {
    assert.match(offer.lowPrice, /^\d+(\.\d+)?$/);
    assert.match(offer.highPrice, /^\d+(\.\d+)?$/);
    assert.ok(Number(offer.lowPrice) <= Number(offer.highPrice), "lowPrice is above highPrice");
    assert.ok(offer.offerCount >= 2);
  }
}

function checkOrganizationLd(ld) {
  assert.equal(ld["@context"], SCHEMA);
  assert.equal(ld["@type"], "Organization");
  assert.ok(ld.name, "Organization has no name");
  absolute(ld.url, "Organization url");
  if (ld.logo) absolute(ld.logo, "Organization logo");
  if (ld.contactPoint) {
    assert.equal(ld.contactPoint["@type"], "ContactPoint");
    assert.ok(ld.contactPoint.email || ld.contactPoint.telephone, "a ContactPoint with no way to reach anyone");
  }
}

function checkBreadcrumbLd(ld) {
  assert.equal(ld["@context"], SCHEMA);
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.ok(ld.itemListElement.length >= 2, "a breadcrumb trail of one");
  ld.itemListElement.forEach((item, index) => {
    assert.equal(item["@type"], "ListItem");
    assert.equal(item.position, index + 1, "breadcrumb positions are not 1, 2, 3…");
    assert.ok(item.name, "a breadcrumb with no name");
    if (index < ld.itemListElement.length - 1) absolute(item.item, "breadcrumb item");
  });
}

const CHECKS = { Product: checkProductLd, Organization: checkOrganizationLd, BreadcrumbList: checkBreadcrumbLd };

/** Every JSON-LD block in an HTML document, flattened. */
function jsonLdIn(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.flatMap(([, body]) => [JSON.parse(body)].flat());
}

/* --------------------------------------------------------------- stores */

const northwind = {
  slug: "northwind-supply",
  status: "active",
  defaultLanguage: "en",
  languages: ["en", "de"],
  customDomain: "shop.northwind.example",
  domainStatus: "verified",
};
const products = [
  {
    slug: "field-tee",
    updatedAt: "2026-10-01T10:00:00.000Z",
    mockups: [{ url: "https://assets.clawcorp.ai/m/front.webp" }],
  },
  { slug: "desk-mug", updatedAt: "2026-10-03T10:00:00.000Z", mockups: [] },
];

// A verified custom domain: every store page is at the domain's root, the
// default language without a prefix and German under /de.
const onDomain = storeSitemap(northwind, products);
assert.equal(onDomain.length, (2 + products.length + 2) * 2, "home, shop, each product and two legal pages, per language");
const storePages = onDomain.filter((e) => !e.url.startsWith(SITE_ORIGIN));
checkSitemap(storePages, {
  host: "shop.northwind.example",
  languages: ["en", "de"],
  toRoute: (url) => `/s/northwind-supply${url.pathname === "/" ? "" : url.pathname}`,
});
const legal = onDomain.filter((e) => e.url.startsWith(SITE_ORIGIN));
checkSitemap(legal, { host: new URL(SITE_ORIGIN).host, languages: ["en", "de"], toRoute: (url) => url.pathname });
assert.deepEqual(
  storePages.map((e) => e.url).slice(0, 4),
  [
    "https://shop.northwind.example/",
    "https://shop.northwind.example/de",
    "https://shop.northwind.example/products",
    "https://shop.northwind.example/de/products",
  ],
);
assert.ok(onDomain.some((e) => e.url === "https://shop.northwind.example/de/products/field-tee"));
assert.deepEqual(onDomain.find((e) => e.url.endsWith("/products/field-tee")).images, [
  "https://assets.clawcorp.ai/m/front.webp",
]);
assert.equal(onDomain[0].lastModified, "2026-10-03T10:00:00.000Z", "the home page changes with its newest product");

// No domain, or one not verified yet: the platform address is canonical.
for (const domain of [
  { customDomain: null, domainStatus: "unset" },
  { customDomain: "shop.northwind.example", domainStatus: "pending" },
]) {
  const entries = storeSitemap({ ...northwind, ...domain }, products);
  checkSitemap(entries, { host: new URL(SITE_ORIGIN).host, languages: ["en", "de"], toRoute: (url) => url.pathname });
  assert.ok(entries.some((e) => e.url === `${SITE_ORIGIN}/s/northwind-supply/de/products/desk-mug`));
  assert.ok(entries.some((e) => e.url === `${SITE_ORIGIN}/s/northwind-supply`));
}

// A German-default store keeps German at the plain address.
const ferro = { ...northwind, slug: "ferro", defaultLanguage: "de", languages: ["de", "en"], customDomain: null };
assert.equal(storeUrl(ferro, "de", "/products"), `${SITE_ORIGIN}/s/ferro/products`);
assert.equal(storeUrl(ferro, "en", "/products"), `${SITE_ORIGIN}/s/ferro/en/products`);
assert.equal(storeSitemap(ferro, products).find((e) => e.url.endsWith("/s/ferro")).languages["x-default"], `${SITE_ORIGIN}/s/ferro`);

// One language: no alternates at all. An archived store lists nothing.
const single = storeSitemap({ ...northwind, languages: ["en"], customDomain: null }, products);
checkSitemap(single, { languages: ["en"], toRoute: (url) => url.pathname });
assert.deepEqual(storeSitemap({ ...northwind, status: "archived" }, products), []);

// The XML: one <url> per entry, alternates and images inside, text escaped.
const xml = sitemapXml([{ url: "https://x.example/a?b=1&c=2", languages: { en: "https://x.example/a", "x-default": "https://x.example/a" }, images: ["https://x.example/i.jpg"] }, ...onDomain]);
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
assert.equal(xml.match(/<url>/g).length, onDomain.length + 1);
assert.ok(xml.includes("<loc>https://x.example/a?b=1&amp;c=2</loc>"), "ampersands are escaped");
assert.ok(xml.includes('<xhtml:link rel="alternate" hreflang="x-default" href="https://x.example/a"/>'));
assert.ok(xml.includes("<image:image><image:loc>https://x.example/i.jpg</image:loc></image:image>"));

// Robots: points at the sitemap where it is served, keeps the basket out.
const robots = storeRobotsTxt(northwind);
assert.ok(robots.includes("Sitemap: https://shop.northwind.example/sitemap.xml"));
assert.ok(robots.includes("Disallow: /checkout") && robots.includes("Disallow: /de/cart"));
const platformRobots = storeRobotsTxt({ ...northwind, customDomain: null, domainStatus: "unset" });
assert.ok(platformRobots.includes(`Sitemap: ${SITE_ORIGIN}/s/northwind-supply/sitemap.xml`));
assert.ok(platformRobots.includes("Disallow: /s/northwind-supply/de/orders"));
assert.equal(storeRobotsTxt({ ...northwind, status: "archived" }), "User-agent: *\nDisallow: /\n");

/* ------------------------------------------------------------ marketing */

const marketing = marketingSitemap();
assert.equal(marketing.length, MARKETING_PATHS.length * LOCALES.length, "every marketing page in every language");
checkSitemap(marketing, { host: new URL(SITE_ORIGIN).host, languages: [...LOCALES], toRoute: (url) => url.pathname });
assert.ok(marketing.some((e) => e.url === `${SITE_ORIGIN}/`));
assert.ok(marketing.some((e) => e.url === `${SITE_ORIGIN}/ja/pricing`));
assert.equal(marketing.find((e) => e.url === `${SITE_ORIGIN}/de`).languages["x-default"], `${SITE_ORIGIN}/`);

/* ------------------------------------------------------- structured data */

const variants = [
  { price: 3200, availability: "in_stock" },
  { price: 3200, availability: "out_of_stock" },
];
const product = productJsonLd({
  name: "Field Tee",
  description: "Heavyweight cotton.",
  url: "https://shop.northwind.example/products/field-tee",
  sku: "NW-FIELD-TEE",
  brand: "Northwind Supply Co",
  images: ["https://assets.clawcorp.ai/m/front.webp"],
  currency: "USD",
  variants,
});
checkProductLd(product);
assert.equal(product.offers["@type"], "Offer");
assert.equal(product.offers.price, "32.00");
assert.equal(product.offers.availability, `${SCHEMA}/InStock`, "any variant in stock makes the product in stock");

const ranged = productJsonLd({
  ...{ name: "Hoodie", description: "", url: "https://x.example/p", sku: "H", brand: "B", images: ["https://x.example/i.jpg"] },
  currency: "JPY",
  variants: [
    { price: 4800, availability: "low_stock" },
    { price: 5200, availability: "out_of_stock" },
  ],
});
checkProductLd(ranged);
assert.equal(ranged.offers["@type"], "AggregateOffer");
assert.deepEqual([ranged.offers.lowPrice, ranged.offers.highPrice], ["4800", "5200"], "yen has no decimals");
assert.equal(ranged.offers.availability, `${SCHEMA}/LimitedAvailability`);
assert.equal(decimalPrice(1999, "EUR"), "19.99");

const organization = organizationJsonLd({
  name: "Northwind Supply Co",
  url: "https://shop.northwind.example/",
  logo: "https://assets.clawcorp.ai/logo.png",
  email: "support@northwind.example",
  phone: null,
});
checkOrganizationLd(organization);
assert.deepEqual(organization.contactPoint, {
  "@type": "ContactPoint",
  contactType: "customer support",
  email: "support@northwind.example",
});
const bare = organizationJsonLd({ name: "Rivet", url: "https://x.example/", logo: null, email: null, phone: null });
checkOrganizationLd(bare);
assert.equal(bare.logo, undefined);
assert.equal(bare.contactPoint, undefined, "no contact point without a way to reach the store");

const crumbs = breadcrumbJsonLd([
  { name: "Northwind Supply Co", url: "https://shop.northwind.example/" },
  { name: "Shop", url: "https://shop.northwind.example/products" },
  { name: "Field Tee" },
]);
checkBreadcrumbLd(crumbs);

// Inlined JSON cannot close its own script tag.
const hostile = jsonLdScript({ name: "</script><script>alert(1)</script>" });
assert.ok(!hostile.includes("</script>"));
assert.equal(JSON.parse(hostile).name, "</script><script>alert(1)</script>");

/* ------------------------------------------------------------------ live */

const liveAt = process.argv.indexOf("--live");
if (liveAt !== -1) {
  const base = process.argv[liveAt + 1];
  const slug = process.argv[liveAt + 2] ?? "northwind-supply";
  const get = async (path) => {
    const response = await fetch(new URL(path, base), { redirect: "manual" });
    assert.equal(response.status, 200, `${path} answered ${response.status}`);
    return response.text();
  };

  const sitemap = await get(`/s/${slug}/sitemap.xml`);
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc.replace(/&amp;/g, "&"));
  assert.ok(locs.length > 0, "the live sitemap is empty");
  for (const loc of locs) absolute(loc, "live sitemap entry");
  assert.ok((await get(`/s/${slug}/robots.txt`)).includes("Sitemap: "), "the live robots file names no sitemap");

  const home = jsonLdIn(await get(`/s/${slug}`));
  assert.ok(home.some((ld) => ld["@type"] === "Organization"), "the live store home has no Organization");
  const productLoc = locs.find((loc) => /\/products\/[^/]+$/.test(loc));
  assert.ok(productLoc, "the live sitemap lists no product");
  const productPath = `/s/${slug}/products/${productLoc.split("/").pop()}`;
  const productHtml = await get(productPath);
  const found = jsonLdIn(productHtml);
  for (const type of ["Product", "BreadcrumbList"]) {
    assert.ok(found.some((ld) => ld["@type"] === type), `${productPath} has no ${type}`);
  }
  for (const ld of [...home, ...found]) CHECKS[ld["@type"]]?.(ld);
  assert.match(productHtml, /<link rel="canonical" href="https:\/\/[^"]+"/, `${productPath} has no canonical link`);
  assert.match(productHtml, /<meta property="og:image" content="[^"]+"/, `${productPath} has no og:image`);
  assert.match(productHtml, /<meta name="twitter:card" content="summary_large_image"/, `${productPath} has no Twitter card`);

  const marketingXml = await get("/sitemap.xml");
  assert.equal(marketingXml.match(/<url>/g)?.length, MARKETING_PATHS.length * LOCALES.length);
  console.log(`seo-check live ok: ${locs.length} sitemap entries for ${slug}, ${found.length + home.length} JSON-LD blocks`);
}

console.log("seo-check ok");
