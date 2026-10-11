import { getLocale, getTranslations } from "next-intl/server";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { listDiscountCodes } from "@/lib/data";
import { isExpired } from "@/lib/discounts";
import { requireStoreAccess } from "@/lib/session";
import type { DiscountCode } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import { DiscountCreateForm, DiscountEditForm } from "./DiscountForms";

type CodeState = "inactive" | "expired" | "limitReached" | "live";

/** The one-line state of a code: why it is or is not working right now. */
function codeState(code: DiscountCode): { label: CodeState; tone: "green" | "amber" | "slate" | "rose" } {
  if (!code.active) return { label: "inactive", tone: "slate" };
  if (isExpired(code)) return { label: "expired", tone: "rose" };
  if (code.usageLimit !== null && code.timesUsed >= code.usageLimit) {
    return { label: "limitReached", tone: "amber" };
  }
  return { label: "live", tone: "green" };
}

export default async function DiscountsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const codes = await listDiscountCodes(storeId);

  const live = codes.filter((code) => codeState(code).label === "live");
  const redemptions = codes.reduce((sum, code) => sum + (code.timesUsed ?? 0), 0);

  const [pages, t, locale] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("discounts"),
    getLocale(),
  ]);
  const worth = (code: DiscountCode) =>
    code.kind === "percentage"
      ? t("percentOff", { value: code.value })
      : t("amountOff", { amount: formatMoney(code.value, code.currency, locale) });
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("discountsTitle")}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("codes")} value={String(codes.length)} sub={t("activeCount", { count: live.length })} />
        <StatCard label={t("redemptions")} value={String(redemptions)} />
        <StatCard
          label={t("currency")}
          value={store.defaultCurrency}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("codes")}</h2>
        {codes.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ul className="space-y-4">
            {codes.map((code) => {
              const state = codeState(code);
              return (
                <li key={code.id} id={code.id} className="scroll-mt-24">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-foreground">{code.code}</span>
                        <Badge tone={state.tone}>{t(state.label)}</Badge>
                        <span className="text-sm text-inksoft">{worth(code)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {code.minimumSubtotal > 0
                            ? `${t("minimum", { amount: formatMoney(code.minimumSubtotal, code.currency, locale) })} · `
                            : ""}
                          {code.expiresAt ? `${t("expires", { date: formatDate(code.expiresAt, locale) })} · ` : ""}
                          {code.usageLimit === null
                            ? t("usedNoLimit", { used: code.timesUsed ?? 0 })
                            : t("usedOfLimit", { used: code.timesUsed ?? 0, limit: code.usageLimit })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("createdBy", { name: code.createdBy, date: formatDate(code.createdAt, locale) })}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-primary">
                          {t("edit", { code: code.code })}
                        </summary>
                        <div className="mt-3 border-t border-border pt-4">
                          <DiscountEditForm code={code} />
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("createTitle")}</h2>
        <DiscountCreateForm storeId={storeId} currency={store.defaultCurrency} />
      </section>
    </div>
  );
}
