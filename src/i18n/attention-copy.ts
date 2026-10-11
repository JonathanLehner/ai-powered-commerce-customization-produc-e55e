import "server-only";
import { getTranslations } from "next-intl/server";
import { ATTENTION_REASONS, type AttentionBreakdown } from "@/lib/attention";

/** "2 exceptions · 1 manual routing · 1 awaiting production": every part of the total. */
export async function attentionSummary(breakdown: AttentionBreakdown): Promise<string> {
  const t = await getTranslations("attention");
  if (breakdown.total === 0) return t("none");
  return ATTENTION_REASONS.filter((reason) => breakdown[reason] > 0)
    .map((reason) => t(`parts.${reason}`, { count: breakdown[reason] }))
    .join(" · ");
}
