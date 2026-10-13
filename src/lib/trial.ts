/**
 * What the free trial allows, and what changes once it ends. Pure, so
 * `npm run billing-check` can run it with any clock.
 *
 * When the trial ends without payment details the workspace becomes read-only:
 * every page still opens and shows its data, nothing can be changed. The
 * agency's storefronts stay open for `STOREFRONT_GRACE_DAYS` more days so
 * shoppers are not turned away overnight, then stop taking orders until
 * payment details are added. The owner is emailed three days and one day
 * before the trial ends, and on the day it ends.
 */
import type { Agency } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long storefronts keep taking orders after the trial ends. */
export const STOREFRONT_GRACE_DAYS = 7;

type BillingFields = Pick<Agency, "billing"> | null | undefined;

/** True while the agency is on its free trial without payment details, whether or not the trial has ended. */
export function onTrial(agency: BillingFields): boolean {
  return agency?.billing?.status === "trialing";
}

function trialEnds(agency: BillingFields): number {
  return onTrial(agency) && agency?.billing?.trialEndsAt ? Date.parse(agency.billing.trialEndsAt) : NaN;
}

/**
 * Whole days left on the free trial, rounded down the way Stripe Checkout
 * counts its "days free", so the two always agree. 0 on the last day and once
 * the trial has ended.
 */
export function trialDaysLeft(agency: BillingFields, now = Date.now()): number {
  const ends = trialEnds(agency);
  if (Number.isNaN(ends)) return 0;
  return Math.max(0, Math.floor((ends - now) / DAY_MS));
}

/** True once a trial has run out without payment details. */
export function trialEnded(agency: BillingFields, now = Date.now()): boolean {
  if (!onTrial(agency)) return false;
  const ends = trialEnds(agency);
  return Number.isNaN(ends) || now >= ends;
}

/**
 * When the first charge falls if payment details are added now: the end of the
 * trial, which Checkout keeps, or null when it is too close for Stripe (which
 * needs a trial end at least two days out) and the plan is billed at once.
 */
export function firstChargeAt(agency: BillingFields, now = Date.now()): Date | null {
  const ends = trialEnds(agency);
  if (Number.isNaN(ends) || ends - now < 2 * DAY_MS + 60 * 60 * 1000) return null;
  return new Date(ends);
}

/**
 * True while a self-serve agency has to add payment details before it can go
 * on: its free trial has ended, or it signed up card-first and never finished
 * checkout. Platform-managed agencies never are. The workspace is read-only
 * while this holds.
 */
export function billingPending(agency: BillingFields, now = Date.now()): boolean {
  if (agency?.billing?.status === "pending") return true;
  return trialEnded(agency, now);
}

/** When an ended trial's storefronts stop taking orders, or null when they are not due to. */
export function storefrontsCloseAt(agency: BillingFields): Date | null {
  const ends = trialEnds(agency);
  return Number.isNaN(ends) ? null : new Date(ends + STOREFRONT_GRACE_DAYS * DAY_MS);
}

/** True once an ended trial's grace period is over, so its storefronts take no orders. */
export function storefrontsClosed(agency: BillingFields, now = Date.now()): boolean {
  const closes = storefrontsCloseAt(agency);
  return closes !== null && now >= closes.getTime();
}

export type TrialReminder = "three_days" | "one_day" | "ended";

/**
 * The reminder the owner is due now, or null. Only the latest one that
 * applies is sent, so an agency the scheduler reaches late gets one email,
 * and none once its storefronts have closed.
 */
export function trialReminderDue(agency: BillingFields, now = Date.now()): TrialReminder | null {
  const ends = trialEnds(agency);
  if (Number.isNaN(ends) || storefrontsClosed(agency, now)) return null;
  const sent = agency?.billing?.trialReminders ?? [];
  const due: TrialReminder | null =
    now >= ends ? "ended" : ends - now <= DAY_MS ? "one_day" : ends - now <= 3 * DAY_MS ? "three_days" : null;
  return due && !sent.includes(due) ? due : null;
}
