// Self-check for basket, checkout and order thumbnails: npm run line-preview-check
import assert from "node:assert/strict";
import VARIANTS from "./image-variants.json" with { type: "json" };
import { personalisationTextColour, thumbnailSource, variantPhoto } from "../src/lib/line-preview.ts";

const product = {
  variants: [
    { id: "var_white_m", colour: "White" },
    { id: "var_black_m", colour: "Black" },
    { id: "var_sand_m", colour: "Sand" },
  ],
  mockups: [
    { url: "https://assets.example/white-front.jpg", view: "front", colour: "White" },
    { url: "https://assets.example/black-back.jpg", view: "back", colour: "Black" },
    { url: "https://assets.example/black-front.jpg", view: "front", colour: "Black" },
  ],
};

// The thumbnail shows the colour the shopper chose, not the first photo.
assert.equal(variantPhoto(product, "var_black_m"), "https://assets.example/black-back.jpg");
// The print area's view wins when the colour was shot from more than one side.
assert.equal(variantPhoto(product, "var_black_m", "front"), "https://assets.example/black-front.jpg");
// A colour with no photography of its own falls back to the lot.
assert.equal(variantPhoto(product, "var_sand_m"), "https://assets.example/white-front.jpg");
assert.equal(variantPhoto(null, "var_black_m"), null);

// Text reads dark on a white garment and light on anything else, as in the composite.
assert.equal(personalisationTextColour("#ffffff"), "#111827");
assert.equal(personalisationTextColour("#111111"), "#f8fafc");

// Catalogue photography uses its small prebuilt variant; a shopper's own preview is left alone.
const [original, sizes] = Object.entries(VARIANTS)[0];
assert.equal(thumbnailSource(original), sizes["256"]);
assert.equal(thumbnailSource("https://assets.example/preview.webp"), "https://assets.example/preview.webp");

console.log("line-preview-check: ok");
