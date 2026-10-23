/**
 * Rewrites seeded and system-written copy stored before the copy stopped using
 * em and en dashes: supplier notes and summaries, activity log entries, order
 * timeline notes and fulfilment messages, and catalog quote notes. Each rule
 * turns the old line into exactly what the current seeds and code write, so an
 * old entry reads like a new one.
 *
 * Only lines matching a known pattern are touched. Text a person typed (a refund
 * reason, storefront content) is kept as written, and anything with a dash left
 * over is listed at the end rather than guessed at.
 *
 * Safe to run more than once. Without --apply it only reports what it would do.
 *
 * Run: node --env-file=.env.local scripts/backfill-dash-free-copy.mjs [--apply]
 *      (MONGODB_DB unset targets production)
 */
import { openDatabase } from "./mongo.mjs";

const apply = process.argv.includes("--apply");
const { client, db } = await openDatabase();
const DASH = /[–—]/;

const SUPPLIER_TEXT = [
  [
    "Best choice when a store sells worldwide — local production avoids cross-border duties.",
    "Best choice when a store sells worldwide. Local production avoids cross-border duties.",
  ],
  [
    "No cancellation API — cancellations must be raised with the assigned print provider by email.",
    "No cancellation API. Cancellations must be raised with the assigned print provider by email.",
  ],
  [
    "Pending platform approval — sample quality assessment in progress. Not selectable by stores until approved.",
    "Pending platform approval: sample quality assessment in progress. Not selectable by stores until approved.",
  ],
  [
    "Sourcing and RFQ marketplace for bulk manufacturing. Used for discovery, supplier comparison and quote requests only — transaction APIs differ per supplier, so orders are raised manually under Trade Assurance.",
    "Sourcing and RFQ marketplace for bulk manufacturing. Used for discovery, supplier comparison and quote requests only. Transaction APIs differ per supplier, so orders are raised manually under Trade Assurance.",
  ],
];

/** Old activity summaries, mapped onto the wording the code records today. */
const AUDIT_SUMMARY = [
  [/^(Archived store “.+”) — its storefront is now offline$/, "$1"],
  [/^(.+ submitted gift campaign CMP-\d+ “.+”) — (\d+ recipients)$/, "$1 with $2"],
  [/^(Gift campaign CMP-\d+ paid) — (.+)$/, "$1: $2"],
  [/^(ORD-\d+: Rerouted from .+? to .+?) — (.+?)\.?$/, "$1: $2"],
  [/^((?:Cancelled and refunded|Refunded) .+? on ORD-\d+) — (.+)$/, "$1: $2"],
  [/^Updated branding — (.+)$/, "Updated branding: $1"],
  [/^No email provider configured — the (.+)$/, "No email provider configured. The $1"],
  [/^(Created discount code \S+) — (.+)$/, "$1: $2"],
];

/** Old email subjects kept on `email.logged` entries, in today's subject lines. */
const AUDIT_SUBJECT = [
  [/^Order (ORD-\d+) is confirmed — (.+)$/, "Your $2 order $1 is confirmed"],
  [/^Order (ORD-\d+) is on its way — (.+)$/, "Your $2 order $1 has shipped"],
];

const ORDER_TEXT = [
  [/^(Part of gift campaign CMP-\d+) — one (payment covered all \d+ recipients\.)$/, "$1. One $2"],
  [/(Production job accepted by .+ \(\d+)–(\d+ day lead time\)\.)/, "$1-$2"],
  [/^(\S+ refunded(?: \(\S+\))?) — /, "$1: "],
  [/^(Rerouted from .+? to .+?) — /, "$1: "],
];

const QUOTE_NOTES = [[/ — colour matching/, ". Colour matching"]];

function rewrite(value, rules) {
  if (typeof value !== "string" || !DASH.test(value)) return value;
  let next = value;
  for (const [from, to] of rules) {
    if (typeof from === "string") next = next === from ? to : next;
    else next = next.replace(from, to);
  }
  return next;
}

const leftovers = [];
let changed = 0;

async function update(collection, doc, set, label) {
  const keys = Object.keys(set);
  if (keys.length === 0) return;
  changed++;
  for (const key of keys) console.log(`${collection} ${label}: ${key}\n  ${JSON.stringify(set[key]).slice(0, 220)}`);
  if (apply) await db.collection(collection).updateOne({ _id: doc._id }, { $set: set });
}

function noteLeftover(collection, label, value) {
  if (typeof value === "string" && DASH.test(value)) leftovers.push(`${collection} ${label}: ${value.slice(0, 160)}`);
}

for (const doc of await db.collection("suppliers").find({ $or: [{ notes: DASH }, { summary: DASH }] }).toArray()) {
  const set = {};
  for (const field of ["notes", "summary"]) {
    const next = rewrite(doc[field], SUPPLIER_TEXT);
    if (next !== doc[field]) set[field] = next;
    noteLeftover("suppliers", `${doc.id}.${field}`, next);
  }
  await update("suppliers", doc, set, doc.id);
}

for (const doc of await db.collection("audit_logs").find({ $or: [{ summary: DASH }, { "meta.subject": DASH }] }).toArray()) {
  const set = {};
  const summary = rewrite(doc.summary, AUDIT_SUMMARY);
  if (summary !== doc.summary) set.summary = summary;
  noteLeftover("audit_logs", `${doc.id}.summary`, summary);
  if (doc.meta?.subject) {
    const subject = rewrite(doc.meta.subject, AUDIT_SUBJECT);
    if (subject !== doc.meta.subject) set["meta.subject"] = subject;
    noteLeftover("audit_logs", `${doc.id}.meta.subject`, subject);
  }
  await update("audit_logs", doc, set, doc.id);
}

for (const doc of await db
  .collection("orders")
  .find({ $or: [{ "fulfillment.submissionMessage": DASH }, { "events.note": DASH }] })
  .toArray()) {
  const set = {};
  const message = doc.fulfillment?.submissionMessage;
  const nextMessage = rewrite(message, ORDER_TEXT);
  if (nextMessage !== message) set["fulfillment.submissionMessage"] = nextMessage;
  noteLeftover("orders", `${doc.code}.fulfillment.submissionMessage`, nextMessage);
  const events = (doc.events ?? []).map((event) => ({ ...event, note: rewrite(event.note, ORDER_TEXT) }));
  if (events.some((event, i) => event.note !== doc.events[i].note)) set.events = events;
  events.forEach((event) => noteLeftover("orders", `${doc.code}.events.note`, event.note));
  await update("orders", doc, set, doc.code);
}

for (const doc of await db.collection("catalog_products").find({ "bulkSourcing.quoteNotes": DASH }).toArray()) {
  const notes = rewrite(doc.bulkSourcing.quoteNotes, QUOTE_NOTES);
  noteLeftover("catalog_products", `${doc.id}.bulkSourcing.quoteNotes`, notes);
  await update("catalog_products", doc, notes === doc.bulkSourcing.quoteNotes ? {} : { "bulkSourcing.quoteNotes": notes }, doc.id);
}

console.log(`\n${changed} record(s) ${apply ? "updated" : "would be updated (dry run, pass --apply)"}`);
if (leftovers.length) console.log(`left as written:\n  ${leftovers.join("\n  ")}`);
await client.close();
