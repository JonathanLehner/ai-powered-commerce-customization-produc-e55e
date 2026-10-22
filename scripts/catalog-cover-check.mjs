// Self-check for the catalog card's picture: npm run catalog-cover-check
import assert from "node:assert/strict";
import { catalogCover } from "../src/lib/catalog-cover.ts";

const variant = (colour, enabled = true) => ({ colour, colourHex: "#000000", enabled });
const catalog = {
  variants: [variant("White"), variant("Navy")],
  mockups: [
    { view: "back", colour: "White", url: "white-back" },
    { view: "front", colour: "White", url: "white-front" },
    { view: "front", colour: "Navy", url: "navy-front" },
  ],
};
const product = (over = {}) => ({ name: "Hoodie", description: "", mockups: [], variants: [variant("White")], ...over });
const mockup = (over) => ({ view: "front", colour: "White", url: "m", approved: false, ...over });

// An approved mockup is the cover, front view first.
assert.deepEqual(
  catalogCover(
    product({ mockups: [mockup({ view: "back", url: "a-back", approved: true }), mockup({ url: "a-front", approved: true })] }),
    catalog,
  ),
  { url: "a-front", colour: "White", pending: false },
);

// No mockup yet: the blank front photo in the colour the product sells.
assert.deepEqual(catalogCover(product({ variants: [variant("Navy")] }), catalog), {
  url: "navy-front",
  colour: "Navy",
  pending: true,
});

// Mockups generated but none approved still show the blank, in their colour.
assert.deepEqual(catalogCover(product({ variants: [], mockups: [mockup({ colour: "Navy" })] }), catalog), {
  url: "navy-front",
  colour: "Navy",
  pending: true,
});

// A colour the supplier has no photo of falls back to their front photo.
assert.equal(catalogCover(product({ variants: [variant("Red")] }), catalog).url, "white-front");

// No catalog listing or no photos: nothing to show.
assert.equal(catalogCover(product(), null), null);
assert.equal(catalogCover(product(), { variants: [], mockups: [] }), null);

console.log("catalog-cover-check: ok");
