// Self-check for telling two copies of one supplier product apart:
// npm run copy-identity-check
import assert from "node:assert/strict";
import { baseStoreSku, nextFreeName, nextFreeSku, skuStem, storeSku, storeSkuPrefix } from "../src/lib/sku.ts";

// A store prefix is six alphanumerics of the channel code.
assert.equal(storeSkuPrefix("northwind-supply"), "NORTHW");
assert.equal(storeSkuPrefix(""), "STORE");

// The stem is the first three letters of the first three words.
assert.equal(skuStem("Organic Cotton Tee"), "ORG-COT-TEE");
assert.equal(skuStem("Classic 11oz Ceramic Mug"), "CLA-11O-CER");
assert.equal(baseStoreSku("northwind-supply", "Organic Cotton Tee"), "NORTHW-ORG-COT-TEE");

// A second copy is named and coded so it cannot be mistaken for the first.
const taken = ["Organic Cotton Tee"];
assert.equal(nextFreeName("Organic Cotton Tee", taken), "Organic Cotton Tee (2)");
assert.equal(nextFreeName("Organic Cotton Tee", [...taken, "Organic Cotton Tee (2)"]), "Organic Cotton Tee (3)");
assert.equal(nextFreeName("Heavy Cotton Tee", taken), "Heavy Cotton Tee");
assert.equal(nextFreeSku("NORTHW-ORG-COT-TEE", ["NORTHW-ORG-COT-TEE"]), "NORTHW-ORG-COT-TEE-2");
assert.equal(nextFreeSku("NORTHW-ORG-COT-TEE", []), "NORTHW-ORG-COT-TEE");

// A stored SKU is shown as it is; a record imported before SKUs existed still
// gets one, and two such copies never collide.
assert.equal(storeSku({ id: "prd_1", name: "Organic Cotton Tee", sku: "NORTHW-ORG-COT-TEE-2" }, "northwind-supply"), "NORTHW-ORG-COT-TEE-2");
const legacyA = storeSku({ id: "prd_j30u41i1ry63", name: "Organic Cotton Tee" }, "northwind-supply");
const legacyB = storeSku({ id: "prd_htshkoaxgmh2", name: "Organic Cotton Tee" }, "northwind-supply");
assert.equal(legacyA, "NORTHW-ORG-COT-TEE-RY63");
assert.notEqual(legacyA, legacyB);

console.log("copy-identity-check ok");
