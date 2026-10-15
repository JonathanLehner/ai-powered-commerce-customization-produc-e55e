// Self-check for the bulk actions on the Catalog page: npm run bulk-products-check
//
// The toolbar says which ticked products an action will skip and previews the
// margins a price change leaves; the server action refuses the same products
// for the same reasons, so both read these rules.
import assert from "node:assert/strict";
import {
  BULK_PRODUCT_LIMIT,
  approveBlock,
  archiveBlock,
  bracketBlock,
  changePrice,
  parsePriceChange,
  parseProductIds,
  previewPrice,
  priceBlock,
  mockupState,
  publishBlock,
  publishHoldups,
  repriceProduct,
  unpublishBlock,
  visibilityBlock,
} from "../src/lib/bulk-products.ts";

// Publishing keeps the product page's rule: nothing goes live with blockers.
assert.equal(publishBlock({ status: "draft", publishBlockers: [] }), null);
assert.equal(publishBlock({ status: "in_review", publishBlockers: [] }), null);
assert.equal(publishBlock({ status: "draft", publishBlockers: ["The generated mockups have not been approved."] }), "notReady");
assert.equal(publishBlock({ status: "archived", publishBlockers: ["No artwork has been placed."] }), "notReady");
assert.equal(publishBlock({ status: "published", publishBlockers: [] }), "alreadyPublished");

// Approving needs previews, and only touches ones still waiting.
assert.equal(mockupState([]), "none");
assert.equal(mockupState([{ approved: true }, { approved: false }]), "unapproved");
assert.equal(mockupState([{ approved: true }]), "approved");
assert.equal(approveBlock({ mockups: "unapproved" }), null);
assert.equal(approveBlock({ mockups: "none" }), "noMockups");
assert.equal(approveBlock({ mockups: "approved" }), "alreadyApproved");

// A greyed-out Publish says what holds the selection back, most common first.
const starter = (codes) => ({ status: "draft", publishBlockerCodes: codes });
assert.deepEqual(
  publishHoldups([
    ...Array.from({ length: 6 }, () => starter(["unapproved"])),
    starter(["unapproved", "noBracket"]),
    { status: "published", publishBlockerCodes: [] },
  ]),
  [
    { code: "unapproved", count: 7 },
    { code: "noBracket", count: 1 },
    { code: "alreadyPublished", count: 1 },
  ],
);
assert.deepEqual(publishHoldups([starter(["preflight", "preflight"])]), [{ code: "preflight", count: 1 }], "a product counts once per kind");

assert.equal(unpublishBlock({ status: "published" }), null);
for (const status of ["draft", "in_review", "archived"]) assert.equal(unpublishBlock({ status }), "notPublished");
assert.equal(archiveBlock({ status: "published" }), null);
assert.equal(archiveBlock({ status: "archived" }), "alreadyArchived");
assert.equal(bracketBlock({ taxBracketId: "tb_std" }, "tb_std"), "alreadyBracket");
assert.equal(bracketBlock({ taxBracketId: null }, "tb_std"), null);
assert.equal(visibilityBlock({ visibility: "hidden" }, "hidden"), "alreadyVisibility");
assert.equal(visibilityBlock({ visibility: "public" }, "hidden"), null);

// Price changes.
assert.deepEqual(parsePriceChange({ mode: "increase", value: 10 }), { mode: "increase", value: 10 });
assert.equal(parsePriceChange({ mode: "decrease", value: 100 }), null, "cannot lower to nothing");
assert.equal(parsePriceChange({ mode: "increase", value: 0 }), null);
assert.equal(parsePriceChange({ mode: "set", value: 12.5 }), null, "fixed prices are minor units");
assert.equal(parsePriceChange({ mode: "bogus", value: 5 }), null);
assert.equal(parsePriceChange(null), null);
assert.equal(changePrice(2500, { mode: "increase", value: 10 }), 2750);
assert.equal(changePrice(2500, { mode: "decrease", value: 15 }), 2125);
assert.equal(changePrice(1999, { mode: "increase", value: 5 }), 2099, "rounded to the minor unit");
assert.equal(changePrice(2500, { mode: "set", value: 3000 }), 3000);

const tee = {
  id: "sp_1",
  name: "Field Tee",
  status: "published",
  visibility: "public",
  taxBracketId: "tb_std",
  price: 2600,
  currency: "USD",
  variants: [
    { id: "v1", enabled: true, price: 2600, baseCost: 1000 },
    { id: "v2", enabled: true, price: 2900, baseCost: 1200 },
    { id: "v3", enabled: false, price: 900, baseCost: 1200 },
  ],
  costs: { supplierCost: 1000, customizationCost: 300, shippingEstimate: 400, taxRate: 0, marginAmount: 900, marginPct: 34.62 },
  publishBlockers: [],
  publishBlockerCodes: [],
  mockups: "approved",
};

// Every variant moves with the product; a fixed price sets them all.
assert.deepEqual(repriceProduct(tee, { mode: "increase", value: 10 }).variants.map((v) => v.price), [2860, 3190, 990]);
assert.deepEqual(repriceProduct(tee, { mode: "set", value: 3000 }).variants.map((v) => v.price), [3000, 3000, 3000]);

// The preview shows the margin the new price leaves.
const up = previewPrice(tee, { mode: "increase", value: 10 }, false);
assert.equal(up.price, 2860);
assert.equal(up.marginAmount, 2860 - 1700);
assert.equal(up.block, null);
// Tax-inclusive prices leave less to keep.
assert.ok(previewPrice({ ...tee, costs: { ...tee.costs, taxRate: 20 } }, { mode: "set", value: 2600 }, true).marginAmount < 900);

// Below cost is refused: at a loss overall, or an enabled variant at or under its own cost.
assert.equal(previewPrice(tee, { mode: "decrease", value: 40 }, false).block, "belowCost");
assert.equal(priceBlock([{ enabled: true, price: 1200, baseCost: 1200 }], 100), "belowCost");
assert.equal(priceBlock([{ enabled: false, price: 100, baseCost: 1200 }], 100), null, "disabled variants are not sold");

// Ids: trimmed, de-duplicated, capped, and only from a list.
assert.deepEqual(parseProductIds([" sp_1", "sp_2", "sp_1", 4, ""]), ["sp_1", "sp_2"]);
assert.deepEqual(parseProductIds("sp_1"), []);
assert.equal(parseProductIds(Array.from({ length: 500 }, (_, i) => `sp_${i}`)).length, BULK_PRODUCT_LIMIT);

console.log("bulk-products-check ok");
