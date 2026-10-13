import "server-only";
import { getTranslations } from "next-intl/server";
import { ATTENTION_REASONS, type AttentionBreakdown } from "@/lib/attention";

/**
 * "2 exceptions · 1 manual routing · 1 awaiting production": every part of the
 * total, and the products taken off for failing pre-flight where counted.
 */
export async function attentionSummary(breakdown: AttentionBreakdown, preflightFailed = 0): Promise<string> {
  const t = await getTranslations("attention");
  if (breakdown.total === 0 && preflightFailed === 0) return t("none");
  const parts = ATTENTION_REASONS.filter((reason) => breakdown[reason] > 0).map((reason) =>
    t(`parts.${reason}`, { count: breakdown[reason] }),
  );
  if (preflightFailed > 0) parts.push(t("parts.preflight_failed", { count: preflightFailed }));
  return parts.join(" · ");
}
