import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatMinorUnits } from "@/i18n/format";
import { percentChange, type AnalyticsReport, type Kpis } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type KpiKey = "revenue" | "margin" | "orders" | "aov" | "units" | "refundRate" | "exceptionRate";

/**
 * Report figures for the period, each against the previous one. Shared by the
 * Analytics page and the store overview so both read the same report the same
 * way. Without `showMoney` the takings are left out.
 */
export async function KpiCards({
  report,
  keys,
  showMoney,
  className,
}: {
  report: Pick<AnalyticsReport, "currency" | "current" | "previous">;
  keys: KpiKey[];
  showMoney: boolean;
  className?: string;
}) {
  const [t, format] = await Promise.all([getTranslations("analytics"), getFormatter()]);
  const money = (minor: number) => formatMinorUnits(format, minor, report.currency);
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 1 });

  const defs: Record<KpiKey, { label: string; sub?: string; value: (k: Kpis) => string; lowerIsBetter?: boolean; money?: boolean }> = {
    revenue: { label: t("revenue"), sub: t("revenueSub"), value: (k) => money(k.revenue), money: true },
    margin: { label: t("margin"), sub: t("marginSub"), value: (k) => money(k.margin), money: true },
    orders: { label: t("orders"), value: (k) => format.number(k.orders) },
    aov: { label: t("aov"), value: (k) => money(k.aov), money: true },
    units: { label: t("units"), value: (k) => format.number(k.units) },
    refundRate: { label: t("refundRate"), value: (k) => percent(k.refundRate), lowerIsBetter: true, money: true },
    exceptionRate: {
      label: t("exceptionRate"),
      sub: t("exceptionRateSub", { count: report.current.exceptions }),
      value: (k) => percent(k.exceptionRate),
      lowerIsBetter: true,
    },
  };
  const visible = keys.filter((key) => showMoney || !defs[key].money);

  return (
    <section className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}>
      {visible.map((key) => {
        const kpi = defs[key];
        const change = percentChange(report.current[key], report.previous[key]);
        const good = change === null || change === 0 ? null : kpi.lowerIsBetter ? change < 0 : change > 0;
        return (
          <Card key={key} size="sm" className="border border-border ring-0">
            <CardContent>
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {kpi.value(report.current)}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs tabular-nums",
                  good === null ? "text-muted-foreground" : good ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {change === null
                  ? report.previous.orders === 0
                    ? t("noComparison")
                    : t("previousValue", { value: kpi.value(report.previous) })
                  : t("change", {
                      change: format.number(change, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }),
                    })}
              </p>
              {kpi.sub ? <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p> : null}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
