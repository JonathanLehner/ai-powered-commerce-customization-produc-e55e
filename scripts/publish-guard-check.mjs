// Self-check for the storefront eligibility rule: npm run publish-guard-check
import assert from "node:assert/strict";
import { hasApprovedPreviews, isLive } from "../src/lib/artwork.ts";

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

console.log("publish-guard-check ok");
