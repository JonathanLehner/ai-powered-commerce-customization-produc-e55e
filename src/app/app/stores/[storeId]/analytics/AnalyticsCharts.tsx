"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMinorUnits } from "@/i18n/format";
import type { SeriesPoint } from "@/lib/analytics";
import { minorFactor } from "@/lib/util";

type Breakdown = { name: string; revenue: number; orders: number };

/** One measure per chart, in the brand colour: revenue and orders never share an axis. */
const SERIES: ChartConfig = {
  revenue: { color: "var(--chart-1)" },
  orders: { color: "var(--chart-1)" },
};

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The time series and the two breakdowns. `showMoney` is off for platform
 * access, which sees order counts and never the store's takings.
 */
export function AnalyticsCharts({
  series,
  weekly,
  currency,
  languages,
  currencies,
  showMoney,
}: {
  series: SeriesPoint[];
  weekly: boolean;
  currency: string;
  languages: Breakdown[];
  currencies: Breakdown[];
  showMoney: boolean;
}) {
  const t = useTranslations("analytics");
  const format = useFormatter();
  const money = (minor: number) => formatMinorUnits(format, minor, currency);
  const compactMoney = (minor: number) =>
    format.number(minor / minorFactor(currency), {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
    });
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" });
  const fullDay = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const metric = showMoney ? "revenue" : "orders";
  const value = (row: { revenue: number; orders: number }) => (showMoney ? money(row.revenue) : format.number(row.orders));

  const ordersChart = (
    <ChartContainer config={SERIES} className="aspect-auto h-64 w-full">
      <BarChart data={series} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={day} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) => fullDay(String(payload?.[0]?.payload?.date ?? ""))}
              formatter={(v) => <TooltipRow label={t("orders")} value={format.number(Number(v))} />}
            />
          }
        />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        {showMoney ? (
          <Tabs defaultValue="revenue" className="gap-0">
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("overTime")}</h2>
              </CardTitle>
              <CardDescription>{weekly ? t("byWeek") : t("byDay")}</CardDescription>
              <CardAction>
                <TabsList>
                  <TabsTrigger value="revenue">{t("revenue")}</TabsTrigger>
                  <TabsTrigger value="orders">{t("orders")}</TabsTrigger>
                </TabsList>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-4">
              <TabsContent value="revenue">
                <ChartContainer config={SERIES} className="aspect-auto h-64 w-full">
                  <AreaChart data={series} margin={{ left: 4, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={day} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compactMoney(v)} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          hideIndicator
                          labelFormatter={(_, payload) => fullDay(String(payload?.[0]?.payload?.date ?? ""))}
                          formatter={(v) => <TooltipRow label={t("revenue")} value={money(Number(v))} />}
                        />
                      }
                    />
                    <Area
                      dataKey="revenue"
                      type="linear"
                      stroke="var(--color-revenue)"
                      strokeWidth={2}
                      fill="var(--color-revenue)"
                      fillOpacity={0.12}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ChartContainer>
              </TabsContent>
              <TabsContent value="orders">{ordersChart}</TabsContent>
            </CardContent>
          </Tabs>
        ) : (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("orders")}</h2>
              </CardTitle>
              <CardDescription>{weekly ? t("byWeek") : t("byDay")}</CardDescription>
            </CardHeader>
            <CardContent>{ordersChart}</CardContent>
          </>
        )}
      </Card>

      <BreakdownCard
        title={t("byLanguage")}
        rows={languages}
        metric={metric}
        value={value}
        tooltipLabel={showMoney ? t("revenue") : t("orders")}
        className="lg:col-span-2"
      />
      <BreakdownCard
        title={t("byCurrency")}
        description={showMoney ? t("convertedTo", { currency }) : undefined}
        rows={currencies}
        metric={metric}
        value={value}
        tooltipLabel={showMoney ? t("revenue") : t("orders")}
      />
    </div>
  );
}

/** A ranked horizontal bar per language or currency, named on its own axis. */
function BreakdownCard({
  title,
  description,
  rows,
  metric,
  value,
  tooltipLabel,
  className,
}: {
  title: string;
  description?: string;
  rows: Breakdown[];
  metric: "revenue" | "orders";
  value: (row: Breakdown) => string;
  tooltipLabel: string;
  className?: string;
}) {
  const config: ChartConfig = { [metric]: { color: "var(--chart-1)" } };
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle asChild>
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rows.length * 40 + 8 }}>
          <BarChart data={rows.map((row) => ({ ...row, label: value(row) }))} layout="vertical" margin={{ left: 0, right: 96 }}>
            <XAxis type="number" dataKey={metric} hide />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? "")}
                  formatter={(_, __, item) => <TooltipRow label={tooltipLabel} value={value(item.payload as Breakdown)} />}
                />
              }
            />
            <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[0, 4, 4, 0]} barSize={20}>
              <LabelList dataKey="label" position="right" offset={8} className="fill-foreground tabular-nums" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
