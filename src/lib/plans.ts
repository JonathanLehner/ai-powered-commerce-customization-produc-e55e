/**
 * What an agency's plan allows. The live-store ceiling sold on the pricing page
 * and the ceiling enforced when a store is created are this one table, so the
 * two cannot drift apart.
 *
 * Only active stores count. An archived store keeps its records but its
 * storefront is offline, which is what the pricing page means by "unlimited
 * draft stores": archiving is the way back under a limit without losing anything.
 */

export type PlanKey = "starter" | "studio" | "scale";

export const PLAN_KEYS = ["starter", "studio", "scale"] as const;

export interface Plan {
  key: PlanKey;
  name: string;
  /** List price per month on monthly billing, in whole units of each currency. `null` is priced by sales. */
  monthlyPrice: Record<PlanCurrency, number> | null;
  /** Active stores an agency may run at once. `null` is no ceiling. */
  storeLimit: number | null;
  /** Downloading the audit history as a spreadsheet. Reading it is on every plan. */
  auditExport: boolean;
}

/** The currencies plans are priced and billed in. Each has its own list price, not a conversion. */
export const PLAN_CURRENCIES = ["USD", "EUR"] as const;

export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export function isPlanCurrency(value: unknown): value is PlanCurrency {
  return typeof value === "string" && (PLAN_CURRENCIES as readonly string[]).includes(value);
}

/** Languages mostly read inside the EU see euros first; the rest see US dollars. */
const EURO_LOCALES = ["de", "fr", "es", "it", "nl", "pt", "sv"];

export function defaultPlanCurrency(locale: string): PlanCurrency {
  return EURO_LOCALES.includes(locale) ? "EUR" : "USD";
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: { key: "starter", name: "Starter", monthlyPrice: { USD: 39, EUR: 36 }, storeLimit: 3, auditExport: false },
  studio: { key: "studio", name: "Studio", monthlyPrice: { USD: 149, EUR: 139 }, storeLimit: 15, auditExport: true },
  scale: { key: "scale", name: "Scale", monthlyPrice: null, storeLimit: null, auditExport: true },
};

export type BillingCycle = "monthly" | "yearly";

/** Yearly billing takes this share off twelve monthly payments. */
export const YEARLY_DISCOUNT = 0.2;

export interface PlanPrice {
  /** What a month costs on this cycle, rounded to whole units. */
  perMonth: number;
  /** What is charged per invoice: one month, or the whole year. */
  billed: number;
}

/** A plan's price on a billing cycle in a currency, or null for a plan priced by sales. */
export function planPrice(plan: Plan, cycle: BillingCycle, currency: PlanCurrency): PlanPrice | null {
  if (plan.monthlyPrice === null) return null;
  const monthly = plan.monthlyPrice[currency];
  if (cycle === "monthly") return { perMonth: monthly, billed: monthly };
  const yearly = Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT));
  return { perMonth: Math.round(yearly / 12), billed: yearly };
}

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

/** The cheapest plan the download comes with. */
export function firstPlanWithAuditExport(): Plan {
  return PLANS[PLAN_KEYS.find((key) => PLANS[key].auditExport) ?? "scale"];
}

/** Shown where the download would be, on a plan that does not include it. */
export function auditExportMessage(plan: Plan, agencyName: string): string {
  const upgrade = firstPlanWithAuditExport();
  return `${agencyName} is on the ${plan.name} plan. Export is available on ${upgrade.name} and above.`;
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
    ? `Archive a store, or move up to ${nextPlan.name} for ${planStoreLabel(nextPlan).toLowerCase()}.`
    : "Archive a store to free a place.";
  return `${included} ${inUse} ${wayOut}`;
}
