// Self-check for the not-found and error pages: npm run fallback-check
//
// A mistyped or expired address must land on a page that still looks like the
// part of the product it was aimed at, with a way onwards. That promise is kept
// by file conventions rather than by code a unit test can call, so this checks
// the conventions themselves — the arrangement is what breaks, silently, when a
// new area is added or a layout starts raising `notFound()` again.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES, matchesRoute } from "../src/lib/routes.ts";
import { storeBasePath } from "../src/lib/util.ts";

// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/…", which
// no fs call can resolve, and every check below then reads as a missing file.
const APP = fileURLToPath(new URL("../src/app/", import.meta.url));
const exists = (path) => {
  try {
    return statSync(join(APP, path)).isFile();
  } catch {
    return false;
  }
};

/* ------------------------------------------- every surface catches its own 404 */

// Each of these is somewhere a visitor can be: the shop, the private gift
// portal, a store's workspace, the workspace at large, platform administration.
// A 404 raised inside one keeps that surface's own chrome, so each needs its own
// boundary — and a catch-all, because an address that matches no page at all
// never reaches a boundary on its own.
const SURFACES = [
  "s/[slug]",
  "g/[slug]",
  "app",
  "app/stores/[storeId]",
  "admin",
];

for (const surface of SURFACES) {
  assert.ok(exists(`${surface}/not-found.tsx`), `${surface} has no not-found.tsx`);
  assert.ok(exists(`${surface}/error.tsx`), `${surface} has no error.tsx`);
  const catchAll = `${surface}/[...rest]/page.tsx`;
  assert.ok(exists(catchAll), `${surface} has no catch-all page`);
  assert.match(
    readFileSync(join(APP, catchAll), "utf8"),
    /from "@\/components\/NotFoundViews"/,
    `${catchAll} must render a NotFoundViews body so the page is server-rendered`,
  );
}

// The site-wide 404 is a page, not a boundary: it is prerendered, so an address
// that matches nothing arrives as finished HTML rather than an empty document.
assert.ok(exists("not-found.tsx"), "there is no site-wide not-found page");
assert.ok(exists("global-error.tsx"), "there is no global-error page");
assert.ok(exists("(marketing)/error.tsx"), "the public site has no error page");

/* ------------------------------------------ nothing may raise notFound() */

// `notFound()` is delivered to React as a thrown error and caught by the
// not-found *error boundary*. An error boundary does not recover during server
// rendering: React abandons the surrounding Suspense boundary and hands it to
// the client, so the response is a document with an empty `<body>` — no store
// header, no footer, nothing until the JavaScript loads and nothing at all if
// it fails. A layout raising it is worse still, because its own chrome goes
// with it.
//
// Every route therefore returns a not-found body from `@/components/
// NotFoundViews` instead, which puts the whole page in the HTML. This walks the
// whole app rather than the layouts alone, because the empty document comes
// back the moment any one route reaches for `notFound()` again.
const routeFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) routeFiles.push(path);
  }
})("");

assert.ok(routeFiles.length >= 40, "the route scan found almost nothing — has src/app moved?");
assert.ok(
  routeFiles.filter((path) => path.endsWith("layout.tsx")).length >= 6,
  "the route scan found almost no layouts — has src/app moved?",
);
/** Drops comments, so a file explaining the rule is not read as breaking it. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

for (const path of routeFiles) {
  const source = code(readFileSync(join(APP, path), "utf8"));
  assert.doesNotMatch(
    source,
    /\bnotFound\(\)/,
    `${path} raises notFound(); its not-found page would then reach the browser as an empty document`,
  );
}

/* ------------------------------------------ a not-found page answers with 404 */

// The pages render their own not-found body, so as far as the router is
// concerned they succeeded and the response is a 200. Search engines and uptime
// monitors read the status, so `src/middleware.ts` recognises the missing shop,
// product or address before the render begins — the last moment a status can
// still be set — and marks the response 404.
const PROXY = fileURLToPath(new URL("../src/middleware.ts", import.meta.url));
const proxySource = readFileSync(PROXY, "utf8");
assert.match(proxySource, /status:\s*404/, "src/middleware.ts no longer marks anything 404");
// The shop and the product are looked up, because "no store with that slug" and
// "that product is not on sale" are not visible in the address itself.
for (const lookup of ["getStoreBySlug", "getStoreProductBySlug", "getGiftCatalogueBySlug"]) {
  assert.ok(proxySource.includes(lookup), `src/middleware.ts no longer checks ${lookup}`);
}

// Proxy cannot ask the router which page an address belongs to, so it carries
// the route table itself. This rebuilds that table from the route files: a page
// added without a line in `src/lib/routes.ts` would otherwise be served as a
// 404 while rendering perfectly well.
const routeFromFile = (path) =>
  "/" +
  path
    .split("/")
    .slice(0, -1)
    .filter((segment) => !segment.startsWith("("))
    .join("/");
const expected = routeFiles
  .filter((path) => /\/(page|route)\.tsx?$/.test(path))
  .filter((path) => !path.includes("[..."))
  .map(routeFromFile)
  .map((route) => (route === "/" ? "/" : route.replace(/\/$/, "")))
  .sort();
assert.deepEqual(
  [...ROUTES].sort(),
  expected,
  "src/lib/routes.ts and the route files disagree about which addresses exist",
);

// An address under a surface that matches no page: the catch-all answers it,
// and the status is a 404 rather than the render's 200.
assert.equal(matchesRoute("/s/northwind-supply/nope"), false);
assert.equal(matchesRoute("/app/stores/str_1/nope"), false);
assert.equal(matchesRoute("/app/stores"), false, "no page lists every store");
assert.equal(matchesRoute("/g/gifts/nope"), false);
assert.equal(matchesRoute("/admin/nope"), false);
// And the real pages stay pages, whatever their dynamic segments hold.
assert.equal(matchesRoute("/s/northwind-supply"), true);
assert.equal(matchesRoute("/s/northwind-supply/products/a-tee"), true);
assert.equal(matchesRoute("/app/stores/str_1/orders/campaigns/cmp_1"), true);
assert.equal(matchesRoute("/admin/catalog/new"), true);
assert.equal(matchesRoute("/"), true);

/* ------------------------------------- the way back into a store's workspace */

// The workspace boundaries are handed no params, so they read the store from
// the path they are standing on.
assert.equal(storeBasePath("/app/stores/str_123/catalog/prd_gone"), "/app/stores/str_123");
assert.equal(storeBasePath("/app/stores/str_123"), "/app/stores/str_123");
assert.equal(storeBasePath("/app/stores/new"), "/app", "creating a store is not a store");
assert.equal(storeBasePath("/app/typo"), "/app");
assert.equal(storeBasePath("/admin/typo"), "/app");

console.log("fallback-check ok");
