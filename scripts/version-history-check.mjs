// Self-check for the storefront version history: npm run version-history-check
import assert from "node:assert/strict";
import { treeFromSections } from "../src/lib/storefront-schema.ts";
import {
  capHistory,
  diffSections,
  isUnchanged,
  liveVersionId,
  sameTree,
  summarizeSections,
} from "../src/lib/storefront-versions.ts";

const live = treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }, { type: "RichText" }]);
const ids = live.ROOT.nodes;
const clone = (tree) => JSON.parse(JSON.stringify(tree));
const base = summarizeSections(live);

// The same layout, keys in another order, is unchanged.
const reKeyed = clone(live);
reKeyed[ids[0]].props = Object.fromEntries(Object.entries(reKeyed[ids[0]].props).reverse());
assert.ok(isUnchanged(diffSections(base, summarizeSections(reKeyed))));
assert.ok(sameTree(live, reKeyed));

// An edited setting is reported as an edit of that section only.
const edited = clone(live);
edited[ids[1]].props = { ...edited[ids[1]].props, heading: "Something new" };
const editDiff = diffSections(base, summarizeSections(edited));
assert.deepEqual(editDiff.edited.map((c) => c.id), [ids[1]]);
assert.equal(editDiff.added.length + editDiff.removed.length + editDiff.moved.length, 0);

// Swapping two sections reports the one that moved, not both.
const swapped = clone(live);
swapped.ROOT.nodes = [ids[1], ids[0], ...ids.slice(2)];
const swapDiff = diffSections(base, summarizeSections(swapped));
assert.equal(swapDiff.moved.length, 1);
assert.equal(swapDiff.edited.length, 0);

// Added and removed sections.
const changed = clone(live);
changed.ROOT.nodes = ids.slice(1);
delete changed[ids[0]];
const extra = treeFromSections([{ type: "NewsletterSignup" }]);
const newId = extra.ROOT.nodes[0];
changed[newId] = extra[newId];
changed.ROOT.nodes.push(newId);
const addDiff = diffSections(base, summarizeSections(changed));
assert.deepEqual(addDiff.removed.map((c) => c.id), [ids[0]]);
assert.deepEqual(addDiff.added.map((c) => c.type), ["NewsletterSignup"]);
assert.equal(addDiff.moved.length, 0, "the sections left keep their order");

// A layout built separately lines up with the live one by section type.
const rebuilt = treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }, { type: "RichText" }]);
assert.ok(isUnchanged(diffSections(summarizeSections(rebuilt), base)));

// The history keeps ten published versions and five saved drafts.
const entry = (i, kind) => ({ id: `v${kind}${i}`, label: "", kind, data: live, savedAt: "", savedBy: "" });
const many = [
  ...Array.from({ length: 12 }, (_, i) => entry(i, "draft")),
  ...Array.from({ length: 12 }, (_, i) => entry(i, "published")),
];
const capped = capHistory(many);
assert.equal(capped.filter((v) => v.kind === "draft").length, 5);
assert.equal(capped.filter((v) => v.kind === "published").length, 10);
// Entries saved before kinds existed count as published.
assert.equal(capHistory(Array.from({ length: 12 }, (_, i) => ({ ...entry(i, "x"), kind: undefined }))).length, 10);

// Live is the newest published version matching the published layout; a saved
// draft with the same layout is not.
const history = [
  { ...entry(1, "draft"), data: live },
  { ...entry(2, "published"), data: edited },
  { ...entry(3, "published"), data: live },
];
assert.equal(liveVersionId(history, live), "vpublished3");
assert.equal(liveVersionId(history, null), null);

console.log("version-history-check ok");
