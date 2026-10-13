import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuditSummary, SUMMARY_SLOT } from "@/components/AuditSummary";
import { Badge, Callout, DataList, EmptyState, ProgressBar, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { platformAuditEntries, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import {
  agencyStoreAllowance,
  getAgency,
  getStorefront,
  listAudit,
  listOrders,
  listQuoteRequests,
  listStoreProducts,
} from "@/lib/data";
import { setupProgress, storeMetrics } from "@/lib/metrics";
import { takeOffFailingPreflight } from "@/lib/preflight-guard";
import { requireStoreAccess, roleCan, type Capability } from "@/lib/session";
import { attentionSummary } from "@/i18n/attention-copy";
import { formatAgo } from "@/i18n/format";
import { storeLimitText } from "@/i18n/plan-copy";
import { isOpenEnquiry, QUOTE_STATUS_TONES } from "@/lib/sourcing";
import { SETUP_STEPS, THEMES } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/util";

/** Rows the "Recent activity" panel has room for, once repeats are collapsed. */
const ACTIVITY_ROWS = 8;

/** Every section heading on this page is a card title over the same column head style. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function StoreOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ denied?: string; limit?: string }>;
}) {
  const { storeId } = await params;
  const { denied, limit } = await searchParams;
  const { store, role, viaPlatform } = await requireStoreAccess(storeId);

  const canSource = roleCan(role, "store.catalog");
  const can = (capability: Capability) => roleCan(role, capability);
  const [orders, products, storefront, audit, enquiries] = await Promise.all([
    listOrders(store.id),
    listStoreProducts(store.id).then((rows) => takeOffFailingPreflight(rows)),
    getStorefront(store.id),
    listAudit({ storeId: store.id }, recentAuditReadSize(ACTIVITY_ROWS)),
    canSource ? listQuoteRequests(store.id) : Promise.resolve([]),
  ]);
  const openEnquiries = enquiries.filter(isOpenEnquiry);

  // Repeats are one row here; "Full history" lists every record. Platform
  // access reads it without the shopper names and order values in it.
  const activity = recentAuditRuns(viaPlatform ? platformAuditEntries(audit) : audit, ACTIVITY_ROWS);

  // Only read after a restore was refused, so the usual visit stays two waves
  // of reads rather than three.
  const agency = limit ? await getAgency(store.agencyId) : null;
  const allowance = agency ? await agencyStoreAllowance(agency) : null;

  const metrics = storeMetrics(orders, products, store.defaultCurrency);
  const progress = setupProgress(store.setup);
  const recentOrders = orders.slice(0, 6);
  const theme = THEMES[store.theme];

  const [t, labels, dashboard, locale, format] = await Promise.all([
    getTranslations("overview"),
    getTranslations("labels"),
    getTranslations("dashboard"),
    getLocale(),
    getFormatter(),
  ]);
  const limitText = allowance && agency ? await storeLimitText(allowance, agency.name) : "";
  // Products taken off the storefront for failing pre-flight wait on the team too.
  const preflightFailed = products.filter(
    (p) => p.status === "in_review" && p.unpublishedReason === "preflight_failed",
  ).length;
  const attentionTotal = metrics.awaitingAction + preflightFailed;
  const attentionSub = await attentionSummary(metrics.attention, preflightFailed);
  const now = new Date();

  return (
    <div className="space-y-7">
      {denied ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {viaPlatform
            ? t("deniedPlatform")
            : t("denied")}
        </p>
      ) : null}

      {allowance && agency ? (
        <Callout tone="amber" title={t("limitTitle", { plan: allowance.plan.name })}>
          {t("notRestored")} {limitText}{" "}
          <Link href="/pricing" className="font-medium underline">
            {t("comparePlans")}
          </Link>
          .
        </Callout>
      ) : null}

      {store.status === "archived" ? (
        <Callout tone="slate" title={t("archivedTitle")}>
          {t("archivedOffline")}{" "}
          {roleCan(role, "store.settings") ? (
            <Link href={`/app/stores/${store.id}/setup`} className="font-medium underline">
              {t("restoreFromSettings")}
            </Link>
          ) : (
            <span>{t("adminCanRestore")}</span>
          )}
          .
        </Callout>
      ) : null}

      {progress.pct < 100 ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("finishSetup")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("stepsComplete", { done: progress.done, total: progress.total })}
              </p>
              {roleCan(role, "store.settings") ? (
                <CardAction>
                  <Button asChild>
                    <Link href={`/app/stores/${store.id}/setup`}>{t("continueSetup")}</Link>
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressBar value={progress.pct} />
              <ul className="flex flex-wrap gap-2">
                {SETUP_STEPS.map((key) => (
                  <li key={key}>
                    <Badge tone={store.setup[key] ? "green" : "amber"}>
                      {store.setup[key] ? "✓" : "•"} {labels(`setupStep.${key}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Money is the store's own; platform access counts orders instead. */}
        {viaPlatform ? (
          <>
            <StatCard label={t("orders30")} value={String(metrics.last30Orders)} />
            <StatCard label={t("ordersLifetime")} value={String(metrics.orderCount)} sub={t("paid", { count: metrics.paidOrders })} />
          </>
        ) : (
          <>
            <StatCard
              label={t("sales30")}
              value={formatMoney(metrics.last30Sales, store.defaultCurrency, locale)}
              sub={t("ordersCount", { count: metrics.last30Orders })}
            />
            <StatCard
              label={t("lifetimeSales")}
              value={formatMoney(metrics.grossSales, store.defaultCurrency, locale)}
              sub={t("paidOrders", { count: metrics.paidOrders })}
            />
          </>
        )}
        <StatCard
          label={t("published")}
          value={String(metrics.publishedProducts)}
          sub={t("inDraft", { count: metrics.draftProducts })}
        />
        <StatCard
          label={t("attention")}
          value={String(attentionTotal)}
          tone={attentionTotal > 0 ? "amber" : "green"}
          sub={attentionSub}
          href={
            metrics.awaitingAction === 0 && preflightFailed > 0
              ? `/app/stores/${store.id}/catalog?status=in_review`
              : `/app/stores/${store.id}/orders?view=attention`
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("recentOrders")}</h2>
              </CardTitle>
              <CardAction>
                <Link
                  href={`/app/stores/${store.id}/orders`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("allOrders")}
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <EmptyState
                  title={t("noOrders")}
                  description={t("noOrdersBody")}
                />
              ) : (
                <div className="relative overflow-x-auto">
                  <Table className="min-w-[34rem]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={TH}>{t("colOrder")}</TableHead>
                        <TableHead className={TH}>{t("colPlaced")}</TableHead>
                        <TableHead className={TH}>{t("colStatus")}</TableHead>
                        {viaPlatform ? null : <TableHead className={`${TH} text-right`}>{t("colTotal")}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentOrders.map((order) => (
                        <TableRow key={order.id} className="hover:bg-transparent">
                          <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                            <Link
                              href={`/app/stores/${store.id}/orders/${order.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {order.code}
                            </Link>
                            {viaPlatform ? null : (
                              <span className="block text-xs text-muted-foreground">{order.customer.name}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-0 py-2.5 align-top text-muted-foreground">
                            {formatDate(order.createdAt, locale)}
                          </TableCell>
                          <TableCell className="px-0 py-2.5 align-top">
                            <Badge
                              tone={
                                order.status === "exception"
                                  ? "rose"
                                  : order.status === "delivered"
                                    ? "green"
                                    : order.status === "cancelled"
                                      ? "slate"
                                      : "brand"
                              }
                            >
                              {labels(`orderStatus.${order.status}`)}
                            </Badge>
                          </TableCell>
                          {viaPlatform ? null : (
                            <TableCell className="px-0 py-2.5 text-right align-top font-medium tabular-nums text-foreground">
                              {formatMoney(order.total, order.currency, locale)}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("fulfilment")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataList
                rows={[
                  { label: labels("orderStatus.in_production"), value: metrics.inProduction },
                  { label: labels("orderStatus.shipped"), value: metrics.shipped },
                  { label: labels("orderStatus.delivered"), value: metrics.delivered },
                  { label: labels("orderStatus.cancelled"), value: metrics.cancelled },
                  {
                    label: labels("orderStatus.exception"),
                    value:
                      metrics.exceptions > 0 ? (
                        <span className="text-rose-700">{metrics.exceptions}</span>
                      ) : (
                        0
                      ),
                  },
                  ...(viaPlatform
                    ? []
                    : [{ label: t("refunded"), value: formatMoney(metrics.refunded, store.defaultCurrency, locale) }]),
                ]}
              />
            </CardContent>
          </Card>

          {canSource ? (
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("enquiries")}</h2>
                </CardTitle>
                <CardAction>
                  <Link
                    href={`/app/stores/${store.id}/sourcing${enquiries.length > 0 ? "#enquiries" : "?rfq=new#rfq"}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {enquiries.length > 0 ? t("allEnquiries") : t("startOne")}
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                {openEnquiries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {enquiries.length > 0
                      ? t("noOpenEnquiries")
                      : t("noEnquiries")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {openEnquiries.slice(0, 5).map((request) => (
                      <li key={request.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-foreground">
                          <span className="font-mono text-xs text-muted-foreground">{request.code}</span>{" "}
                          {request.productName}
                        </span>
                        <Badge tone={QUOTE_STATUS_TONES[request.status]}>
                          {request.status === "quoted"
                            ? t("toReview", { count: (request.quotes ?? []).length })
                            : labels(`quoteStatus.${request.status}`)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("storefront")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {storefront?.published
                  ? storefront.publishedBy
                    ? t("publishedBy", {
                        date: formatDate(storefront.publishedAt ?? storefront.draftUpdatedAt, locale),
                        name: storefront.publishedBy,
                      })
                    : t("publishedByTeam", { date: formatDate(storefront.publishedAt ?? storefront.draftUpdatedAt, locale) })
                  : t("notPublished")}
              </p>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-5 w-5 rounded border border-border"
                  style={{ background: theme.accent }}
                />
                <span className="text-sm text-inksoft">{labels("themeName", { name: theme.name })}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {roleCan(role, "store.storefront") ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/app/stores/${store.id}/storefront`}>{t("openEditor")}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${store.slug}`} target="_blank" rel="noreferrer">
                    {t("viewStorefront")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("performance")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noPaidOrders")}</p>
              ) : (
                <ol className="divide-y divide-border text-sm">
                  {metrics.topProducts.map((product) => (
                    <li key={product.name} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-foreground">{product.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        <span className="tabular-nums">{t("units", { count: product.units })}</span>
                        {viaPlatform ? null : (
                          <>
                            {" · "}
                            <span className="font-medium tabular-nums text-foreground">
                              {formatMoney(product.revenue, store.defaultCurrency, locale)}
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("recentActivity")}</h2>
              </CardTitle>
              <CardAction>
                <Link
                  href={`/app/stores/${store.id}/activity`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("fullHistory")}
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
              ) : (
                <ol className="divide-y divide-border text-sm">
                  {activity.map((run) => (
                    <li key={run.entry.id} className="py-2.5">
                      <p className="text-foreground">
                        <AuditSummary
                          entry={run.entry}
                          can={can}
                          line={run.count > 1 ? dashboard("repeated", { summary: SUMMARY_SLOT, count: run.count }) : undefined}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.entry.actorName} · {formatAgo(format, run.entry.at, now)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
