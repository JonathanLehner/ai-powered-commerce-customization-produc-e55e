/**
 * Marks the seeded stores as demo stores, so their checkout keeps simulating
 * payment once live Stripe keys are configured. Their account ids were made up
 * for the demo and are not Connect accounts; nobody can be charged through them.
 *
 * Only the stores seed.mjs creates are touched (the gift portal runs on
 * northwind-supply). Every other store keeps whatever it has: one with an
 * account id typed in by hand shows "Reconnect" in guided setup until it goes
 * through Connect onboarding.
 *
 * Safe to re-run.
 *
 * Run: node --env-file=.env.local scripts/mark-demo-stores.mjs
 *      (MONGODB_DB unset in the environment targets production)
 */
import { openDatabase } from "./mongo.mjs";

/** Mirrors the `demo: true` stores in scripts/seed.mjs. */
const DEMO_STORES = ["northwind-supply", "lumen-studio", "ferro-coffee", "rivet-hardware"];

const { client, db } = await openDatabase();
const result = await db
  .collection("stores")
  .updateMany({ slug: { $in: DEMO_STORES }, demo: { $ne: true } }, { $set: { demo: true } });
const marked = await db.collection("stores").countDocuments({ demo: true });
console.log(`marked ${result.modifiedCount} store(s); ${marked} demo store(s) in total`);
await client.close();
