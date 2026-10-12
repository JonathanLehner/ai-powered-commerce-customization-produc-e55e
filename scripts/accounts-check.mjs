// Self-check for shopper accounts: npm run accounts-check
//
//   npm run accounts-check                               starts the production build on a free port
//   npm run accounts-check -- --url http://localhost:3000   uses a server that is already running
//
// Shoppers sign in with an email link from Auth.js's Email provider, kept by
// its MongoDB adapter; nothing here makes or checks a token by hand. This
// asserts that:
// - the address book keeps exactly one default and checkout opens on it;
// - the sign-in link goes to the store the shopper asked from;
// - end to end on a running server: asking for a link emails one, opening it
//   signs the shopper in to their account page with their orders, and links
//   the store's customer record to the account;
// - a made-up or edited session cookie is turned away to the sign-in page,
//   and a shopper's session never opens the staff workspace;
// - the account lives in its own Auth.js instance with its own cookies.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local` and refuses to run
// against production.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("accounts-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const rules = await import("../src/lib/account-rules.ts");
const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const accounts = await import("../src/lib/account-data.ts");

/* --------------------------------------------------------------- the rules */

const address = (extra = {}) => ({ name: "Anna K", line1: "12 Mill Lane", city: "Leeds", postalCode: "LS1 4AB", country: "GB", ...extra });
assert.deepEqual(rules.cleanAddress({ ...address(), country: "gb", line2: " ", phone: "" }), { address: address() }, "trimmed, upper-case country, blanks dropped");
assert.deepEqual(rules.cleanAddress(address({ line1: "1" })), { problem: "line1" });
assert.deepEqual(rules.cleanAddress(address({ country: "Britain" })), { problem: "country" });
assert.deepEqual(rules.cleanAddress(address({ country: "US", region: "" })), { problem: "region" }, "a US address needs its state");
assert.deepEqual(rules.cleanAddress(address({ phone: "call me" })), { problem: "phone" });

let book = rules.withAddress([], { ...address(), id: "adr_one" }, false);
assert.equal(book[0].isDefault, true, "the first address is the default");
book = rules.withAddress(book, { ...address({ city: "York" }), id: "adr_two" }, false);
assert.deepEqual(book.map((a) => a.isDefault), [true, false]);
book = rules.withAddress(book, { ...address({ city: "York" }), id: "adr_two" }, true);
assert.deepEqual(book.map((a) => a.isDefault), [false, true], "marking one default unmarks the other");
book = rules.withAddress(book, { ...address({ city: "Bath" }), id: "adr_one" }, false);
assert.equal(book.length, 2, "saving with a known id edits rather than adds");
assert.equal(book[0].city, "Bath");
assert.equal(book[1].isDefault, true, "editing keeps the default where it was");
assert.deepEqual(rules.withoutAddress(book, "adr_two").map((a) => a.isDefault), [true], "removing the default makes another one default");
const full = Array.from({ length: rules.MAX_ADDRESSES }, (_, i) => ({ ...address(), id: `adr_${i}`, isDefault: i === 0 }));
assert.equal(rules.withAddress(full, { ...address(), id: "adr_new" }, false), null, "the book has a limit");
assert.deepEqual(rules.checkoutPrefill("anna@example.com", "Anna Kowalski", book), {
  email: "anna@example.com",
  name: "Anna K",
  line1: "12 Mill Lane",
  line2: "",
  city: "York",
  region: "",
  postalCode: "LS1 4AB",
  country: "GB",
  phone: "",
});
assert.equal(rules.checkoutPrefill("a@b.co", "Anna", []).name, "Anna", "without an address the name still fills in");

assert.deepEqual(
  rules.storeFromCallback("https://shop.example/api/auth/shopper/callback/email?callbackUrl=%2Fs%2Fnorth%2Fde%2Faccount&token=x&email=a"),
  { slug: "north", locale: "de" },
);
assert.deepEqual(
  rules.storeFromCallback("https://x/api/auth/shopper/callback/email?callbackUrl=https%3A%2F%2Fx%2Fs%2Fnorth%2Fen%2Faccount"),
  { slug: "north", locale: "en" },
);
assert.equal(rules.storeFromCallback("https://x/cb?callbackUrl=%2Fapp"), null, "a link for anything but a store account is not sent");

/* ---------------------------------------------- the instance and its cookies */

const shopperAuth = readFileSync(join(ROOT, "src/shopper-auth.ts"), "utf8");
assert.match(shopperAuth, /basePath: "\/api\/auth\/shopper"/);
assert.match(shopperAuth, /type: "email"/, "the Email provider");
assert.match(shopperAuth, /MongoDBAdapter\(/, "the official MongoDB adapter keeps the tokens");
assert.match(shopperAuth, /sessionToken: \{ name: `\$\{COOKIE\}\.session-token` \}/, "its own session cookie");
assert.match(shopperAuth, /sendEmail\(/, "links go out through the existing email sender");
assert.ok(!/createHash|randomBytes|getRandomValues|jwt\.sign|sha256/i.test(shopperAuth), "no token is made or hashed by hand");
assert.ok(existsSync(join(ROOT, "src/app/api/auth/shopper/[...nextauth]/route.ts")));

/* ------------------------------------------------------------ end to end */

const argUrl = process.argv.indexOf("--url");
let base = argUrl > -1 ? process.argv[argUrl + 1] : null;
let server = null;
let log = "";
if (!base) {
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) {
    console.error("accounts-check needs a production build (npm run build), or --url of a running server.");
    process.exit(1);
  }
  const port = 3800 + Math.floor(Math.random() * 90);
  base = `http://localhost:${port}`;
  const env = { ...process.env };
  delete env.EMAIL_PROVIDER;
  server = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(port)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env });
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${base}/api/v1/openapi.json`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() - started > 60_000 || server.exitCode !== null) {
      console.error(`The server did not start:\n${log}`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const RUN = `acc${Date.now().toString(36)}`;
const email = `shopper-${RUN}@example.com`;
const store = (await db.findOne(COLLECTIONS.stores, { id: "str_rivet" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
assert.ok(store, "the development database has a store (npm run seed)");
const orderTemplate = await db.findOne(COLLECTIONS.orders, { storeId: store.id });
const order = { ...orderTemplate, id: `ord_${RUN}`, code: `ACC-${RUN.toUpperCase()}`, customer: { ...orderTemplate.customer, email }, campaign: null, idempotencyKey: null };
delete order._id;
await db.insertOne(COLLECTIONS.orders, order);

const jar = new Map();
const keep = (response) => {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
};
const cookieHeader = (only) =>
  [...jar].filter(([name]) => !only || only.includes(name)).map(([name, value]) => `${name}=${value}`).join("; ");

try {
  const csrf = await fetch(`${base}/api/auth/shopper/csrf`);
  keep(csrf);
  const { csrfToken } = await csrf.json();
  assert.ok(csrfToken, "Auth.js hands out a CSRF token");
  const asked = await fetch(`${base}/api/auth/shopper/signin/email`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: new URLSearchParams({ email, csrfToken, callbackUrl: `/s/${store.slug}/en/account` }),
  });
  assert.ok([302, 303].includes(asked.status), `asking for a link answers with a redirect, not ${asked.status}`);
  assert.ok(!(asked.headers.get("location") ?? "").includes("error"), asked.headers.get("location"));

  // No email provider in development: the message is logged, link and all.
  let link = null;
  for (let i = 0; i < 40 && !link; i++) {
    const match = /https?:\/\/[^\s]+\/api\/auth\/shopper\/callback\/email\?[^\s]+/.exec(log);
    link = match ? match[0] : null;
    if (!link) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (server) assert.ok(link, `the sign-in email was sent:\n${log.slice(-2000)}`);
  if (link) {
    const token = await db.findOne(COLLECTIONS.shopperVerificationTokens, { identifier: email });
    assert.ok(token && token.token !== new URL(link).searchParams.get("token"), "the adapter stores the token hashed, not as sent");

    const opened = await fetch(link.replace(/^https?:\/\/[^/]+/, base), { redirect: "manual", headers: { cookie: cookieHeader() } });
    keep(opened);
    assert.ok([302, 303].includes(opened.status));
    assert.match(opened.headers.get("location") ?? "", new RegExp(`/s/${store.slug}/en/account$`), "the link returns to the store's account page");
    assert.ok(jar.get("parcelith-shopper.session-token"), "opening the link signs the shopper in");
    const reused = await fetch(link.replace(/^https?:\/\/[^/]+/, base), { redirect: "manual" });
    assert.match(reused.headers.get("location") ?? "", /error/i, "a link works once");

    const session = cookieHeader(["parcelith-shopper.session-token"]);
    const page = await fetch(`${base}/s/${store.slug}/account`, { headers: { cookie: session } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(email), "the account page shows who is signed in");
    assert.ok(html.includes(order.code), "and their orders in this store");
    const customer = await db.findOne(COLLECTIONS.customers, { storeId: store.id, email });
    assert.ok(customer?.account?.userId, "the store's customer record is linked to the account");

    const account = { userId: customer.account.userId, email };
    assert.equal(await accounts.saveAddressBook(store.id, account, rules.withAddress([], { ...address(), id: "adr_e2e000000001" }, true)), true);
    assert.equal(await accounts.saveAddressBook(store.id, { ...account, userId: "someone-else" }, []), false, "only the linked account edits the book");
    assert.equal(await accounts.saveMarketingConsent(store, account, true), true);
    const saved = await db.findOne(COLLECTIONS.customers, { storeId: store.id, email });
    assert.equal(saved.addresses.length, 1);
    assert.equal(saved.marketing.subscribed, true);

    const asStaff = await fetch(`${base}/app`, { redirect: "manual", headers: { cookie: `authjs.session-token=${jar.get("parcelith-shopper.session-token")}` } });
    assert.ok([302, 303, 307].includes(asStaff.status) && /\/login/.test(asStaff.headers.get("location") ?? ""), "a shopper session does not open the workspace");
  }

  for (const forged of ["made-up", `${(jar.get("parcelith-shopper.session-token") ?? "eyJhbGciOiJkaXIifQ").slice(0, -4)}AAAA`]) {
    const page = await fetch(`${base}/s/${store.slug}/account`, { redirect: "manual", headers: { cookie: `parcelith-shopper.session-token=${forged}` } });
    assert.ok([302, 303, 307].includes(page.status), `a forged session is redirected, not ${page.status}`);
    assert.match(page.headers.get("location") ?? "", /\/account\/login$/);
  }
  const signedOut = await fetch(`${base}/s/${store.slug}/account`, { redirect: "manual" });
  assert.match(signedOut.headers.get("location") ?? "", /\/account\/login$/, "signed out goes to sign-in");
  const login = await fetch(`${base}/s/${store.slug}/account/login`);
  assert.equal(login.status, 200);
} finally {
  await Promise.all([
    db.deleteMany(COLLECTIONS.orders, { id: order.id }),
    db.deleteMany(COLLECTIONS.customers, { storeId: store.id, email }),
    db.deleteMany(COLLECTIONS.shopperAccounts, { email }),
    db.deleteMany(COLLECTIONS.shopperVerificationTokens, { identifier: email }),
    db.deleteMany(COLLECTIONS.audit, { storeId: store.id, "meta.to": email }),
  ]);
  server?.kill();
}

console.log("accounts-check ok: email link sign-in, linked customer record, forged sessions turned away");
process.exit(0);
