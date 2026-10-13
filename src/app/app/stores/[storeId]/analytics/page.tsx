import { DownloadIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { KpiCards } from "@/components/KpiCards";
import { RangeControls } from "@/components/RangeControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { languageName } from "@/i18n/display";
import { formatMinorUnits } from "@/i18n/format";
import { parseRange, rangeQuery } from "@/lib/analytics";
import { loadStoreAnalytics } from "@/lib/analytics-data";
import { requireStoreAccess } from "@/lib/session";
import { AnalyticsCharts } from "./AnalyticsCharts";

const TH = "h-9 text-xs font-medium text-muted-foreground";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { storeId } = await params;
  const { store, viaPlatform } = await requireStoreAccess(storeId, "store.view");
  const now = new Date();
  const range = parseRange(await searchParams, now);
  const [report, t, roles, format, locale] = await Promise.all([
    loadStoreAnalytics(store, range),
    getTranslations("analytics"),
    getTranslations("roles"),
    getFormatter(),
    getLocale(),
  ]);

  const currency = store.defaultCurrency;
  // Platform access sees how the store is trading by volume, not its takings.
  const showMoney = !viaPlatform;
  const money = (minor: number) => formatMinorUnits(format, minor, currency);
  const day = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const base = `/app/stores/${store.id}/analytics`;

  const empty = report.current.orders === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={
          <>
            {t("period", {
              from: day(range.from),
              to: day(range.to),
              previousFrom: day(range.previous.from),
              previousTo: day(range.previous.to),
            })}
            {viaPlatform ? <span className="mt-0.5 block">{roles("platformAccessNote")}</span> : null}
          </>
        }
        actions={
          <>
            <RangeControls
              key={rangeQuery(range)}
              base={base}
              range={range.key}
              from={range.from}
              to={range.to}
              today={now.toISOString().slice(0, 10)}
            />
            {showMoney ? (
              <Button asChild variant="outline">
                <a href={`${base}/export${rangeQuery(range)}`} download>
                  <DownloadIcon />
                  {t("download")}
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <KpiCards
        report={report}
        keys={["revenue", "margin", "orders", "aov", "units", "refundRate", "exceptionRate"]}
        showMoney={showMoney}
        className={showMoney ? "lg:grid-cols-4" : "lg:grid-cols-3"}
      />

      {empty ? (
        <EmptyState title={t("noSales")} description={t("noSalesBody")} />
      ) : (
        <>
          <AnalyticsCharts
            series={report.series}
            weekly={range.bucketDays > 1}
            currency={currency}
            showMoney={showMoney}
            languages={report.languages.map((row) => ({
              name: languageName(locale, row.code),
              revenue: row.revenue,
              orders: row.orders,
            }))}
            currencies={report.currencies.map((row) => ({ name: row.code, revenue: row.revenue, orders: row.orders }))}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <Tabs defaultValue={showMoney ? "revenue" : "units"} className="gap-0">
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle asChild>
                    <h2>{t("topProducts")}</h2>
                  </CardTitle>
                  {showMoney ? (
                    <TabsList>
                      <TabsTrigger value="revenue">{t("byRevenue")}</TabsTrigger>
                      <TabsTrigger value="units">{t("byUnits")}</TabsTrigger>
                    </TabsList>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-3">
                  {(showMoney ? (["revenue", "units"] as const) : (["units"] as const)).map((tab) => (
                    <TabsContent key={tab} value={tab}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TH}>{t("colProduct")}</TableHead>
                            <TableHead className={`${TH} text-right`}>{t("colUnits")}</TableHead>
                            {showMoney ? <TableHead className={`${TH} text-right`}>{t("colRevenue")}</TableHead> : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(tab === "revenue" ? report.productsByRevenue : report.productsByUnits).map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="max-w-0 truncate font-medium">{row.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{format.number(row.units)}</TableCell>
                              {showMoney ? (
                                <TableCell className="text-right tabular-nums">{money(row.revenue)}</TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TabsContent>
                  ))}
                </CardContent>
              </Tabs>
            </Card>

            <Card>
              <Tabs defaultValue="uses" className="gap-0">
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle asChild>
                    <h2>{t("topDiscounts")}</h2>
                  </CardTitle>
                  {showMoney && report.discountsByUses.length > 0 ? (
                    <TabsList>
                      <TabsTrigger value="uses">{t("byUsage")}</TabsTrigger>
                      <TabsTrigger value="revenue">{t("byRevenue")}</TabsTrigger>
                    </TabsList>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-3">
                  {report.discountsByUses.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{t("noDiscounts")}</p>
                  ) : (
                    (showMoney ? (["uses", "revenue"] as const) : (["uses"] as const)).map((tab) => (
                      <TabsContent key={tab} value={tab}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className={TH}>{t("colCode")}</TableHead>
                              <TableHead className={`${TH} text-right`}>{t("colUses")}</TableHead>
                              {showMoney ? (
                                <>
                                  <TableHead className={`${TH} text-right`}>{t("colDiscount")}</TableHead>
                                  <TableHead className={`${TH} text-right`}>{t("colRevenue")}</TableHead>
                                </>
                              ) : null}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(tab === "uses" ? report.discountsByUses : report.discountsByRevenue).map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                                <TableCell className="text-right tabular-nums">{format.number(row.uses)}</TableCell>
                                {showMoney ? (
                                  <>
                                    <TableCell className="text-right tabular-nums">{money(row.discounted)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(row.revenue)}</TableCell>
                                  </>
                                ) : null}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TabsContent>
                    ))
                  )}
                </CardContent>
              </Tabs>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
