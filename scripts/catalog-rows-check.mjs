// Self-check for the shared catalog's editable tables: npm run catalog-rows-check
import assert from "node:assert/strict";
import { FILE_REQUIREMENTS, parsePrintAreas, parseVariants } from "../src/lib/catalog-rows.ts";

const json = (rows) => JSON.stringify(rows);

const existingAreas = [
  { id: "pa_front", name: "Front chest", view: "front", widthMm: 280, heightMm: 360, minDpi: 150, rect: { x: 0.33, y: 0.29, w: 0.34, h: 0.34 } },
  { id: "pa_back", name: "Back", view: "back", widthMm: 280, heightMm: 400, minDpi: 150, rect: { x: 0.33, y: 0.27, w: 0.34, h: 0.38 } },
];

const existingVariants = [
  { id: "var_white_m", name: "White / M", colour: "White", colourHex: "#ffffff", size: "M", sku: "TEE-WHT-M", baseCost: 1090, availability: "in_stock" },
];

/* --------------------------------------------------------------- print areas */

// A product needs somewhere to print, so an empty table is refused rather than
// silently saved.
assert.ok("error" in parsePrintAreas(json([]), existingAreas));
assert.ok("error" in parsePrintAreas("not json", existingAreas));

// An edit of an existing row keeps its id and, with it, the placement the
// artwork of every store that imported the product is positioned against.
const edited = parsePrintAreas(
  json([{ id: "pa_front", name: "Front chest", view: "front", widthMm: "300", heightMm: "360", minDpi: "200" }]),
  existingAreas,
);
assert.ok(!("error" in edited));
assert.equal(edited.areas.length, 1, "the row that was removed in the browser is gone");
assert.equal(edited.areas[0].id, "pa_front");
assert.equal(edited.areas[0].widthMm, 300);
assert.equal(edited.areas[0].minDpi, 200);
assert.deepEqual(edited.areas[0].rect, existingAreas[0].rect, "the measured placement survives an edit");

// A new row is given an id here, and starts from a centred placement.
const added = parsePrintAreas(
  json([
    { id: "pa_front", name: "Front chest", view: "front", widthMm: "280", heightMm: "360", minDpi: "150" },
    { id: "", name: "Left sleeve", view: "left", widthMm: "90", heightMm: "60", minDpi: "300" },
  ]),
  existingAreas,
);
assert.ok(!("error" in added));
assert.equal(added.areas[1].id.startsWith("pa_"), true);
assert.notEqual(added.areas[1].id, "pa_front");
assert.equal(added.areas[1].view, "left");
assert.ok(added.areas[1].rect.w > 0 && added.areas[1].rect.h > 0);

// An id belonging to another product cannot be smuggled in: it is treated as new.
const forged = parsePrintAreas(
  json([{ id: "pa_someone_else", name: "Front", view: "front", widthMm: "200", heightMm: "200", minDpi: "150" }]),
  existingAreas,
);
assert.ok(!("error" in forged));
assert.notEqual(forged.areas[0].id, "pa_someone_else");

// Nonsense measurements and views are rejected with a message naming the area.
assert.ok("error" in parsePrintAreas(json([{ id: "", name: "F", view: "front", widthMm: "10", heightMm: "10", minDpi: "150" }]), []), "a name is required");
assert.ok("error" in parsePrintAreas(json([{ id: "", name: "Front", view: "sideways", widthMm: "100", heightMm: "100", minDpi: "150" }]), []));
assert.ok("error" in parsePrintAreas(json([{ id: "", name: "Front", view: "front", widthMm: "0", heightMm: "100", minDpi: "150" }]), []));
assert.ok("error" in parsePrintAreas(json([{ id: "", name: "Front", view: "front", widthMm: "100", heightMm: "100", minDpi: "12" }]), []));

/* ------------------------------------------------------------------ variants */

assert.ok("error" in parseVariants(json([]), existingVariants, "USD"));

// Costs are read in the product's currency and stored in minor units.
const variants = parseVariants(
  json([
    { id: "var_white_m", colour: "White", colourHex: "#FFFFFF", size: "M", sku: "tee-wht-m", baseCost: "11.50", availability: "low_stock" },
    { id: "", colour: "Black", colourHex: "#111111", size: "L", sku: "TEE-BLK-L", baseCost: "12", availability: "in_stock" },
  ]),
  existingVariants,
  "USD",
);
assert.ok(!("error" in variants));
assert.equal(variants.variants[0].id, "var_white_m", "an edited variant keeps its id");
assert.equal(variants.variants[0].sku, "TEE-WHT-M", "SKUs are stored uppercase");
assert.equal(variants.variants[0].baseCost, 1150);
assert.equal(variants.variants[0].availability, "low_stock");
assert.equal(variants.variants[1].name, "Black / L", "the label is built from the option values");
assert.equal(variants.variants[1].baseCost, 1200);
assert.ok(variants.variants[1].id.startsWith("var_"));

// Two rows cannot share a SKU, and a variant with neither colour nor size has
// nothing for a shopper to choose between.
assert.ok(
  "error" in
    parseVariants(
      json([
        { id: "", colour: "White", colourHex: "#ffffff", size: "M", sku: "TEE-WHT-M", baseCost: "11.50", availability: "in_stock" },
        { id: "", colour: "White", colourHex: "#ffffff", size: "L", sku: "TEE-WHT-M", baseCost: "11.50", availability: "in_stock" },
      ]),
      [],
      "USD",
    ),
);
assert.ok("error" in parseVariants(json([{ id: "", colour: "", colourHex: "#ffffff", size: "", sku: "TEE-1", baseCost: "11.50", availability: "in_stock" }]), [], "USD"));
assert.ok("error" in parseVariants(json([{ id: "", colour: "White", colourHex: "#ffffff", size: "M", sku: "", baseCost: "11.50", availability: "in_stock" }]), [], "USD"));
assert.ok("error" in parseVariants(json([{ id: "", colour: "White", colourHex: "#ffffff", size: "M", sku: "TEE-1", baseCost: "", availability: "in_stock" }]), [], "USD"));

// A swatch that is not a colour falls back rather than reaching the storefront.
const swatch = parseVariants(
  json([{ id: "", colour: "White", colourHex: "red", size: "M", sku: "TEE-2", baseCost: "9.99", availability: "in_stock" }]),
  [],
  "USD",
);
assert.ok(!("error" in swatch));
assert.equal(swatch.variants[0].colourHex, "#ffffff");

// A zero-decimal currency is read in whole units.
const yen = parseVariants(
  json([{ id: "", colour: "White", colourHex: "#ffffff", size: "M", sku: "TEE-3", baseCost: "1200", availability: "in_stock" }]),
  [],
  "JPY",
);
assert.ok(!("error" in yen));
assert.equal(yen.variants[0].baseCost, 1200);

/* -------------------------------------------------------- file requirements */

// A created product inherits the pre-flight rules of its category.
assert.equal(FILE_REQUIREMENTS.apparel.minDpi, 150);
assert.equal(FILE_REQUIREMENTS.drinkware.minDpi, 300);
assert.equal(FILE_REQUIREMENTS.apparel.transparentBackgroundRequired, true);

console.log("catalog-rows-check ok");
