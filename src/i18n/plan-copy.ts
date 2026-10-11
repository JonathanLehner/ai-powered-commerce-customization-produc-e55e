import "server-only";
import { getTranslations } from "next-intl/server";
import { firstPlanWithAuditExport, type Plan, type StoreAllowance } from "@/lib/plans";

/** "15 live stores" or "unlimited live stores", in the user's language. */
export async function planStoresText(plan: Plan, title = false): Promise<string> {
  const t = await getTranslations("plans");
  if (plan.storeLimit === null) return title ? t("storesUnlimitedTitle") : t("storesUnlimited");
  return title ? t("storesLimitedTitle", { limit: plan.storeLimit }) : t("storesLimited", { limit: plan.storeLimit });
}

/** Why another store cannot go live, and the two ways on. */
export async function storeLimitText(allowance: StoreAllowance, agency: string): Promise<string> {
  const t = await getTranslations("plans");
  const { plan, limit, used, nextPlan } = allowance;
  if (limit === null) return t("noLimit", { agency, plan: plan.name });
  const included = t("included", { agency, plan: plan.name, limit });
  const inUse = used > limit ? t("overLimit", { used }) : t("allInUse", { used });
  const wayOut = nextPlan
    ? t("moveUp", { plan: nextPlan.name, stores: await planStoresText(nextPlan) })
    : t("archiveOne");
  return `${included} ${inUse} ${wayOut}`;
}

/** "4 of 15 live stores", or "4 live stores, no limit". */
export async function storeUsageText(allowance: StoreAllowance): Promise<string> {
  const t = await getTranslations("plans");
  const { limit, used } = allowance;
  return limit === null ? t("usageUnlimited", { used }) : t("usageLimited", { used, limit });
}

/** Why the audit download is not on this agency's plan. */
export async function auditExportText(plan: Plan, agency: string | undefined): Promise<string> {
  const t = await getTranslations("plans");
  const upgrade = firstPlanWithAuditExport();
  return t("auditExport", {
    agency: agency ?? (await getTranslations("audit"))("thisAgency"),
    plan: plan.name,
    upgrade: upgrade.name,
  });
}
