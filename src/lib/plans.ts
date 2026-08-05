/**
 * What an agency's plan allows. The live-store ceiling sold on the pricing page
 * and the ceiling enforced when a store is created are this one table, so the
 * two cannot drift apart.
 *
 * Only active stores count. An archived store keeps its records but its
 * storefront is offline, which is what the pricing page means by "unlimited
 * drafts" — archiving is the way back under a limit without losing anything.
 */

export type PlanKey = "starter" | "studio" | "scale";

export const PLAN_KEYS = ["starter", "studio", "scale"] as const;

export interface Plan {
  key: PlanKey;
  name: string;
  /** Active stores an agency may run at once. `null` is no ceiling. */
  storeLimit: number | null;
  /** Downloading the audit history as a spreadsheet. Reading it is on every plan. */
  auditExport: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: { key: "starter", name: "Starter", storeLimit: 3, auditExport: false },
  studio: { key: "studio", name: "Studio", storeLimit: 15, auditExport: true },
  scale: { key: "scale", name: "Scale", storeLimit: null, auditExport: true },
};

/** Resolves a stored plan value, falling back to the smallest plan. */
export function planFor(plan: string | null | undefined): Plan {
  return PLANS[plan as PlanKey] ?? PLANS.starter;
}

/** The plan above this one, or null at the top of the table. */
export function nextPlanUp(plan: Plan): Plan | null {
  const next = PLAN_KEYS[PLAN_KEYS.indexOf(plan.key) + 1];
  return next ? PLANS[next] : null;
}

export function planStoreLabel(plan: Plan): string {
  return plan.storeLimit === null ? "Unlimited live stores" : `${plan.storeLimit} live stores`;
}

/** How a plan's audit entitlement is sold, and what the workspace then allows. */
export function planAuditLabel(plan: Plan): string {
  return plan.auditExport ? "Full audit history export" : "Audit history on screen";
}

/** The cheapest plan the download comes with. */
export function firstPlanWithAuditExport(): Plan {
  return PLANS[PLAN_KEYS.find((key) => PLANS[key].auditExport) ?? "scale"];
}

/** Shown where the download would be, on a plan that does not include it. */
export function auditExportMessage(plan: Plan, agencyName: string): string {
  const upgrade = firstPlanWithAuditExport();
  return `${agencyName} is on the ${plan.name} plan, which shows the full audit history on screen. Downloading it as a spreadsheet comes with ${upgrade.name}.`;
}

export interface StoreAllowance {
  plan: Plan;
  /** null when the plan has no ceiling. */
  limit: number | null;
  used: number;
  /** null when the plan has no ceiling. */
  remaining: number | null;
  atLimit: boolean;
  nextPlan: Plan | null;
}

export function storeAllowance(plan: string | null | undefined, activeStores: number): StoreAllowance {
  const resolved = planFor(plan);
  const limit = resolved.storeLimit;
  const used = Math.max(0, activeStores);
  return {
    plan: resolved,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    atLimit: limit !== null && used >= limit,
    nextPlan: nextPlanUp(resolved),
  };
}

/** Short form for a header or a list row: "2 of 3 live stores". */
export function storeUsageLabel(allowance: StoreAllowance): string {
  const { limit, used } = allowance;
  if (limit === null) return `${used} live ${used === 1 ? "store" : "stores"}, no limit`;
  return `${used} of ${limit} live stores`;
}

/**
 * The full explanation shown when a limit blocks a store: which plan, what it
 * includes, how much is in use, and the two ways out.
 */
export function storeLimitMessage(allowance: StoreAllowance, agencyName: string): string {
  const { plan, limit, used, nextPlan } = allowance;
  if (limit === null) {
    return `${agencyName} is on the ${plan.name} plan, which has no live-store limit.`;
  }
  const included = `${agencyName} is on the ${plan.name} plan, which includes ${limit} live ${limit === 1 ? "store" : "stores"}.`;
  const inUse =
    used > limit
      ? `${used} are active, which is already over the limit.`
      : `All ${used} of them are in use.`;
  const wayOut = nextPlan
    ? `Archive a store you no longer run, or move up to ${nextPlan.name} for ${planStoreLabel(nextPlan).toLowerCase()}.`
    : "Archive a store you no longer run to free a place.";
  return `${included} ${inUse} ${wayOut}`;
}
