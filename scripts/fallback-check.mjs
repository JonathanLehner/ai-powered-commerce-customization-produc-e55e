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
    /notFound\(\)/,
    `${catchAll} must raise notFound() so the surface's own boundary renders it`,
  );
}

// The site-wide 404 is a page, not a boundary: it is prerendered, so an address
// that matches nothing arrives as finished HTML rather than an empty document.
assert.ok(exists("not-found.tsx"), "there is no site-wide not-found page");
assert.ok(exists("global-error.tsx"), "there is no global-error page");
assert.ok(exists("(marketing)/error.tsx"), "the public site has no error page");

/* --------------------------------------- a layout must not raise notFound() */

// `notFound()` from a layout escapes that layout's own boundary, so the
// storefront's header and footer would be gone from the very page meant to
// carry them. Layouts render a fallback shell around `children` instead, and
// the pages below raise the 404.
const layouts = [];
(function walk(dir) {
  for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path);
    else if (entry.name === "layout.tsx") layouts.push(path);
  }
})("");

assert.ok(layouts.length >= 6, "the layout scan found almost nothing — has src/app moved?");
/** Drops comments, so a layout explaining the rule is not read as breaking it. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

for (const layout of layouts) {
  const source = code(readFileSync(join(APP, layout), "utf8"));
  assert.doesNotMatch(
    source,
    /\bnotFound\(\)/,
    `${layout} raises notFound(); a layout's own 404 escapes its boundary and loses the chrome`,
  );
}

/* ------------------------------------- the way back into a store's workspace */

// The workspace boundaries are handed no params, so they read the store from
// the path they are standing on.
assert.equal(storeBasePath("/app/stores/str_123/catalog/prd_gone"), "/app/stores/str_123");
assert.equal(storeBasePath("/app/stores/str_123"), "/app/stores/str_123");
assert.equal(storeBasePath("/app/stores/new"), "/app", "creating a store is not a store");
assert.equal(storeBasePath("/app/typo"), "/app");
assert.equal(storeBasePath("/admin/typo"), "/app");

console.log("fallback-check ok");
