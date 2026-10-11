/**
 * Copies every collection from the ClawCorp platform database API into the
 * app's own MongoDB, keeping each document's `id` and its original `_id`.
 *
 * The platform API returns at most 100 documents from a `find` (50 for some
 * collections) and applies neither sort nor skip, and it does not match on
 * `_id`. So a collection is paged by excluding the `id`s already copied
 * (`{ id: { $nin: [...] } }`) until a read comes back empty, and the result is
 * checked against the API's own count.
 *
 * Writes are upserts keyed on `id`, so re-running it brings the target up to
 * date with the source rather than duplicating anything. It never deletes.
 *
 * Run (production — .env.local points MONGODB_DB at the development database):
 *   MONGODB_DB=parcelith node --env-file=.env.local --experimental-strip-types scripts/migrate-to-mongodb.mjs
 */
import { ObjectId } from "mongodb";
import { ensureIndexes } from "../src/lib/db-indexes.ts";
import { openDatabase } from "./mongo.mjs";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const BASE = "https://www.clawcorp.ai/api/platform";

/** Every collection the app reads or writes (`COLLECTIONS` in src/lib/data.ts). */
const COLLECTIONS = [
  "agencies",
  "users",
  "stores",
  "memberships",
  "suppliers",
  "catalog_products",
  "store_products",
  "tax_brackets",
  "orders",
  "storefronts",
  "audit_logs",
  "ai_suggestions",
  "carts",
  "gift_catalogues",
  "gift_campaigns",
  "plan_enquiries",
  "quote_requests",
  "discount_codes",
];

async function source(body) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).result;
    if (attempt === 4) throw new Error(`${body.action} ${body.collection}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}

async function readAll(collection) {
  const missingId = await source({ collection, action: "countDocuments", filter: { id: { $exists: false } } });
  if (missingId > 0) throw new Error(`${collection}: ${missingId} document(s) without an id cannot be paged`);
  const rows = [];
  const seen = [];
  for (;;) {
    const filter = seen.length > 0 ? { id: { $nin: seen } } : {};
    const page = await source({ collection, action: "find", filter });
    if (!Array.isArray(page) || page.length === 0) break;
    for (const row of page) {
      rows.push(row);
      seen.push(row.id);
    }
  }
  return rows;
}

/** The API hands `_id` back as a hex string; it goes in as the ObjectId it was. */
function withObjectId(doc) {
  const { _id, ...rest } = doc;
  return typeof _id === "string" && ObjectId.isValid(_id) ? { _id: new ObjectId(_id), ...rest } : rest;
}

const { client, db } = await openDatabase();
const report = [];
let problems = 0;

for (const collection of COLLECTIONS) {
  const sourceCount = await source({ collection, action: "countDocuments", filter: {} });
  const target = db.collection(collection);
  const before = await target.countDocuments();
  const rows = await readAll(collection);
  if (rows.length !== sourceCount) {
    problems += 1;
    console.error(`${collection}: read ${rows.length} of ${sourceCount} documents`);
  }
  if (rows.length > 0) {
    await target.bulkWrite(
      rows.map((row) => ({ replaceOne: { filter: { id: row.id }, replacement: withObjectId(row), upsert: true } })),
      { ordered: false },
    );
  }
  const after = await target.countDocuments();
  report.push({ collection, source: sourceCount, read: rows.length, before, after });
  console.log(`${collection}: source ${sourceCount}, read ${rows.length}, target ${before} -> ${after}`);
}

const { created, failed } = await ensureIndexes(db);
console.log(`${created.length} indexes in place`);
for (const failure of failed) console.error(`index failed: ${failure}`);

console.table(report);
await client.close();
process.exit(problems > 0 || failed.length > 0 ? 1 : 0);
