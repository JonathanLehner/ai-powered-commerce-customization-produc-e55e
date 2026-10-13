// Self-check for the platform Overview store table: npm run store-list-check
import assert from "node:assert/strict";
import { filterStoreList, parseStoreListFilters, storeListQuery } from "../src/lib/store-list.ts";

const agencies = { a1: "Northlight", a2: "Harbour & Co" };
const name = (id) => agencies[id];
// Newest first, as the store list is read: archived QA stores ahead of the live ones.
const stores = [
  { name: "QA Harness Store 1008075625 Renamed", clientName: "QA", status: "archived", agencyId: "a1" },
  { name: "QA Harness Store 1008075624", clientName: "QA", status: "archived", agencyId: "a1" },
  { name: "Brew Supply", clientName: "Brew Ltd", status: "active", agencyId: "a1" },
  { name: "Old Merch", clientName: "Harbour", status: "archived", agencyId: "a2" },
  { name: "Team Gifts", clientName: "Acme", status: "active", agencyId: "a2" },
];

// Defaults: live stores only.
const plain = parseStoreListFilters({});
assert.deepEqual(plain, { status: "active", q: "" });
assert.equal(parseStoreListFilters({ status: "bogus" }).status, "active");
assert.equal(parseStoreListFilters({ status: ["archived"], q: "  north " }).q, "north");

const view = filterStoreList(stores, plain, name);
assert.deepEqual(view.rows.map((s) => s.name), ["Brew Supply", "Team Gifts"]);
assert.deepEqual(view.counts, { active: 2, archived: 3, all: 5 });

// All: live stores first, newest first within each status.
const all = filterStoreList(stores, { status: "all", q: "" }, name);
assert.deepEqual(all.rows.map((s) => s.status), ["active", "active", "archived", "archived", "archived"]);
assert.equal(all.rows[2].name, "QA Harness Store 1008075625 Renamed");

// Archived stays one click away.
assert.equal(filterStoreList(stores, { status: "archived", q: "" }, name).rows.length, 3);

// Search by agency name or store name, case-insensitive; counts follow the search.
const byAgency = filterStoreList(stores, { status: "active", q: "HARBOUR" }, name);
assert.deepEqual(byAgency.rows.map((s) => s.name), ["Team Gifts"]);
assert.deepEqual(byAgency.counts, { active: 1, archived: 1, all: 2 });
assert.equal(filterStoreList(stores, { status: "all", q: "qa harness" }, name).counts.archived, 2);
assert.equal(filterStoreList(stores, { status: "all", q: "nothing" }, name).rows.length, 0);

// URLs leave the defaults out.
assert.equal(storeListQuery(plain), "");
assert.equal(storeListQuery(plain, { status: "archived" }), "?status=archived");
assert.equal(storeListQuery({ status: "all", q: "north light" }, { q: "" }), "?status=all");
assert.equal(storeListQuery({ status: "active", q: "north" }), "?q=north");

console.log("store-list-check ok");
