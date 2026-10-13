import "server-only";
import { after } from "next/server";
import { sendDueRecoveryEmails } from "./checkout-recovery";
import { COLLECTIONS } from "./data";
import { siteOrigin } from "./email";
import { db } from "./mongo";
import { sweepPreflight } from "./preflight-guard";
import { sendDueTrialReminders } from "./trial-reminders";
import { runDueDeliveries } from "./webhooks";

/**
 * Work that comes due later: webhook retries, abandoned checkout emails, free
 * trial reminders, and taking off the storefront any product that now fails
 * its supplier's file check.
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

/**
 * Runs what is due, unless another run holds the lease. `origin` is this
 * deployment's address for the links in emails, read before the response.
 */
export async function runScheduledWork(origin?: string): Promise<{
  deliveries: number;
  recoveryEmails: number;
  trialReminders: number;
  takenOff: number;
} | null> {
  if (!(await claimLease(new Date()))) return null;
  const deliveries = await runDueDeliveries(25);
  const recoveryEmails = await sendDueRecoveryEmails(25);
  const trialReminders = await sendDueTrialReminders(origin ?? (await siteOrigin()));
  const takenOff = await sweepPreflight();
  return { deliveries, recoveryEmails, trialReminders, takenOff };
}

/** Runs the scheduler after the current response, if this isolate has not lately. */
export function kickScheduler(): void {
  const now = Date.now();
  if (now - lastKick < KICK_INTERVAL_MS) return;
  lastKick = now;
  // Read during the render: request headers are out of reach once `after` runs.
  const origin = siteOrigin();
  try {
    after(() =>
      origin.then(runScheduledWork).catch((error: unknown) => console.error("Scheduled work failed", error)),
    );
  } catch {
    // Outside a request there is nothing to defer to; the next request runs it.
  }
}
