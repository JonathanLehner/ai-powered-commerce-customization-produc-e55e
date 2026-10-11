import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { advanceStatus, resolveException, routeToSupplier } from "@/app/actions/orders";
import { Breadcrumbs, Callout, DataList, Dot, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/i18n/display";
import { getOrder, getSupplier } from "@/lib/data";
import { regionForCountry, routingOptionsFor } from "@/lib/fulfillment";
import { orderTaxRows } from "@/lib/pricing";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { canMoveOrder, type FulfillmentEvent } from "@/lib/types";
import { CARRIER_LABELS, formatDateTime, formatMoney } from "@/lib/util";
import {
  ExceptionForm,
  ManualSubmissionForm,
  RefundForm,
  SupplierPickerForm,
  TrackingForm,
} from "./OrderForms";

/** Timeline entries shown before "Show all". */
const TIMELINE_PREVIEW = 5;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
}) {
  const { storeId, orderId } = await params;
  const { store, role, viaPlatform } = await requireStoreAccess(storeId);
  const canManage = roleCan(role, "store.orders");

  const order = await getOrder(orderId);
  if (!order || order.storeId !== storeId)
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;
  // Where else this job could go — only needed by the panel an order manager sees.
  const [supplier, routingOptions] = await Promise.all([
    order.fulfillment.supplierId ? getSupplier(order.fulfillment.supplierId) : null,
    canManage ? routingOptionsFor(order, store) : null,
  ]);

  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const [t, labels, locale] = await Promise.all([
    getTranslations("orderDetail"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const orders = await getTranslations("orders");
  const money = (minor: number) => formatMoney(minor, order.currency, locale);
  const when = (iso: string) => formatDateTime(iso, locale);
  const region = (code: string) => {
    const name = regionForCountry(code);
    return labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;
  };

  const latestEvents = order.events.slice(-TIMELINE_PREVIEW);
  const earlierEvents = order.events.slice(0, -TIMELINE_PREVIEW);
  const renderEvent = (entry: FulfillmentEvent, index: number) => (
    <li key={index} className="flex gap-3">
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{entry.status}</p>
        {/* Notes quote amounts and, on a refund, the reason the team
            wrote. Platform access sees the step, not the wording. */}
        {viaPlatform ? null : <p className="text-sm text-inksoft">{entry.note}</p>}
        {/* A step a shopper took is recorded under their own name,
            so platform access reads the step and when, not who. */}
        <p className="text-xs text-muted-foreground">
          {when(entry.at)}
          {viaPlatform ? null : ` · ${entry.actor}`}
        </p>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: `/app/stores/${storeId}` },
          { label: t("orders"), href: `/app/stores/${storeId}/orders` },
          { label: order.code },
        ]}
      />

      <PageHeader
        title={order.code}
        description={
          viaPlatform || order.customer.anonymisedAt
            ? t("placed", { date: when(order.createdAt) })
            : t("placedBy", { name: order.customer.name, email: order.customer.email, date: when(order.createdAt) })
        }
        actions={
          <>
            <Badge variant="outline" className="gap-1.5">
              <Dot
                tone={
                  order.status === "exception"
                    ? "rose"
                    : order.status === "delivered"
                      ? "green"
                      : order.status === "cancelled"
                        ? "slate"
                        : "brand"
                }
              />
              {labels(`orderStatus.${order.status}`)}
            </Badge>
            {viaPlatform ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${store.slug}/orders/${order.code}`} target="_blank" rel="noreferrer">
                  {t("shopperPage")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {order.fulfillment.exception ? (
        <Callout tone="rose" title={t("exceptionTitle")}>
          {viaPlatform
            ? t("exceptionHidden")
            : order.fulfillment.exception}
          {canManage ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={resolveException}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="orderId" value={order.id} />
                <Button type="submit" variant="outline" size="sm">
                  {t("markResolved")}
                </Button>
              </form>
              {routingOptions ? (
                <Button asChild size="sm">
                  <a href="#supplier-picker">{t("rerouteSupplier")}</a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("items")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border border-t border-border">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap gap-4 py-4">
                      {item.customization.previewUrl && !viaPlatform ? (
                        <Image
                          src={item.customization.previewUrl}
                          alt={t("previewAlt", { name: item.productName })}
                          width={96}
                          height={96}
                          sizes="96px"
                          className="h-24 w-24 shrink-0 rounded-lg border border-border bg-muted object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.variantName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {viaPlatform
                            ? t("quantity", { count: item.quantity })
                            : t("quantityPrices", {
                                count: item.quantity,
                                price: money(item.unitPrice),
                                cost: money(item.supplierCost),
                              })}
                        </p>
                        {item.customization.text && !viaPlatform ? (
                          <p className="mt-1.5 text-xs text-inksoft">
                            {t("personalisation")}{" "}
                            <span className="font-medium text-foreground">{item.customization.text}</span>
                          </p>
                        ) : null}
                        {item.customization.artworkFileName && !viaPlatform ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("artwork")}{" "}
                            {item.customization.artworkUrl ? (
                              <a
                                href={item.customization.artworkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-primary hover:underline"
                              >
                                {item.customization.artworkFileName} ↗
                              </a>
                            ) : (
                              item.customization.artworkFileName
                            )}
                          </p>
                        ) : null}
                        {item.customization.artworkPlacement ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("placement", {
                              x: Math.round(item.customization.artworkPlacement.x * 100),
                              y: Math.round(item.customization.artworkPlacement.y * 100),
                              scale: Math.round(item.customization.artworkPlacement.scale * 100),
                            })}
                            {item.customization.artworkPlacement.rotation
                              ? t("rotated", { degrees: Math.round(item.customization.artworkPlacement.rotation) })
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      {viaPlatform ? null : (
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {money(item.unitPrice * item.quantity)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 border-t border-border pt-4">
                  {viaPlatform ? (
                    <p className="text-sm text-muted-foreground">
                      {t("lines", { count: order.items.length })}
                    </p>
                  ) : (
                    <DataList
                      rows={[
                        { label: t("subtotal"), value: money(order.subtotal) },
                        { label: t("shipping"), value: money(order.shipping) },
                        ...(order.discount
                          ? [
                              {
                                label: t("discount", { code: order.discount.code }),
                                value: `− ${money(order.discount.amount)}`,
                              },
                            ]
                          : []),
                        ...orderTaxRows(order).map((row) => ({
                          label: t("tax", { rate: row.rate }),
                          value: money(row.amount),
                        })),
                        {
                          label: t("total"),
                          value: <span className="text-base">{money(order.total)}</span>,
                        },
                        ...(refunded > 0
                          ? [{ label: t("refunded"), value: `− ${money(refunded)}` }]
                          : []),
                      ]}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("timeline")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Oldest first, as recorded. The latest few stay in view; earlier
                    steps open above them on request. */}
                {earlierEvents.length > 0 ? (
                  <details className="group mb-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">{t("showAllEvents", { count: order.events.length })}</span>
                      <span className="hidden group-open:inline">{t("showLatestEvents", { count: latestEvents.length })}</span>
                    </summary>
                    <ol className="mt-4 space-y-4">
                      {earlierEvents.map((entry, index) => renderEvent(entry, index))}
                    </ol>
                  </details>
                ) : null}
                <ol className="space-y-4">
                  {latestEvents.map((entry, index) => renderEvent(entry, earlierEvents.length + index))}
                </ol>
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          {canManage ? (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>{t("manualSteps")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 @container">
                  <div className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("supplierRouting")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.fulfillment.submissionMessage ?? t("notRouted")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={routeToSupplier}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <Button type="submit" variant="outline" size="sm">
                          {t("rerun")}
                        </Button>
                      </form>
                    </div>
                    {routingOptions ? (
                      <div id="supplier-picker" className="mt-5 scroll-mt-24 border-t border-border pt-4">
                        <h4 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                          {routingOptions.available.length === 0
                            ? t("alternatives")
                            : order.fulfillment.routing === "submitted"
                              ? t("moveElsewhere")
                              : t("choosePartner")}
                        </h4>
                        <SupplierPickerForm order={order} options={routingOptions} />
                      </div>
                    ) : null}
                    {order.fulfillment.routing !== "submitted" ? (
                      <div className="mt-5 border-t border-border pt-4">
                        <h4 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                          {t("manualPo")}
                        </h4>
                        <div className="mt-3">
                          <ManualSubmissionForm order={order} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("shipment")}</h3>
                    <div className="mt-3">
                      <TrackingForm order={order} store={store} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("status")}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["in_production", "shipped", "delivered", "cancelled"] as const).map((status) => (
                        <form key={status} action={advanceStatus}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="status" value={status} />
                          <Button
                            type="submit"
                            size="sm"
                            variant={order.status === status ? "default" : "outline"}
                            disabled={!canMoveOrder(order, status)}
                          >
                            {labels(`orderStatus.${status}`)}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("raiseTitle")}</h3>
                    <div className="mt-3">
                      <ExceptionForm order={order} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-destructive/30 p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("refundTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("refundedSoFar", { amount: money(refunded) })}
                    </p>
                    <div className="mt-3">
                      <RefundForm order={order} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("delivery")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {viaPlatform ? (
                  // The fulfilment region is what routes the job; the address itself
                  // is a shopper record and stays with the store team.
                  <p className="text-sm text-inksoft">
                    {t("addressWithheld")}{" "}
                    <span className="font-medium text-foreground">
                      {region(order.customer.country)}
                    </span>
                    .
                  </p>
                ) : order.customer.anonymisedAt ? (
                  <p className="text-sm text-inksoft">
                    {t("dataDeleted")}
                    <br />
                    {countryName(locale, order.customer.country)} ({order.customer.country})
                  </p>
                ) : (
                  <address className="text-sm not-italic text-inksoft">
                    {order.customer.name}
                    <br />
                    {order.customer.line1}
                    <br />
                    {order.customer.line2 ? (
                      <>
                        {order.customer.line2}
                        <br />
                      </>
                    ) : null}
                    {[order.customer.city, order.customer.region, order.customer.postalCode].filter(Boolean).join(" ")}
                    <br />
                    {countryName(locale, order.customer.country)} ({order.customer.country}) ·{" "}
                    {region(order.customer.country)}
                    {order.customer.phone ? (
                      <>
                        <br />
                        {order.customer.phone}
                      </>
                    ) : null}
                  </address>
                )}
                {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <a href={order.fulfillment.trackingUrl ?? "#"} target="_blank" rel="noreferrer">
                      {t("trackWith", { carrier: CARRIER_LABELS[order.fulfillment.carrier] })}
                    </a>
                  </Button>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">{t("noTracking")}</p>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("payment")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataList
                  rows={[
                    { label: t("provider"), value: "Stripe" },
                    {
                      label: t("status"),
                      value: (
                        <Badge variant="outline" className="gap-1.5">
                          <Dot
                            tone={
                              order.payment.status === "succeeded"
                                ? "green"
                                : order.payment.status === "refunded"
                                  ? "slate"
                                  : "amber"
                            }
                          />
                          {labels(`paymentStatus.${order.payment.status}`)}
                        </Badge>
                      ),
                    },
                    ...(viaPlatform
                      ? []
                      : [
                          {
                            label: t("intent"),
                            value: <span className="font-mono text-xs">{order.payment.paymentIntentId}</span>,
                          },
                          { label: t("card"), value: order.payment.last4 ? `•••• ${order.payment.last4}` : "–" },
                        ]),
                    { label: t("paid"), value: order.payment.paidAt ? when(order.payment.paidAt) : "–" },
                  ]}
                />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("production")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataList
                  rows={[
                    { label: t("supplier"), value: order.fulfillment.supplierName ?? t("notAssigned") },
                    {
                      label: t("integration"),
                      value: supplier ? (supplier.integration === "api" ? t("orderApi") : t("manual")) : "–",
                    },
                    {
                      label: t("routing"),
                      value: (
                        <Badge variant="outline" className="gap-1.5">
                          <Dot
                            tone={
                              order.fulfillment.routing === "submitted"
                                ? "green"
                                : order.fulfillment.routing === "failed"
                                  ? "rose"
                                  : "amber"
                            }
                          />
                          {orders(`routing.${order.fulfillment.routing}`)}
                        </Badge>
                      ),
                    },
                    { label: t("supplierRef"), value: order.fulfillment.supplierOrderRef ?? "–" },
                    {
                      label: t("submitted"),
                      value: order.fulfillment.submittedAt ? when(order.fulfillment.submittedAt) : "–",
                    },
                    {
                      label: t("leadTime"),
                      value: supplier
                        ? t("leadDays", { min: supplier.leadTimeDays[0], max: supplier.leadTimeDays[1] })
                        : "–",
                    },
                    ...(order.fulfillment.reroute
                      ? [
                          {
                            label: t("rerouted"),
                            value: `${order.fulfillment.reroute.actor} · ${when(order.fulfillment.reroute.at)}`,
                          },
                          {
                            label: t("movedFrom"),
                            value: order.fulfillment.reroute.fromSupplierName ?? t("unassigned"),
                          },
                          { label: t("reason"), value: order.fulfillment.reroute.reason },
                        ]
                      : []),
                  ]}
                />
              </CardContent>
            </Card>
          </section>

          {order.refunds.length > 0 ? (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>{t("refunds")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border border-t border-border text-sm">
                    {order.refunds.map((refund) => (
                      <li key={refund.id} className="py-2.5">
                        <p className="font-medium tabular-nums text-foreground">
                          {viaPlatform ? t("refundIssued") : money(refund.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {refund.reason} · {refund.actor} · {when(refund.at)}
                        </p>
                        {refund.gatewayRefundId ? (
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {refund.gatewayRefundId}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
