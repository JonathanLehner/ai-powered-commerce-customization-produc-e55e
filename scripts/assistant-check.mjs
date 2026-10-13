// Self-check for grouping pending assistant suggestions: npm run assistant-check
import assert from "node:assert/strict";
import { groupPendingSuggestions, supersededIds } from "../src/lib/suggestions.ts";

let n = 0;
const make = (kind, productId, minute, extra = {}) => ({
  id: `sug_${++n}`,
  storeId: "st_1",
  productId,
  kind,
  title: kind,
  rationale: "",
  payload: {},
  status: "pending",
  createdBy: "Alex Moreau",
  createdAt: `2026-10-13T09:${String(minute).padStart(2, "0")}:00.000Z`,
  decidedBy: null,
  decidedAt: null,
  ...extra,
});

// Twelve rounds of copy for one product: one current description and one
// current set of tags, the other twenty-two superseded.
const tee = [];
for (let i = 0; i < 12; i++) tee.push(make("description", "sp_tee", i), make("tags", "sp_tee", i));
const price = make("price", "sp_mug", 30);
const ideas = [make("product_idea", null, 40), make("product_idea", null, 40), make("product_idea", null, 40)];
const supplier = [make("supplier", null, 41), make("supplier", null, 42)];
const groups = groupPendingSuggestions([...tee, price, ...ideas, ...supplier]);

const byKey = new Map(groups.map((g) => [g.key, g]));
assert.equal(groups.length, 4, "one group per product, plus ideas and supplier recommendations");
assert.deepEqual(groups.map((g) => g.key), ["supplier", "product_idea", "sp_mug", "sp_tee"], "newest group first");

const teeGroup = byKey.get("sp_tee");
assert.equal(teeGroup.current.length, 2);
assert.deepEqual(teeGroup.current.map((e) => e.suggestion.createdAt.slice(11, 16)), ["09:11", "09:11"], "newest of each kind stays current");
assert.equal(teeGroup.older.length, 22);
assert.ok(teeGroup.older.every((e) => e.superseded));

assert.equal(byKey.get("sp_mug").older.length, 0, "a lone suggestion is current");
assert.equal(byKey.get("product_idea").current.length, 3, "product ideas never supersede each other");
assert.equal(byKey.get("supplier").current.length, 2, "supplier recommendations never supersede each other");

// One marked superseded when its replacement arrived stays superseded even if
// the replacement has since been decided.
const marked = make("price", "sp_cap", 50, { supersededBy: "sug_gone" });
assert.deepEqual(supersededIds([marked]), [marked.id]);

// Decided suggestions are not grouped.
assert.equal(groupPendingSuggestions([make("tags", "sp_x", 1, { status: "applied" })]).length, 0);

// Dismissing older suggestions only touches the ones the caller saw.
const seen = teeGroup.older.slice(0, 5).map((e) => e.suggestion.id);
const current = teeGroup.current.map((e) => e.suggestion.id);
assert.deepEqual(supersededIds(tee, [...seen, ...current]), seen, "current suggestions are never dismissed as older");
assert.equal(supersededIds(tee).length, 22);

console.log("assistant-check: ok");
