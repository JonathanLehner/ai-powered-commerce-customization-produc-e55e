// Self-check for product reviews: npm run reviews-check
//
// Runs the review action and moderation against throwaway records in the
// development database, and asserts that:
// - only a verified buyer can review: the order's signed link is required, the
//   order has to be delivered, the product has to be on it, and a gift card
//   cannot be reviewed;
// - one review per product per order, however often the form is sent;
// - a review waits for the store, and only approved reviews count towards
//   the rating, which is averaged and rounded as the product page shows it;
// - the product's JSON-LD carries the aggregate rating and the reviews.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run
// against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("reviews-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
globalThis.fetch = async (url) => {
  throw new Error(`reviews-check makes no network calls (${url})`);
};

const rules = await import("../src/lib/reviews.ts");
const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const { signOrderToken } = await import("../src/lib/order-access.ts");
const { submitReview } = await import("../src/app/actions/product-reviews.ts");
const { listApprovedReviews, productRating } = await import("../src/lib/review-data.ts");
const { deleteReview, moderateReview } = await import("../src/lib/operations/reviews.ts");
const { productJsonLd } = await import("../src/lib/seo.ts");
const { matchesRoute } = await import("../src/lib/routes.ts");

const quiet = console.error;
console.error = () => {};

/* -------------------------------------------------------------- the rules */

const item = (storeProductId, productName = storeProductId) => ({ storeProductId, productName });
const delivered = { status: "delivered", items: [item("prd_a", "Tote"), item("prd_b", "Mug"), item("prd_a", "Tote"), item("prd_gift", "Gift card")] };
assert.deepEqual(
  rules.reviewableItems(delivered, new Set(["prd_gift"])),
  [{ productId: "prd_a", productName: "Tote" }, { productId: "prd_b", productName: "Mug" }],
  "each product once, gift cards left out",
);
for (const status of ["awaiting_payment", "paid", "in_production", "shipped", "cancelled", "exception"]) {
  assert.deepEqual(rules.reviewableItems({ ...delivered, status }), [], `a ${status} order cannot be reviewed yet`);
}
const valid = { rating: 5, title: "", body: "Lovely and sturdy.", authorName: "Anna K." };
assert.equal(rules.reviewProblem(valid), null);
assert.equal(rules.reviewProblem({ ...valid, rating: 0 })?.problem, "ratingInvalid");
assert.equal(rules.reviewProblem({ ...valid, rating: 4.5 })?.problem, "ratingInvalid");
assert.equal(rules.reviewProblem({ ...valid, rating: 6 })?.problem, "ratingInvalid");
assert.equal(rules.reviewProblem({ ...valid, body: "ok" })?.problem, "bodyTooShort");
assert.equal(rules.reviewProblem({ ...valid, body: "x".repeat(2001) })?.problem, "bodyTooLong");
assert.equal(rules.reviewProblem({ ...valid, authorName: " " })?.field, "authorName");
assert.equal(rules.reviewerName("Anna Maria Kowalski"), "Anna K.", "the buyer's full name is not shown");
assert.equal(rules.reviewerName("Cher"), "Cher");
const summary = rules.ratingSummary([
  { rating: 5, status: "approved" },
  { rating: 4, status: "approved" },
  { rating: 4, status: "approved" },
  { rating: 1, status: "pending" },
  { rating: 1, status: "rejected" },
]);
assert.deepEqual(summary, { average: 4.3, count: 3, distribution: [0, 0, 0, 2, 1] }, "only approved reviews count");
assert.deepEqual(rules.reviewJsonLd(rules.ratingSummary([]), []), {}, "no rating without reviews");
const ld = {
  ...productJsonLd({ name: "Tote", description: "", url: "https://x/p", sku: "T", brand: "B", images: [], currency: "EUR", variants: [{ price: 100, availability: "in_stock" }] }),
  ...rules.reviewJsonLd(summary, [{ rating: 5, title: "Great", body: "Lovely.", authorName: "Anna K.", createdAt: "2026-03-04T10:00:00Z" }]),
};
assert.equal(ld["@type"], "Product");
assert.deepEqual(ld.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.3, reviewCount: 3, bestRating: 5, worstRating: 1 });
assert.equal(ld.review[0]["@type"], "Review");
assert.equal(ld.review[0].reviewRating.ratingValue, 5);
assert.equal(ld.review[0].datePublished, "2026-03-04");

/* ---------------------------------------------------------- against the db */

const RUN = `rev${Date.now().toString(36)}`;
const template = await db.findOne(COLLECTIONS.stores, { id: "str_rivet" });
const orderTemplate = await db.findOne(COLLECTIONS.orders, { storeId: "str_rivet", "campaign.campaignId": { $exists: false } });
const productTemplate = await db.findOne(COLLECTIONS.storeProducts, { storeId: "str_rivet" });
assert.ok(template && orderTemplate && productTemplate, "the seeded rivet-hardware store is in the development database (npm run seed)");
const store = { ...template, id: `str_${RUN}`, slug: `reviews-check-${RUN}`, customDomain: null };
delete store._id;
const product = { ...productTemplate, id: `prd_${RUN}`, storeId: store.id, slug: `tote-${RUN}` };
delete product._id;
const giftProduct = { ...productTemplate, id: `prd_${RUN}_gift`, storeId: store.id, slug: `gift-${RUN}`, giftCard: true };
delete giftProduct._id;
await db.insertOne(COLLECTIONS.stores, store);
await db.insertMany(COLLECTIONS.storeProducts, [product, giftProduct]);
const ctx = { store, actor: { id: "usr_review_check", name: "Review Check" }, locale: "en" };

let orders = 0;
async function makeOrder(status, products = [product]) {
  orders += 1;
  const order = {
    ...orderTemplate,
    id: `ord_${RUN}_${orders}`,
    storeId: store.id,
    code: `REV-${RUN.toUpperCase()}-${orders}`,
    status,
    customer: { ...orderTemplate.customer, name: "Anna Maria Kowalski", email: `anna-${RUN}@example.com` },
    items: products.map((p, i) => ({ ...orderTemplate.items[0], id: `oit_${i}`, storeProductId: p.id, productName: p.name })),
    campaign: null,
    idempotencyKey: `idem_${RUN}_${orders}`,
  };
  delete order._id;
  await db.insertOne(COLLECTIONS.orders, order);
  return order;
}
async function send(order, overrides = {}) {
  const form = new FormData();
  const fields = {
    storeId: store.id,
    code: order.code,
    token: await signOrderToken(store.id, order.code),
    productId: product.id,
    rating: "5",
    title: "Sturdy",
    body: "Lovely and sturdy, carried it every day.",
    authorName: "Anna K.",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return submitReview({ status: "idle" }, form);
}

try {
  const shipped = await makeOrder("shipped");
  assert.equal((await send(shipped)).status, "error", "not before delivery");
  const order = await makeOrder("delivered", [product, giftProduct]);
  assert.equal((await send(order, { token: "forged" })).status, "error", "the order's signed link is required");
  assert.equal((await send(order, { token: await signOrderToken(store.id, shipped.code) })).status, "error", "another order's link does not open this one");
  assert.equal((await send(order, { productId: giftProduct.id })).status, "error", "a gift card is not reviewed");
  assert.equal((await send(order, { productId: `prd_${RUN}_other` })).status, "error", "only a product on the order");
  const short = await send(order, { body: "meh" });
  assert.equal(short.field, "body");

  const results = await Promise.all([send(order), send(order), send(order)]);
  assert.ok(results.every((r) => r.status === "success"), JSON.stringify(results));
  const stored = await db.find(COLLECTIONS.reviews, { storeId: store.id });
  assert.equal(stored.length, 1, "three sends of the same form are one review");
  assert.equal(stored[0].status, "pending", "it waits for the store");
  assert.equal(stored[0].authorName, "Anna K.");
  assert.equal(stored[0].orderCode, order.code);

  assert.deepEqual(await productRating(store.id, product.id), { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] }, "a pending review does not count");
  assert.equal((await listApprovedReviews(store.id, product.id)).length, 0);

  const second = await makeOrder("delivered");
  assert.equal((await send(second, { rating: "4" })).status, "success");
  const [a, b] = await db.find(COLLECTIONS.reviews, { storeId: store.id }, { sort: { createdAt: 1 } });
  await moderateReview(ctx, a, "approved");
  await moderateReview(ctx, b, "approved");
  assert.deepEqual(await productRating(store.id, product.id), { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
  const approvedB = await db.findOne(COLLECTIONS.reviews, { id: b.id });
  await moderateReview(ctx, approvedB, "rejected");
  assert.equal((await productRating(store.id, product.id)).count, 1, "a rejected review leaves the rating");
  assert.equal((await db.findOne(COLLECTIONS.reviews, { id: b.id })).moderatedBy, "Review Check");
  await deleteReview(ctx, approvedB);
  assert.equal(await db.count(COLLECTIONS.reviews, { storeId: store.id }), 1);

  /* ---- wiring */
  for (const path of ["/app/stores/str_1/reviews", "/api/v1/stores/str_1/reviews", "/api/v1/stores/str_1/reviews/rev_1"]) {
    assert.ok(matchesRoute(path), `${path} is a page`);
  }
  const operations = readFileSync(new URL("../src/lib/api/operations.ts", import.meta.url), "utf8");
  for (const id of ["listReviews", "getReview", "moderateReview", "deleteReview"]) {
    assert.ok(operations.includes(`id: "${id}"`), `the Admin API and MCP offer ${id}`);
  }
  const page = readFileSync(new URL("../src/app/s/[slug]/[locale]/products/[productSlug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.\.\.reviewJsonLd\(rating, reviews\)/, "the product page's JSON-LD carries the rating");
} finally {
  await Promise.all([
    db.deleteMany(COLLECTIONS.stores, { id: store.id }),
    db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.orders, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.reviews, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.audit, { storeId: store.id }),
  ]);
  console.error = quiet;
}

console.log("reviews-check ok: verified buyers only, one review per product per order, approved reviews make the rating");
process.exit(0);
