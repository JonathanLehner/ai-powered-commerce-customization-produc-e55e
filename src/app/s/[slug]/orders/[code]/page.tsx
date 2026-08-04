import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Callout, DataList } from "@/components/ui";
import { countryName } from "@/lib/countries";
import { getOrderByCode, getStoreBySlug } from "@/lib/data";
import { verifyOrderToken } from "@/lib/order-access";
import { orderTaxRows } from "@/lib/pricing";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { CARRIER_LABELS, formatDateTime, formatMoney } from "@/lib/util";
import { OrderLookupForm } from "../OrderLookupForm";

export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};

const SHOPPER_STATUS: Record<OrderStatus, { label: string; note: string; tone: "brand" | "green" | "amber" | "rose" | "slate" }> = {
  awaiting_payment: { label: "Awaiting payment", note: "We have not received payment for this order yet.", tone: "slate" },
  paid: { label: "Payment received", note: "Your order is queued for production.", tone: "brand" },
  in_production: { label: "In production", note: "Your item is being printed and finished.", tone: "amber" },
  shipped: { label: "Shipped", note: "Your parcel is on its way. Track it with the link below.", tone: "brand" },
  delivered: { label: "Delivered", note: "Your parcel has been delivered. Enjoy it.", tone: "green" },
  cancelled: { label: "Cancelled", note: "This order was cancelled. Any payment has been refunded.", tone: "slate" },
  exception: { label: "Needs attention", note: "There is a hold on this order. The store team is on it and will be in touch.", tone: "rose" },
};

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ new?: string; t?: string }>;
}) {
  const { slug, code } = await params;
  const { new: isNew, t } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  // Nothing about the order — not even whether it exists — is readable without
  // the signed link from checkout or the email address on the order.
  if (!(await verifyOrderToken(store.id, code, t))) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Order status</h1>
        <p className="mt-2 text-sm text-muted">
          To protect delivery and personalisation details, confirm the email address on order{" "}
          <span className="font-medium text-ink">{code}</span> before we show it.
        </p>
        <OrderLookupForm slug={store.slug} code={code} />
      </div>
    );
  }

  const order = await getOrderByCode(store.id, code);
  if (!order) notFound();

  const status = SHOPPER_STATUS[order.status];
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {isNew ? (
        <Callout tone="green" title="Thank you — your order is confirmed">
          We have emailed a confirmation to {order.customer.email}. Keep this page bookmarked to follow
          production and delivery.
        </Callout>
      ) : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Order {order.code}</h1>
          <p className="mt-1 text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <p className="mt-3 rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-inksoft">{status.note}</p>

      {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
        <a
          href={order.fulfillment.trackingUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="btn-primary mt-4"
        >
          Track with {CARRIER_LABELS[order.fulfillment.carrier]} ↗
        </a>
      ) : null}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">What you ordered</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-4 py-4">
              {item.customization.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.customization.previewUrl}
                  alt={`${item.productName} preview`}
                  width={96}
                  height={96}
                  loading="lazy"
                  className="h-24 w-24 shrink-0 rounded-lg border border-line bg-canvas object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.productName}</p>
                <p className="text-xs text-muted">
                  {item.variantName} · quantity {item.quantity}
                </p>
                {item.customization.text ? (
                  <p className="mt-1 text-xs text-inksoft">
                    Personalisation: <span className="font-medium text-ink">{item.customization.text}</span>
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
              { label: "Paid", value: formatMoney(order.total, order.currency) },
              ...(refunded > 0
                ? [{ label: "Refunded", value: `− ${formatMoney(refunded, order.currency)}` }]
                : []),
            ]}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Delivering to</h2>
          <address className="mt-2 not-italic text-sm text-inksoft">
            {order.customer.name}
            <br />
            {order.customer.line1}
            <br />
            {order.customer.city} {order.customer.postalCode}
            <br />
            {countryName(order.customer.country)}
          </address>
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">Payment</h2>
          <p className="mt-2 text-sm text-inksoft">
            {order.payment.last4 ? `Card ending ${order.payment.last4}` : "Card"} ·{" "}
            {order.payment.status === "refunded" ? "refunded" : "paid"} ·{" "}
            {order.payment.paidAt ? formatDateTime(order.payment.paidAt) : ""}
          </p>
          <p className="mt-1 text-xs text-muted">{store.clientName} is the merchant of record.</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">Progress</h2>
        <ol className="mt-3 space-y-4">
          {order.events.map((entry, index) => (
            <li key={index} className="flex gap-3">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div>
                <p className="text-sm font-medium text-ink">{entry.status}</p>
                <p className="text-sm text-inksoft">{entry.note}</p>
                <p className="text-xs text-muted">{formatDateTime(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={`/s/${store.slug}/products`} className="btn-secondary">
          Continue shopping
        </Link>
        <a href={`mailto:${store.clientName.toLowerCase().replace(/\s+/g, "")}@example.com`} className="btn-ghost">
          Contact the store
        </a>
      </div>
    </div>
  );
}
