import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { advanceStatus, resolveException, routeToSupplier } from "@/app/actions/orders";
import { Badge, Breadcrumbs, Callout, DataList, PageHeader } from "@/components/ui";
import { countryName } from "@/lib/countries";
import { getOrder, getSupplier } from "@/lib/data";
import { regionForCountry, routingOptionsFor } from "@/lib/fulfillment";
import { orderTaxRows } from "@/lib/pricing";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { CARRIER_LABELS, formatDateTime, formatMoney } from "@/lib/util";
import {
  ExceptionForm,
  ManualSubmissionForm,
  RefundForm,
  SupplierPickerForm,
  TrackingForm,
} from "./OrderForms";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
}) {
  const { storeId, orderId } = await params;
  const { store, role } = await requireStoreAccess(storeId);
  const canManage = roleCan(role, "store.orders");

  const order = await getOrder(orderId);
  if (!order || order.storeId !== storeId) notFound();
  // Where else this job could go — only needed by the panel an order manager sees.
  const [supplier, routingOptions] = await Promise.all([
    order.fulfillment.supplierId ? getSupplier(order.fulfillment.supplierId) : null,
    canManage ? routingOptionsFor(order, store) : null,
  ]);

  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: `/app/stores/${storeId}` },
          { label: "Orders", href: `/app/stores/${storeId}/orders` },
          { label: order.code },
        ]}
      />

      <PageHeader
        title={order.code}
        description={`${order.customer.name} · ${order.customer.email} · placed ${formatDateTime(order.createdAt)}`}
        actions={
          <>
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
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            <Link
              href={`/s/${store.slug}/orders/${order.code}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              Shopper status page ↗
            </Link>
          </>
        }
      />

      {order.fulfillment.exception ? (
        <Callout tone="rose" title="Supplier exception">
          {order.fulfillment.exception}
          {canManage ? (
            <form action={resolveException} className="mt-3">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="orderId" value={order.id} />
              <button type="submit" className="btn-secondary btn-sm">
                Mark resolved
              </button>
            </form>
          ) : null}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Items</h2>
            <ul className="mt-4 divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex flex-wrap gap-4 py-4">
                  {item.customization.previewUrl ? (
                    <Image
                      src={item.customization.previewUrl}
                      alt={`${item.productName} preview`}
                      width={96}
                      height={96}
                      sizes="96px"
                      className="h-24 w-24 shrink-0 rounded-lg border border-line bg-canvas object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.productName}</p>
                    <p className="text-xs text-muted">{item.variantName}</p>
                    <p className="mt-1 text-xs text-muted">
                      Quantity {item.quantity} · {formatMoney(item.unitPrice, order.currency)} each · supplier
                      cost {formatMoney(item.supplierCost, order.currency)}
                    </p>
                    {item.customization.text ? (
                      <p className="mt-1.5 text-xs text-inksoft">
                        Personalisation: <span className="font-medium text-ink">{item.customization.text}</span>
                      </p>
                    ) : null}
                    {item.customization.artworkFileName ? (
                      <p className="mt-1 text-xs text-muted">
                        Artwork:{" "}
                        {item.customization.artworkUrl ? (
                          <a
                            href={item.customization.artworkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {item.customization.artworkFileName} ↗
                          </a>
                        ) : (
                          item.customization.artworkFileName
                        )}
                      </p>
                    ) : null}
                    {item.customization.artworkPlacement ? (
                      <p className="mt-1 text-xs text-muted">
                        Placement: {Math.round(item.customization.artworkPlacement.x * 100)}% across,{" "}
                        {Math.round(item.customization.artworkPlacement.y * 100)}% down, at{" "}
                        {Math.round(item.customization.artworkPlacement.scale * 100)}% of the print area
                        {item.customization.artworkPlacement.rotation
                          ? `, rotated ${Math.round(item.customization.artworkPlacement.rotation)}°`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(item.unitPrice * item.quantity, order.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-line pt-4">
              <DataList
                rows={[
                  { label: "Subtotal", value: formatMoney(order.subtotal, order.currency) },
                  { label: "Shipping", value: formatMoney(order.shipping, order.currency) },
                  ...orderTaxRows(order).map((row) => ({
                    label: `Tax ${row.rate}%`,
                    value: formatMoney(row.amount, order.currency),
                  })),
                  {
                    label: "Total",
                    value: <span className="text-base">{formatMoney(order.total, order.currency)}</span>,
                  },
                  ...(refunded > 0
                    ? [{ label: "Refunded", value: `− ${formatMoney(refunded, order.currency)}` }]
                    : []),
                ]}
              />
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Fulfilment timeline</h2>
            <ol className="mt-4 space-y-4">
              {order.events.map((entry, index) => (
                <li key={index} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{entry.status}</p>
                    <p className="text-sm text-inksoft">{entry.note}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(entry.at)} · {entry.actor}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {canManage ? (
            <section className="card p-5">
              <h2 className="text-base font-semibold text-ink">Manual fulfilment steps</h2>
              <p className="mt-1 text-sm text-muted">
                Use these when a supplier has no order API, or when something needs correcting by hand.
              </p>

              <div className="mt-5 space-y-6">
                <div className="rounded-xl border border-line p-4">
                  <h3 className="text-sm font-semibold text-ink">Supplier routing</h3>
                  <p className="mt-1 text-xs text-muted">
                    {order.fulfillment.submissionMessage ?? "This order has not been routed yet."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={routeToSupplier}>
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <button type="submit" className="btn-secondary btn-sm">
                        Re-run automatic routing
                      </button>
                    </form>
                  </div>
                  {routingOptions ? (
                    <div className="mt-5 border-t border-line pt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {routingOptions.available.length === 0
                          ? "Alternative production partners"
                          : order.fulfillment.routing === "submitted"
                            ? "Move production elsewhere"
                            : "Choose a production partner"}
                      </h4>
                      <SupplierPickerForm order={order} options={routingOptions} />
                    </div>
                  ) : null}
                  {order.fulfillment.routing !== "submitted" ? (
                    <div className="mt-5 border-t border-line pt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Purchase order raised by hand
                      </h4>
                      <div className="mt-3">
                        <ManualSubmissionForm order={order} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-line p-4">
                  <h3 className="text-sm font-semibold text-ink">Shipment</h3>
                  <TrackingForm order={order} store={store} />
                </div>

                <div className="rounded-xl border border-line p-4">
                  <h3 className="text-sm font-semibold text-ink">Status</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["in_production", "shipped", "delivered", "cancelled"] as const).map((status) => (
                      <form key={status} action={advanceStatus}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={status} />
                        <button
                          type="submit"
                          className={order.status === status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                          disabled={order.status === status}
                        >
                          {ORDER_STATUS_LABELS[status]}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-line p-4">
                  <h3 className="text-sm font-semibold text-ink">Raise an exception</h3>
                  <ExceptionForm order={order} />
                </div>

                <div className="rounded-xl border border-rose-200 p-4">
                  <h3 className="text-sm font-semibold text-ink">Refund or cancel</h3>
                  <p className="mt-1 text-xs text-muted">
                    Refunds are issued against the store&rsquo;s own Stripe account. Already refunded:{" "}
                    {formatMoney(refunded, order.currency)}.
                  </p>
                  <div className="mt-3">
                    <RefundForm order={order} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Delivery</h2>
            <address className="mt-3 not-italic text-sm text-inksoft">
              {order.customer.name}
              <br />
              {order.customer.line1}
              <br />
              {order.customer.city} {order.customer.postalCode}
              <br />
              {countryName(order.customer.country)} ({order.customer.country}) ·{" "}
              {regionForCountry(order.customer.country)}
            </address>
            {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
              <a
                href={order.fulfillment.trackingUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm mt-4"
              >
                Track with {CARRIER_LABELS[order.fulfillment.carrier]} ↗
              </a>
            ) : (
              <p className="mt-4 text-xs text-muted">No tracking number yet.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Payment</h2>
            <DataList
              rows={[
                { label: "Provider", value: "Stripe" },
                {
                  label: "Status",
                  value: (
                    <Badge tone={order.payment.status === "succeeded" ? "green" : order.payment.status === "refunded" ? "slate" : "amber"}>
                      {order.payment.status}
                    </Badge>
                  ),
                },
                { label: "Account", value: <span className="font-mono text-xs">{order.payment.stripeAccountId}</span> },
                { label: "Intent", value: <span className="font-mono text-xs">{order.payment.paymentIntentId}</span> },
                { label: "Card", value: order.payment.last4 ? `•••• ${order.payment.last4}` : "—" },
                { label: "Paid", value: order.payment.paidAt ? formatDateTime(order.payment.paidAt) : "—" },
              ]}
            />
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Production</h2>
            <DataList
              rows={[
                { label: "Supplier", value: order.fulfillment.supplierName ?? "Not assigned" },
                {
                  label: "Integration",
                  value: supplier ? (supplier.integration === "api" ? "Order API" : "Manual") : "—",
                },
                {
                  label: "Routing",
                  value: (
                    <Badge
                      tone={
                        order.fulfillment.routing === "submitted"
                          ? "green"
                          : order.fulfillment.routing === "failed"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {order.fulfillment.routing.replace("_", " ")}
                    </Badge>
                  ),
                },
                { label: "Supplier reference", value: order.fulfillment.supplierOrderRef ?? "—" },
                {
                  label: "Submitted",
                  value: order.fulfillment.submittedAt ? formatDateTime(order.fulfillment.submittedAt) : "—",
                },
                {
                  label: "Lead time",
                  value: supplier ? `${supplier.leadTimeDays[0]}–${supplier.leadTimeDays[1]} days` : "—",
                },
                ...(order.fulfillment.reroute
                  ? [
                      {
                        label: "Rerouted",
                        value: `${order.fulfillment.reroute.actor} · ${formatDateTime(order.fulfillment.reroute.at)}`,
                      },
                      {
                        label: "Moved from",
                        value: order.fulfillment.reroute.fromSupplierName ?? "Unassigned",
                      },
                      { label: "Reason", value: order.fulfillment.reroute.reason },
                    ]
                  : []),
              ]}
            />
          </section>

          {order.refunds.length > 0 ? (
            <section className="card p-5">
              <h2 className="text-base font-semibold text-ink">Refunds</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="py-2.5">
                    <p className="font-medium tabular-nums text-ink">
                      {formatMoney(refund.amount, order.currency)}
                    </p>
                    <p className="text-xs text-muted">
                      {refund.reason} · {refund.actor} · {formatDateTime(refund.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
