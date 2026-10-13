import "server-only";
import { after } from "next/server";
import { sendDueRecoveryEmails } from "./checkout-recovery";
import { COLLECTIONS } from "./data";
import { db } from "./mongo";
import { runDueDeliveries } from "./webhooks";

/**
 * Work that comes due later: webhook retries and abandoned checkout emails.
 *
 * There is no cron on the deployment, so the requests the app serves anyway
 * run it, after their response: the workspace and the storefronts kick it, at
 * most once every half minute per isolate, and one lease shared by every
 * isolate lets a single run through each minute. `/api/cron` runs it too, for
 * an outside scheduler with the `CRON_SECRET`.
 */

const LEASE_MS = 55_000;
const KICK_INTERVAL_MS = 30_000;
let lastKick = 0;

async function claimLease(now: Date): Promise<boolean> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const taken = await db.updateOne(
    COLLECTIONS.jobLeases,
    { id: "scheduler", until: { $lt: now.toISOString() } },
    { $set: { until } },
  );
  if (taken.modifiedCount === 1) return true;
  if (await db.findOne(COLLECTIONS.jobLeases, { id: "scheduler" })) return false;
  try {
    await db.insertOne(COLLECTIONS.jobLeases, { id: "scheduler", until });
    return true;
  } catch {
    // Another isolate created it a moment ago, and with it took this minute.
    return false;
  }
}

/** Runs what is due, unless another run holds the lease. */
export async function runScheduledWork(): Promise<{ deliveries: number; recoveryEmails: number } | null> {
  if (!(await claimLease(new Date()))) return null;
  const deliveries = await runDueDeliveries(25);
  const recoveryEmails = await sendDueRecoveryEmails(25);
  return { deliveries, recoveryEmails };
}

/** Runs the scheduler after the current response, if this isolate has not lately. */
export function kickScheduler(): void {
  const now = Date.now();
  if (now - lastKick < KICK_INTERVAL_MS) return;
  lastKick = now;
  try {
    after(() => runScheduledWork().catch((error: unknown) => console.error("Scheduled work failed", error)));
  } catch {
    // Outside a request there is nothing to defer to; the next request runs it.
  }
}
