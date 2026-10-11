/**
 * Builds the customer records of every store from its orders.
 *
 * Each record is rebuilt from the store's orders and written by store and
 * email, so a second run writes the same figures over the same records and
 * creates nothing new. The team's notes are left alone. It uses the same code
 * checkout does (`src/lib/customer-data.ts`), so the two can never disagree.
 *
 * Run: npm run backfill-customers                      # MONGODB_DB from .env.local
 *      MONGODB_DB=parcelith npm run backfill-customers # production
 */
const { listAllStores } = await import("../src/lib/data.ts");
const { syncStoreCustomers } = await import("../src/lib/customer-data.ts");

let total = 0;
for (const store of await listAllStores()) {
  const written = await syncStoreCustomers(store);
  total += written;
  console.log(`${store.name}: ${written} customer${written === 1 ? "" : "s"}`);
}
console.log(`done — ${total} customer records in place`);
process.exit(0);
