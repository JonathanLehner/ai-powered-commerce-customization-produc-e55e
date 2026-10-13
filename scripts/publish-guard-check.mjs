// Self-check for the storefront eligibility rule: npm run publish-guard-check
import assert from "node:assert/strict";
import { failsPreflight, hasApprovedPreviews, isLive } from "../src/lib/artwork.ts";

const art = [{ id: "art_1" }];
const approved = [{ id: "mck_1", approved: true }];
const pending = [{ id: "mck_1", approved: true }, { id: "mck_2", approved: false }];

// Artwork plus previews that are all approved: sellable.
assert.equal(hasApprovedPreviews({ artworks: art, mockups: approved }), true);

// Artwork uploaded, moved or removed clears the mockups.
assert.equal(hasApprovedPreviews({ artworks: art, mockups: [] }), false);
assert.equal(hasApprovedPreviews({ artworks: [], mockups: approved }), false);

// Regenerating resets previews to unapproved — one pending view is enough.
assert.equal(hasApprovedPreviews({ artworks: art, mockups: pending }), false);

// A record left marked published without approved previews is not live.
assert.equal(isLive({ status: "published", artworks: art, mockups: approved }), true);
assert.equal(isLive({ status: "published", artworks: art, mockups: pending }), false);
assert.equal(isLive({ status: "in_review", artworks: art, mockups: approved }), false);

// Pre-flight: a mug wrap 200 mm wide, artwork placed across 60% of it.
const area = { id: "pa_wrap", name: "Left wrap", view: "front", widthMm: 200, heightMm: 85, minDpi: 300 };
const rules = (minDpi) => ({
  formats: ["PNG", "JPG", "PDF"],
  maxFileMb: 15,
  minDpi,
  transparentBackgroundRequired: false,
  maxPixels: 25_000_000,
});
const placed = {
  id: "art_1", printAreaId: "pa_wrap", mimeType: "image/png", sizeBytes: 400 * 1024,
  pixelWidth: 1440, pixelHeight: 600, hasAlpha: true, x: 0.5, y: 0.5, scale: 0.6, rotation: 0,
};
// 1440 px over 120 mm is about 305 DPI.
const mug = { status: "published", artworks: [placed], mockups: approved };
const catalogAt = (minDpi) => ({ printAreas: [{ ...area, minDpi }], fileRequirements: rules(minDpi) });

assert.equal(failsPreflight(mug, catalogAt(300)), false);
assert.equal(isLive(mug, catalogAt(300)), true);

// The supplier raises its minimum after the product went live: it can no longer be sold.
assert.equal(failsPreflight(mug, catalogAt(320)), true);
assert.equal(isLive(mug, catalogAt(320)), false);
// Without the listing to hand, only the preview rule applies.
assert.equal(isLive(mug), true);
// Artwork in an area the listing no longer has, or no listing at all, is not a pre-flight failure.
assert.equal(failsPreflight({ artworks: [{ ...placed, printAreaId: "pa_gone" }] }, catalogAt(320)), false);
assert.equal(failsPreflight(mug, null), false);

console.log("publish-guard-check ok");
