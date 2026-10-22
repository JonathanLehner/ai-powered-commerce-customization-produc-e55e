// Self-check for the picture on each Catalog card: npm run catalog-cover-check
import assert from "node:assert/strict";
import { catalogCover } from "../src/lib/catalog-cover.ts";

const variant = (colour, enabled = true) => ({ colour, colourHex: "#000000", enabled });
const mockup = (url, approved, colour = "White", view = "front") => ({ url, approved, colour, view });
const catalog = {
  variants: [variant("White"), variant("Navy")],
  mockups: [
    { view: "back", colour: "White", url: "white-back" },
    { view: "front", colour: "White", url: "white-front" },
    { view: "front", colour: "Navy", url: "navy-front" },
  ],
};
const product = (over = {}) => ({ name: "Team tee", description: "", mockups: [], variants: [variant("White")], ...over });

// An approved mockup is the cover.
assert.deepEqual(
  catalogCover(product({ mockups: [mockup("draft", false), mockup("approved", true)] }), catalog),
  { url: "approved", pending: false },
);

// No approved mockup: the supplier's blank, front view, in the product's colour.
assert.deepEqual(catalogCover(product(), catalog), { url: "white-front", pending: true });
assert.deepEqual(catalogCover(product({ variants: [variant("Navy")] }), catalog), { url: "navy-front", pending: true });
assert.deepEqual(
  catalogCover(product({ variants: [variant("White"), variant("Navy")], mockups: [mockup("draft", false, "Navy")] }), catalog),
  { url: "navy-front", pending: true },
);

// A colour the supplier has no photo for still gets a blank.
assert.deepEqual(catalogCover(product({ variants: [variant("Red")] }), catalog), { url: "white-front", pending: true });

// No supplier listing: an unapproved mockup, else nothing.
assert.deepEqual(catalogCover(product({ mockups: [mockup("draft", false)] }), null), { url: "draft", pending: true });
assert.equal(catalogCover(product(), null), null);
assert.equal(catalogCover(product(), { variants: [], mockups: [] }), null);

console.log("catalog-cover-check: ok");
