import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { advanceStatus, resolveException, routeToSupplier } from "@/app/actions/orders";
import { Breadcrumbs, Callout, DataList, Dot, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/i18n/display";
import { getOrder, getOrderByCode, getSupplier } from "@/lib/data";
import { regionForCountry, routingOptionsFor } from "@/lib/fulfillment";
import { orderInvoiceUrl, signOrderToken } from "@/lib/order-access";
import { orderTax } from "@/lib/shipping";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { canMoveOrder } from "@/lib/types";
import { collapseRepeats, type CollapsedEvent } from "@/lib/order-timeline";
import { CARRIER_LABELS, formatDateTime, formatMoney } from "@/lib/util";
import { giftCardLineIds } from "@/lib/gift-card-data";
import { canEditAddress, fulfilmentState, remainingQuantities, shippedQuantities } from "@/lib/order-ops";
import {
  AddressForm,
  ExceptionForm,
  ManualSubmissionForm,
  OrderNotesForm,
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
  if (!order || order.storeId !== storeId) {
    // The activity log names orders by code, so a code opens the order too.
    const byCode = orderId.startsWith("ORD-") ? await getOrderByCode(storeId, orderId) : null;
    if (byCode) redirect(`/app/stores/${storeId}/orders/${byCode.id}`);
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;
  }
  // Where else this job could go — only needed by the panel an order manager sees.
  const [supplier, routingOptions, giftLines] = await Promise.all([
    order.fulfillment.supplierId ? getSupplier(order.fulfillment.supplierId) : null,
    canManage ? routingOptionsFor(order, store) : null,
    giftCardLineIds(order),
  ]);
  // What has gone out and what is left, per line. Gift cards go by email.
  const shipped = shippedQuantities(order);
  const remaining = remainingQuantities(order, giftLines);
  const fulfilment = fulfilmentState(order, giftLines);
  const shipments = order.shipments ?? [];
  const shippable =
    order.status === "paid" || order.status === "in_production" || order.status === "exception" || order.status === "shipped";
  const shippableLines = order.items
    .filter((item) => remaining.has(item.id))
    .map((item) => ({ itemId: item.id, name: item.productName, variant: item.variantName, left: remaining.get(item.id)! }));
  const slipHref = (shipmentId?: string) =>
    `/app/stores/${storeId}/orders/${order.id}/packing-slip${shipmentId ? `?shipment=${shipmentId}` : ""}`;

  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const tax = orderTax(order);
  const invoiceHref = orderInvoiceUrl(`/s/${store.slug}`, order.code, await signOrderToken(store.id, order.code));
  const [t, labels, locale] = await Promise.all([
    getTranslations("orderDetail"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const orders = await getTranslations("orders");
  const money = (minor: number) => formatMoney(minor, order.currency, locale);
  const when = (iso: string) => formatDateTime(iso, locale);
  const regionLabel = (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;
  const region = (code: string) => regionLabel(regionForCountry(code));

  // While an exception is open the order is not in production anywhere,
  // whatever routing last recorded.
  const exceptionOpen = order.status === "exception" || Boolean(order.fulfillment.exception);
  // Nobody approved can make this order for its destination: rerouting is not
  // an option, so the page names the ones that are.
  const noPartner = routingOptions ? routingOptions.available.length === 0 : false;
  // Not even by a purchase order raised by hand.
  const noCover = noPartner && !routingOptions?.manualOnly.length;
  const timeline = collapseRepeats(order.events);
  const latestEvents = timeline.slice(-TIMELINE_PREVIEW);
  const earlierEvents = timeline.slice(0, -TIMELINE_PREVIEW);
  const renderEvent = (entry: CollapsedEvent, index: number) => (
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
          {entry.count > 1 ? ` · ${t("repeated", { count: entry.count, date: when(entry.firstAt) })}` : null}
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
            {fulfilment === "partial" && order.status !== "cancelled" ? (
              <Badge variant="outline" className="gap-1.5">
                <Dot tone="amber" />
                {t("partiallyShipped")}
              </Badge>
            ) : null}
            {viaPlatform ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${store.slug}/orders/${order.code}`} target="_blank" rel="noreferrer">
                  {t("shopperPage")}
                </Link>
              </Button>
            )}
            {viaPlatform || order.status === "awaiting_payment" ? null : (
              <Button asChild variant="outline" size="sm">
                <a href={invoiceHref} target="_blank" rel="noreferrer">
                  {t("invoice")}
                </a>
              </Button>
            )}
            {viaPlatform || order.status === "awaiting_payment" || order.status === "cancelled" ? null : (
              <Button asChild variant="outline" size="sm">
                <a href={slipHref()} target="_blank" rel="noreferrer">
                  {t("packingSlip")}
                </a>
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
          {canManage && routingOptions && noPartner ? (
            <div className="mt-2">
              <p>
                {t("noSupplierFor", {
                  needs: routingOptions.requirements.map((r) => r.label).join(", ") || t("theseItems"),
                  destination: routingOptions.destination,
                })}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>{t("optionRefund")}</li>
                <li>{t("optionAdmin", { region: regionLabel(routingOptions.region) })}</li>
              </ul>
            </div>
          ) : null}
          {canManage ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={resolveException}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="orderId" value={order.id} />
                <Button type="submit" variant="outline" size="sm">
                  {t("markResolved")}
                </Button>
              </form>
              {routingOptions && !noPartner ? (
                <Button asChild size="sm">
                  <a href="#supplier-picker">{t("rerouteSupplier")}</a>
                </Button>
              ) : null}
              {noPartner ? (
                <Button asChild size="sm">
                  <a href="#refund">{t("refundTitle")}</a>
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
                        {!giftLines.has(item.id) && (shipped.get(item.id) ?? 0) > 0 && (shipped.get(item.id) ?? 0) < item.quantity ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            {t("shippedOf", { shipped: shipped.get(item.id) ?? 0, count: item.quantity })}
                          </p>
                        ) : null}
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
                        {
                          label: order.shippingRate ? t("shippingWith", { rate: order.shippingRate.name }) : t("shipping"),
                          value: money(order.shipping),
                        },
                        ...(order.discount
                          ? [
                              {
                                label: t("discount", { code: order.discount.code }),
                                value: `− ${money(order.discount.amount)}`,
                              },
                            ]
                          : []),
                        ...tax.rows.map((row) => ({
                          label:
                            row.rate === null
                              ? tax.inclusive
                                ? t("taxIncludedPlain")
                                : t("taxPlain")
                              : tax.inclusive
                                ? t("taxIncluded", { rate: row.rate })
                                : t("tax", { rate: row.rate }),
                          value: money(row.amount),
                        })),
                        {
                          label: t("total"),
                          value: <span className="text-base">{money(order.total)}</span>,
                        },
                        // Charged in another currency: what it came to in the store's own.
                        ...(order.shopCurrency && order.shopCurrency !== order.currency && order.shopTotal !== undefined
                          ? [
                              {
                                label: t("shopTotal", { currency: order.shopCurrency }),
                                value: formatMoney(order.shopTotal, order.shopCurrency, locale),
                              },
                            ]
                          : []),
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
                      <span className="group-open:hidden">{t("showAllEvents", { count: timeline.length })}</span>
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
                    {order.fulfillment.routing !== "submitted" && !(exceptionOpen && noCover) ? (
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
                    {shipments.length > 0 ? (
                      <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
                        {shipments.map((shipment, index) => (
                          <li key={shipment.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {t("parcel", { number: index + 1 })} · {CARRIER_LABELS[shipment.carrier]}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                                  {shipment.trackingNumber}
                                </a>{" "}
                                · {when(shipment.at)}
                              </p>
                              <p className="mt-0.5 text-xs text-inksoft">
                                {shipment.lines
                                  .map((line) => {
                                    const item = order.items.find((i) => i.id === line.itemId);
                                    return `${item?.productName ?? ""} × ${line.quantity}`;
                                  })
                                  .join(", ")}
                              </p>
                            </div>
                            <Button asChild variant="ghost" size="sm">
                              <a href={slipHref(shipment.id)} target="_blank" rel="noreferrer">
                                {t("packingSlip")}
                              </a>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {shippable ? (
                      <div className="mt-3">
                        <TrackingForm order={order} store={store} lines={shippableLines} />
                      </div>
                    ) : shipments.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t("notShippable")}</p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("status")}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[...(order.status === "exception" ? (["exception"] as const) : []), ...(["in_production", "shipped", "delivered", "cancelled"] as const)].map((status) => (
                        <form key={status} action={advanceStatus}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="status" value={status} />
                          <Button
                            type="submit"
                            size="sm"
                            variant={order.status === status ? "default" : "outline"}
                            disabled={!canMoveOrder(order, status) || (status === "in_production" && exceptionOpen)}
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

                  <div id="refund" className="scroll-mt-24 rounded-xl border border-destructive/30 p-4">
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

          {canManage && !viaPlatform ? (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>{t("notesTitle")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {order.tags?.length ? (
                    <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={t("tags")}>
                      {order.tags.map((tag) => (
                        <li key={tag}>
                          <Badge variant="secondary">{tag}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <OrderNotesForm order={order} />
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
                {canManage && !viaPlatform && canEditAddress(order) ? (
                  <details className="group mt-4 border-t border-border pt-4 @container">
                    <summary className="cursor-pointer list-none text-sm font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                      {t("editAddress")}
                    </summary>
                    <div className="mt-3">
                      <AddressForm order={order} />
                    </div>
                  </details>
                ) : null}
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
                              exceptionOpen || order.fulfillment.routing === "failed"
                                ? "rose"
                                : order.fulfillment.routing === "submitted"
                                  ? "green"
                                  : "amber"
                            }
                          />
                          {exceptionOpen ? labels("orderStatus.exception") : orders(`routing.${order.fulfillment.routing}`)}
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
