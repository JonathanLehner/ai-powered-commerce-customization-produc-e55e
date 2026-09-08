// Self-check for reading the audit trail: npm run audit-check
//
// The Activity page and the platform log are the record of who changed what, so
// what a filter says it shows, what the list pages through and what the download
// contains all have to be the same set of entries.
import assert from "node:assert/strict";
import {
  auditActors,
  auditCsv,
  auditDetail,
  auditFileName,
  auditMonthBuckets,
  auditQuery,
  auditRange,
  auditRunSummary,
  auditWindow,
  collapseAuditRuns,
  hasAuditFilters,
  matchesAuditFilters,
  pageAuditEntries,
  parseAuditFilters,
  recentAuditReadSize,
  recentAuditRuns,
  sortAuditEntries,
  AUDIT_PAGE_SIZE,
} from "../src/lib/audit-log.ts";
import { PLANS, auditExportMessage, planAuditLabel } from "../src/lib/plans.ts";

let counter = 0;
function entry(overrides = {}) {
  counter += 1;
  return {
    id: `aud_${String(counter).padStart(4, "0")}`,
    category: "publishing",
    action: "product.mockups_approved",
    summary: "Approved 2 mockups for “Northwind Field Tee”",
    storeId: "str_northwind",
    agencyId: "agc_northlight",
    actorId: "usr_alex",
    actorName: "Alex Moreau",
    entity: "store_product",
    entityId: "northwind-field-tee",
    meta: {},
    at: "2026-08-02T17:25:07.877Z",
    ...overrides,
  };
}

/* ----------------------------------------------------------- reading a URL */

const empty = parseAuditFilters({});
assert.deepEqual(empty, { category: null, actorId: null, from: null, to: null, q: "", page: 1 });
assert.equal(hasAuditFilters(empty), false);

const parsed = parseAuditFilters({
  category: "pricing",
  actor: " usr_sam ",
  from: "2026-07-01",
  to: "2026-07-31",
  q: "  hoodie ",
  page: "3",
});
assert.deepEqual(parsed, {
  category: "pricing",
  actorId: "usr_sam",
  from: "2026-07-01",
  to: "2026-07-31",
  q: "hoodie",
  page: 3,
});
assert.equal(hasAuditFilters(parsed), true);

// Anything the pages cannot honour is dropped rather than passed to the database.
assert.equal(parseAuditFilters({ category: "not_a_category" }).category, null);
assert.equal(parseAuditFilters({ from: "01/07/2026" }).from, null);
assert.equal(parseAuditFilters({ from: "2026-02-31" }).from, null, "a day that does not exist");
assert.equal(parseAuditFilters({ page: "0" }).page, 1);
assert.equal(parseAuditFilters({ page: "-4" }).page, 1);
assert.equal(parseAuditFilters({ page: "nonsense" }).page, 1);
assert.equal(parseAuditFilters({ page: ["2"] }).page, 2, "a repeated parameter reads as its first value");

// A range typed the wrong way round reads as the span between the two days.
const reversed = parseAuditFilters({ from: "2026-08-01", to: "2026-05-01" });
assert.deepEqual([reversed.from, reversed.to], ["2026-05-01", "2026-08-01"]);

/* ------------------------------------------------------- what a range means */

assert.deepEqual(auditRange(parseAuditFilters({ from: "2026-07-01", to: "2026-07-31" })), {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
});
assert.deepEqual(auditRange(empty), { from: null, to: null });

// The last day of the range is included: an entry at 23:59 on the "to" day is in.
const lastMoment = entry({ at: "2026-07-31T23:59:59.999Z" });
const july = parseAuditFilters({ from: "2026-07-01", to: "2026-07-31" });
assert.equal(matchesAuditFilters(lastMoment, july), true);
assert.equal(matchesAuditFilters(entry({ at: "2026-08-01T00:00:00.000Z" }), july), false);
assert.equal(matchesAuditFilters(entry({ at: "2026-06-30T23:59:59.999Z" }), july), false);

/* ------------------------------------------------------------ the filtering */

const sam = entry({ actorId: "usr_sam", actorName: "Sam Okafor", category: "pricing", action: "product.price_changed", summary: "Raised “Northwind Ridge Hoodie” from $59.00 to $64.00", meta: { from: 5900, to: 6400 } });
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ actor: "usr_sam" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ actor: "usr_alex" })), false);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ category: "pricing" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ category: "gifting" })), false);

// The search reads the whole entry, not only its summary, and every word counts.
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "hoodie" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "HOODIE" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "price_changed" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "sam okafor" })), true);
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "hoodie mug" })), false, "both words have to appear");
assert.equal(matchesAuditFilters(sam, parseAuditFilters({ q: "5900" })), true, "the detail line is searchable");

/* --------------------------------------------------------------- the order */

const shuffled = [
  entry({ at: "2026-06-01T08:00:00.000Z" }),
  entry({ at: "2026-08-02T17:25:07.877Z" }),
  entry({ at: "2026-07-04T12:00:00.000Z" }),
];
assert.deepEqual(
  sortAuditEntries(shuffled).map((e) => e.at),
  ["2026-08-02T17:25:07.877Z", "2026-07-04T12:00:00.000Z", "2026-06-01T08:00:00.000Z"],
);
// Two entries written in the same millisecond still come out in a fixed order.
const tied = [entry({ id: "aud_a", at: "2026-08-01T00:00:00.000Z" }), entry({ id: "aud_b", at: "2026-08-01T00:00:00.000Z" })];
assert.deepEqual(sortAuditEntries(tied).map((e) => e.id), ["aud_b", "aud_a"]);
assert.deepEqual(sortAuditEntries([...tied].reverse()).map((e) => e.id), ["aud_b", "aud_a"]);

/* ------------------------------------------------------------------ paging */

const many = Array.from({ length: 132 }, (_, i) =>
  entry({ at: new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString() }),
);
const first = pageAuditEntries(many, 1);
assert.equal(first.entries.length, AUDIT_PAGE_SIZE);
assert.deepEqual([first.page, first.pages, first.total, first.first, first.last], [1, 6, 132, 1, 25]);

const last = pageAuditEntries(many, 6);
assert.equal(last.entries.length, 7);
assert.deepEqual([last.first, last.last], [126, 132]);

// A page number past the end lands on the last page rather than on nothing.
assert.equal(pageAuditEntries(many, 99).page, 6);
assert.equal(pageAuditEntries(many, 99).entries.length, 7);

const none = pageAuditEntries([], 1);
assert.deepEqual([none.total, none.pages, none.first, none.last, none.entries.length], [0, 1, 0, 0, 0]);

// Every entry is reachable exactly once by walking the pages.
const walked = [];
for (let p = 1; p <= first.pages; p++) walked.push(...pageAuditEntries(many, p).entries.map((e) => e.id));
assert.equal(walked.length, many.length);
assert.equal(new Set(walked).size, many.length);

/* --------------------------------------------------- the repeated approvals */

// The complaint this was built for: eight identical approvals in a row at the
// top of Northwind's "Recent activity", hiding everything else in the panel.
const run = [
  ...Array.from({ length: 8 }, (_, i) => entry({ at: new Date(Date.UTC(2026, 7, 2, 17, 25 + i)).toISOString() })),
  entry({ action: "product.updated", summary: "Updated product details for “Northwind Organic Tee”", at: "2026-08-02T17:15:34.470Z" }),
];
const collapsed = collapseAuditRuns(sortAuditEntries(run));
assert.equal(collapsed.length, 2, "the run is one row, the other change is its own");
assert.equal(collapsed[0].count, 8);
assert.equal(collapsed[0].earliest, "2026-08-02T17:25:00.000Z");
assert.equal(collapsed[0].latest, "2026-08-02T17:32:00.000Z");
assert.equal(collapsed[1].count, 1);

// The row the summary panels draw carries the count in its own wording.
assert.equal(
  auditRunSummary(collapsed[0]),
  "Approved 2 mockups for “Northwind Field Tee” — 8 times",
);
assert.equal(auditRunSummary(collapsed[1]), "Updated product details for “Northwind Organic Tee”");

// Collapsing is what a summary draws, never what the history counts: the
// Activity page's paging and the download still see all nine records.
assert.equal(pageAuditEntries(run, 1).total, 9);

// Only neighbours with the same wording, action, category and person collapse.
const mixed = sortAuditEntries([
  entry({ at: "2026-08-02T10:00:00.000Z" }),
  entry({ at: "2026-08-02T09:00:00.000Z", actorId: "usr_sam", actorName: "Sam Okafor" }),
  entry({ at: "2026-08-02T08:00:00.000Z" }),
]);
assert.deepEqual(collapseAuditRuns(mixed).map((r) => r.count), [1, 1, 1]);

// A run that spans midnight is two rows, so a row's count never covers a day
// other than the one it is dated.
const overnight = sortAuditEntries([
  entry({ at: "2026-08-03T00:12:00.000Z" }),
  entry({ at: "2026-08-02T23:47:00.000Z" }),
  entry({ at: "2026-08-02T23:41:00.000Z" }),
]);
assert.deepEqual(collapseAuditRuns(overnight).map((r) => r.count), [1, 2]);

/* -------------------------------------------- what a "Recent activity" panel shows */

// Eight repeats plus twelve distinct changes fill a panel with twelve rows,
// rather than leaving one collapsed line and eleven repeats of it.
const feed = [
  ...Array.from({ length: 8 }, (_, i) => entry({ at: new Date(Date.UTC(2026, 7, 2, 17, 25 + i)).toISOString() })),
  ...Array.from({ length: 12 }, (_, i) =>
    entry({ action: `store.step_${i}`, summary: `Change number ${i}`, at: new Date(Date.UTC(2026, 7, 1, 9, i)).toISOString() }),
  ),
];
assert.ok(recentAuditReadSize(12) >= feed.length, "the panel reads more history than it draws");
const panel = recentAuditRuns(feed, 12);
assert.equal(panel.length, 12);
assert.equal(panel[0].count, 8, "the repeats are the single newest row");
assert.ok(panel.slice(1).every((r) => r.count === 1));

// Asking for fewer rows than there are runs cuts the list, keeping the newest.
assert.deepEqual(recentAuditRuns(feed, 3).map((r) => r.entry.summary), [
  "Approved 2 mockups for “Northwind Field Tee”",
  "Change number 11",
  "Change number 10",
]);
assert.deepEqual(recentAuditRuns([], 8), []);

/* ------------------------------------------------------- the people to offer */

const people = auditActors([
  entry({ actorId: "usr_sam", actorName: "Sam Okafor" }),
  entry({ actorId: "usr_alex", actorName: "Alex Moreau" }),
  entry({ actorId: "usr_sam", actorName: "Sam Okafor" }),
  entry({ actorId: "system", actorName: "Parcelith routing" }),
]);
assert.deepEqual(people, [
  { id: "usr_alex", name: "Alex Moreau" },
  { id: "system", name: "Parcelith routing" },
  { id: "usr_sam", name: "Sam Okafor" },
]);
// A person filtered down to nothing stays in the dropdown, or the control would
// show "Anyone" while filtering by someone.
assert.deepEqual(auditActors([], "usr_dana"), [{ id: "usr_dana", name: "usr_dana" }]);

/* ---------------------------------------------------------- links and pages */

assert.equal(auditQuery(empty), "");
assert.equal(
  auditQuery(parsed),
  "?category=pricing&actor=usr_sam&from=2026-07-01&to=2026-07-31&q=hoodie&page=3",
);
// Changing the category starts again at the first page, keeping the rest.
assert.equal(
  auditQuery(parsed, { category: "gifting", page: 1 }),
  "?category=gifting&actor=usr_sam&from=2026-07-01&to=2026-07-31&q=hoodie",
);
assert.equal(auditQuery(parseAuditFilters({ q: "a b" })), "?q=a+b");

/* ------------------------------------------------- the window that is read */

// Without dates the window covers everything from before the store existed up
// to a moment past now, so an entry written this second is never outside it.
const wide = auditWindow(empty, "2026-04-23T07:48:08.535Z", "2026-08-05T12:00:00.000Z");
assert.ok(wide.from < "2026-04-23T07:48:08.535Z");
assert.ok(wide.to > "2026-08-05T12:00:00.000Z");
// Nothing was asked for at the start, so what is older than the window is still
// part of the history — a platform change made before the oldest store existed.
assert.equal(wide.openStart, true);

const narrow = auditWindow(july, "2026-04-23T07:48:08.535Z", "2026-08-05T12:00:00.000Z");
assert.deepEqual(narrow, {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
  openStart: false,
});
assert.equal(auditWindow(parseAuditFilters({ to: "2026-07-31" }), "2026-04-23T07:48:08.535Z", "2026-08-05T12:00:00.000Z").openStart, true);

/* ----------------------------------------------------------- month buckets */

// The platform API caps a read and applies no sort, so history is read one month
// at a time from the newest end. The buckets have to cover the window exactly:
// newest first, no gaps, no overlaps, nothing outside it.
const buckets = auditMonthBuckets("2026-04-23T07:48:08.535Z", "2026-08-05T12:00:00.000Z");
assert.ok(buckets.length >= 4);
assert.equal(buckets[0].to, "2026-08-05T12:00:00.000Z");
assert.equal(buckets[buckets.length - 1].from, "2026-04-23T07:48:08.535Z");
for (let i = 0; i < buckets.length; i++) {
  assert.ok(buckets[i].from < buckets[i].to, "a bucket covers time");
  if (i > 0) assert.equal(buckets[i].to, buckets[i - 1].from, "buckets meet exactly");
}

// A window that is already inside one month is one bucket.
assert.deepEqual(auditMonthBuckets("2026-07-02T00:00:00.000Z", "2026-07-09T00:00:00.000Z"), [
  { from: "2026-07-02T00:00:00.000Z", to: "2026-07-09T00:00:00.000Z" },
]);
// A window ending exactly on a month boundary does not produce an empty bucket.
const boundary = auditMonthBuckets("2026-06-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
assert.deepEqual(boundary, [
  { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" },
  { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
]);
assert.deepEqual(auditMonthBuckets("2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"), []);
// Years are crossed the same way, and the walk is always bounded.
assert.equal(auditMonthBuckets("2025-11-15T00:00:00.000Z", "2026-01-10T00:00:00.000Z").length, 3);
assert.ok(auditMonthBuckets("1990-01-01T00:00:00.000Z", "2026-08-05T00:00:00.000Z").length <= 120);

/* ------------------------------------------------------------ the download */

assert.equal(auditDetail(sam), "from: 5900 · to: 6400");
assert.equal(auditDetail(entry()), "");

const csv = auditCsv([sam]);
assert.ok(csv.startsWith("﻿"), "Excel needs the byte-order mark to read UTF-8");
const lines = csv.trimEnd().split("\r\n");
assert.equal(lines[0], "﻿Timestamp (UTC),Person,Category,Action,Summary,Detail");
assert.deepEqual(lines[1].split(",").slice(0, 4), [
  "2026-08-02T17:25:07.877Z",
  "Sam Okafor",
  "Pricing",
  "product.price_changed",
]);
assert.ok(lines[1].includes("Raised “Northwind Ridge Hoodie” from $59.00 to $64.00"));
assert.ok(lines[1].endsWith("from: 5900 · to: 6400"));

// Commas, quotes and newlines in a summary stay inside one cell.
const awkward = auditCsv([entry({ summary: 'Renamed to "Field Tee, v2"\nafter review', meta: {} })]);
assert.ok(awkward.includes('"Renamed to ""Field Tee, v2""\nafter review"'));
// A summary a spreadsheet would run as a formula is written as text.
assert.ok(auditCsv([entry({ summary: "=1+1" })]).includes("'=1+1"));

// The platform-wide download says which store each entry belongs to.
const platform = auditCsv([sam, entry({ storeId: null, category: "administration", summary: "Suspended agency access" })], {
  storeName: (id) => (id ? "Northwind Supply Co" : "Platform"),
});
const platformLines = platform.trimEnd().split("\r\n");
assert.equal(platformLines[0], "﻿Timestamp (UTC),Store,Person,Category,Action,Summary,Detail");
assert.ok(platformLines[1].includes("Northwind Supply Co"));
assert.ok(platformLines[2].includes("Platform"));

// An empty result is still a valid spreadsheet — a header and nothing under it.
assert.equal(auditCsv([]).trimEnd().split("\r\n").length, 1);

assert.equal(
  auditFileName("Northwind Supply Co activity", empty, "2026-08-05"),
  "northwind-supply-co-activity-2026-08-05.csv",
);
assert.equal(
  auditFileName("Northwind Supply Co activity", july, "2026-08-05"),
  "northwind-supply-co-activity-2026-07-01-to-2026-07-31.csv",
);
assert.equal(
  auditFileName("Parcelith audit log", parseAuditFilters({ to: "2026-07-31" }), "2026-08-05"),
  "parcelith-audit-log-start-to-2026-07-31.csv",
);
assert.ok(!/[^a-z0-9.\-]/.test(auditFileName("Ferro Coffee Club · Activity/2", empty, "2026-08-05")));

/* ---------------------------------------------------- what the plans include */

// The pricing page sells the download on Studio, so Studio is where the
// workspace hands it over. The two read the same table.
assert.equal(PLANS.starter.auditExport, false);
assert.equal(PLANS.studio.auditExport, true);
assert.equal(PLANS.scale.auditExport, true);
assert.equal(planAuditLabel(PLANS.studio), "Full audit history export");
assert.notEqual(planAuditLabel(PLANS.starter), planAuditLabel(PLANS.studio));
assert.match(auditExportMessage(PLANS.starter, "Cobalt & Co"), /Cobalt & Co is on the Starter plan/);
assert.match(auditExportMessage(PLANS.starter, "Cobalt & Co"), /Studio/);

console.log("audit-check ok");
