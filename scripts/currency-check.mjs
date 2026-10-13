// Self-check for presentment currencies: npm run currency-check
//
// Asserts that:
// - rounding rules round up to the next .00 / .90 / .95 / .99 (or 10 / 100 for
//   currencies without cents), and only the rules that fit a currency are offered;
// - a currency is priced at its manual rate when one is set, otherwise at the
//   latest market rate, and the shop currency is never rounded;
// - the basket prices lines, shipping, discounts and gift cards at the store's
//   rates, so what the shopper is shown is what the order charges;
// - the shopper's country picks the currency when the store sells in it, and a
//   currency picked in the switcher always wins;
// - checkout charges Stripe in the presentment currency and the order keeps the
//   shop currency, its total in it and the rate;
// - the settings refuse a rate or rule that makes no sense, and automatic rates
//   come from the market feed (mocked here: no request leaves the machine).
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("currency-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
let feed = null;
let feedCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).startsWith("https://open.er-api.com/")) {
    feedCalls += 1;
    if (!feed) throw new Error("feed down");
    return new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`currency-check makes no network calls (${url})`);
};

const fx = await import("../src/lib/currency.ts");
const { basketTotals } = await import("../src/lib/basket.ts");
const { checkDiscount } = await import("../src/lib/discounts.ts");
const { giftCardCover } = await import("../src/lib/gift-cards.ts");

/* ---------------------------------------------------------------- rounding */

const r = fx.applyRounding;
assert.equal(r(2342, "EUR", "0.90"), 2390, "23.42 → 23.90");
assert.equal(r(2395, "EUR", "0.90"), 2490, "23.95 → 24.90: always up");
assert.equal(r(2390, "EUR", "0.90"), 2390, "a price already on the rule stays");
assert.equal(r(2300, "EUR", "0.99"), 2399);
assert.equal(r(2342, "EUR", "0.95"), 2395);
assert.equal(r(2342, "EUR", "0.00"), 2400, "23.42 → 24.00");
assert.equal(r(2400, "EUR", "0.00"), 2400);
assert.equal(r(2342, "EUR", "none"), 2342);
assert.equal(r(1234, "JPY", "10"), 1240, "¥1,234 → ¥1,240");
assert.equal(r(1234, "JPY", "100"), 1300);
assert.deepEqual(fx.roundingRulesFor("EUR"), ["none", "0.00", "0.90", "0.95", "0.99"]);
assert.deepEqual(fx.roundingRulesFor("JPY"), ["none", "10", "100"], "no cent endings for yen");

/* ------------------------------------------------------------------- rates */

const base = {
  defaultCurrency: "USD",
  currencies: ["USD", "EUR", "GBP", "JPY"],
  currencyRates: {
    EUR: { mode: "manual", rate: 0.9, rounding: "0.90" },
    GBP: { mode: "auto", rate: null, rounding: "0.99" },
    JPY: { mode: "auto", rate: null, rounding: "0.90" },
  },
  fxRates: { base: "USD", rates: { USD: 1, EUR: 0.92, GBP: 0.8, JPY: 150 }, fetchedAt: new Date().toISOString() },
};
assert.deepEqual(fx.currencySettings(base, "JPY"), { mode: "auto", rate: null, rounding: "none" }, "a rule that does not fit the currency is ignored");
assert.deepEqual(fx.currencySettings({ currencyRates: { EUR: { mode: "manual", rate: null, rounding: "none" } } }, "EUR").mode, "auto", "manual without a rate is automatic");
assert.equal(fx.presentmentRate(base, "EUR"), 0.9, "a manual rate is used as set");
assert.ok(Math.abs(fx.presentmentRate(base, "GBP") - 0.8) < 1e-9, "an automatic rate follows the market");
assert.equal(fx.presentmentRate(base, "USD"), 1);
const noFeed = { ...base, fxRates: null };
assert.ok(Math.abs(fx.presentmentRate(noFeed, "GBP") - 1 / 1.27) < 1e-9, "without market rates the built-in table stands in");

assert.equal(fx.presentmentPrice(base, 2500, "USD", "EUR"), 2290, "$25.00 at 0.90 is €22.50, rounded up to €22.90");
assert.equal(fx.presentmentPrice(base, 2500, "USD", "GBP"), 2099, "$25.00 at 0.80 is £20.00, rounded to £20.99");
assert.equal(fx.presentmentPrice(base, 2500, "USD", "JPY"), 3750, "¥3,750 with no rounding");
assert.equal(fx.presentmentPrice(base, 2500, "USD", "USD"), 2500, "the shop currency is as priced");
assert.equal(fx.presentmentPrice(base, 2290, "EUR", "USD"), Math.round((22.9 / 0.9) * 100), "back into the shop currency without rounding");
assert.equal(fx.presentmentAmount(base, 500, "USD", "EUR"), 450, "other amounts convert at the rate, unrounded");
assert.equal(fx.toShopAmount(base, 4580, "EUR"), Math.round((45.8 / 0.9) * 100), "an order total back in the shop currency");

/* ----------------------------------------------------------------- country */

const enabled = ["USD", "EUR", "GBP"];
assert.equal(fx.shopperCurrency({ chosen: null, country: "DE", enabled, fallback: "USD" }), "EUR", "a shopper in Germany sees euros");
assert.equal(fx.shopperCurrency({ chosen: null, country: "gb", enabled, fallback: "USD" }), "GBP");
assert.equal(fx.shopperCurrency({ chosen: null, country: "JP", enabled, fallback: "USD" }), "USD", "a currency the store does not sell falls back");
assert.equal(fx.shopperCurrency({ chosen: "USD", country: "DE", enabled, fallback: "USD" }), "USD", "the switcher wins over the country");
assert.equal(fx.shopperCurrency({ chosen: "CHF", country: null, enabled, fallback: "USD" }), "USD", "a currency no longer sold is not kept");
assert.equal(fx.countryCurrency("FR"), "EUR");
assert.equal(fx.countryCurrency("ZZ"), null);

/* ------------------------------------------------------------------ basket */

const store = {
  id: "str_fx", slug: "fx", defaultCurrency: "USD", currencies: base.currencies, currencyRates: base.currencyRates,
  fxRates: base.fxRates, pricesIncludeTax: true, stripe: { country: "US", connected: false, chargesEnabled: false, accountId: null },
  demo: true, tax: { mode: "manual", rates: [] },
};
const product = { id: "p1", currency: "USD", taxBracketId: null, variants: [{ id: "v1", weightGrams: 300 }], giftCard: false };
const items = [{ id: "i1", storeProductId: "p1", variantId: "v1", productName: "Tee", variantName: "M", quantity: 2, unitPrice: 2500 }];
const known = { products: new Map([["p1", product]]), brackets: [] };
const totals = await basketTotals(store, items, "EUR", null, known, { zones: [] });
assert.equal(totals.lines[0].unit, 2290, "the basket prices each line at the rate and rounding the catalog shows");
assert.equal(totals.subtotal, 4580);
assert.equal(totals.shipping, 590 * 0.9, "shipping converts at the store's rate");
const code = { active: true, expiresAt: null, usageLimit: null, timesUsed: 0, minimumSubtotal: 0, kind: "fixed", value: 500, currency: "USD" };
assert.equal(checkDiscount(code, 4580, "EUR", new Date(), fx.storeFxTable(store)).amount, 450, "a fixed discount converts at the store's rate");
assert.equal(giftCardCover({ balance: 1000, currency: "USD" }, 4000, "EUR", { fx: fx.storeFxTable(store) }).amount, 900, "so does a gift card");

/* ---------------------------------------------------------------- checkout */

const shop = readFileSync(new URL("../src/app/actions/shop.ts", import.meta.url), "utf8");
const placeOrder = shop.slice(shop.indexOf("export async function placeOrder"), shop.indexOf("async function closeOpenCheckouts"));
assert.match(placeOrder, /createConnectedCheckout\(\{[\s\S]*?\n\s+currency,\n/, "Stripe Checkout is opened in the presentment currency");
assert.match(placeOrder, /shopCurrency: store\.defaultCurrency/, "the order records the shop currency");
assert.match(placeOrder, /shopTotal: toShopAmount\(store, total, currency\)/, "and its total in it");
assert.match(placeOrder, /exchangeRate: presentmentRate\(store, currency\)/, "and the rate");
assert.match(shop, /country: list\.get\("cf-ipcountry"\)/, "the shopper's country comes from Cloudflare's visitor country");

/* ----------------------------------------------------------- the settings */

const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS, getStore } = await import("../src/lib/data.ts");
const { saveCurrencyRates, refreshExchangeRates } = await import("../src/lib/operations/store-settings.ts");
const template = (await db.findOne(COLLECTIONS.stores, { id: "str_northwind" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
assert.ok(template, "the development database has a store (npm run seed)");
const RUN = `fx${Date.now().toString(36)}`;
const saved = { ...template, id: `str_${RUN}`, slug: `currency-check-${RUN}`, defaultCurrency: "USD", currencies: ["USD", "EUR", "JPY"], currencyRates: {}, fxRates: null };
delete saved._id;
await db.insertOne(COLLECTIONS.stores, saved);
const ctx = { store: saved, actor: { id: "usr_fx_check", name: "Currency Check" }, locale: "en" };
const refused = async (input, field) => {
  try {
    await saveCurrencyRates(ctx, input);
  } catch (error) {
    assert.equal(error.code, "invalid");
    assert.equal(error.field, field);
    return;
  }
  assert.fail(`expected ${field} to be refused`);
};
try {
  await refused({ EUR: { mode: "manual", rate: 0, rounding: "none" } }, "rate_EUR");
  await refused({ EUR: { mode: "manual", rate: -2, rounding: "none" } }, "rate_EUR");
  await refused({ JPY: { mode: "auto", rounding: "0.99" } }, "rounding_JPY");
  await refused({ GBP: { mode: "auto", rounding: "none" } }, "rate_GBP");
  await refused({ USD: { mode: "auto", rounding: "none" } }, "rate_USD");

  feed = { result: "success", rates: { USD: 1, EUR: 0.93, JPY: 151.2, XXX: 9 } };
  const after = await saveCurrencyRates(ctx, {
    EUR: { mode: "manual", rate: 0.91, rounding: "0.95" },
    JPY: { mode: "auto", rounding: "100" },
  });
  assert.equal(feedCalls, 1, "an automatic rate with no market rates fetches them");
  const stored = await getStore(saved.id);
  assert.deepEqual(stored.currencyRates.EUR, { mode: "manual", rate: 0.91, rounding: "0.95" });
  assert.deepEqual(stored.currencyRates.JPY, { mode: "auto", rate: null, rounding: "100" });
  assert.equal(stored.fxRates.rates.JPY, 151.2, "market rates are kept on the store");
  assert.ok(!("XXX" in stored.fxRates.rates), "only supported currencies are kept");
  assert.equal(fx.presentmentPrice(after, 2500, "USD", "JPY"), 3800, "$25 at ¥151.2 is ¥3,780, rounded up to ¥3,800");

  feed = null;
  try {
    await refreshExchangeRates({ ...ctx, store: stored });
    assert.fail("a feed that is down is reported");
  } catch (error) {
    assert.equal(error.code, "conflict");
  }
  assert.equal((await getStore(saved.id)).fxRates.rates.JPY, 151.2, "and the last rates stay");
} finally {
  await db.deleteMany(COLLECTIONS.stores, { id: saved.id });
  await db.deleteMany(COLLECTIONS.audit, { storeId: saved.id });
}

console.log("currency-check ok: rounding, rates, country, basket, checkout and settings");
process.exit(0);
