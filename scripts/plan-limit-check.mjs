// Self-check for the agency plan store limit: npm run plan-limit-check
import assert from "node:assert/strict";
import {
  PLANS,
  nextPlanUp,
  planFor,
  planStoreLabel,
  storeAllowance,
  storeLimitMessage,
  storeUsageLabel,
} from "../src/lib/plans.ts";

// The ceilings the pricing page sells.
assert.equal(PLANS.starter.storeLimit, 3);
assert.equal(PLANS.studio.storeLimit, 15);
assert.equal(PLANS.scale.storeLimit, null, "Scale is sold as unlimited stores");

// A plan value that is missing or unrecognised is treated as the smallest plan,
// never as unlimited.
assert.equal(planFor("studio").key, "studio");
assert.equal(planFor(null).key, "starter");
assert.equal(planFor("enterprise").key, "starter");

/* ------------------------------------------------------------ the allowance */

// Starter, two live stores: room for one more.
const room = storeAllowance("starter", 2);
assert.equal(room.atLimit, false);
assert.equal(room.remaining, 1);
assert.equal(storeUsageLabel(room), "2 of 3 live stores");

// The third store fills the plan; the fourth is refused.
assert.equal(storeAllowance("starter", 3).atLimit, true);
assert.equal(storeAllowance("starter", 3).remaining, 0);
assert.equal(storeAllowance("starter", 4).atLimit, true);
assert.equal(storeAllowance("starter", 4).remaining, 0, "over the limit is never negative room");

// Studio runs the same rule at 15, and Scale has no ceiling at all.
assert.equal(storeAllowance("studio", 14).atLimit, false);
assert.equal(storeAllowance("studio", 15).atLimit, true);
assert.equal(storeAllowance("scale", 400).atLimit, false);
assert.equal(storeAllowance("scale", 400).remaining, null);

// Archived stores are simply not part of the count handed in — the caller counts
// active stores — so an agency at its limit gets a place back by archiving one.
const cobalt = storeAllowance("starter", 3);
assert.equal(cobalt.atLimit, true);
assert.equal(storeAllowance("starter", cobalt.used - 1).atLimit, false);

/* -------------------------------------------------------------- what it says */

const message = storeLimitMessage(storeAllowance("starter", 3), "Cobalt & Co");
assert.match(message, /Cobalt & Co/, "the message names the agency");
assert.match(message, /Starter plan/, "the message names the current plan");
assert.match(message, /includes 3 live stores/, "the message states the limit");
assert.match(message, /All 3 of them are in use/, "the message states what is in use");
assert.match(message, /Archive a store/, "archiving is offered");
assert.match(message, /move up to Studio for 15 live stores/, "the next plan up is offered");

// A plan lowered underneath a busy agency reads as over, not as "all in use".
assert.match(storeLimitMessage(storeAllowance("starter", 5), "Cobalt & Co"), /5 are active/);

// At the top of the table there is no plan to move up to.
const top = storeAllowance("scale", 12);
assert.equal(nextPlanUp(top.plan), null);
assert.match(storeLimitMessage(top, "Northlight Studio"), /no live-store limit/);

assert.equal(nextPlanUp(PLANS.starter).key, "studio");
assert.equal(nextPlanUp(PLANS.studio).key, "scale");

// The pricing page renders these labels, so they are the plan copy too.
assert.equal(planStoreLabel(PLANS.starter), "3 live stores");
assert.equal(planStoreLabel(PLANS.scale), "Unlimited live stores");
assert.equal(storeUsageLabel(storeAllowance("scale", 1)), "1 live store, no limit");

console.log("plan-limit-check ok");
