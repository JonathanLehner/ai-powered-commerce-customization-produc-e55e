import type { Metadata } from "next";
import Link from "next/link";
import { StorefrontNotFoundView, UnknownStoreView } from "@/components/NotFoundViews";
import { Badge, Callout, DataList } from "@/components/ui";
import { localCountryName } from "@/lib/countries";
import { getOrderByCode, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale, type StorefrontCopy } from "@/lib/i18n";
import { verifyOrderToken } from "@/lib/order-access";
import { orderTaxRows } from "@/lib/pricing";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import type { OrderStatus } from "@/lib/types";
import { CARRIER_LABELS } from "@/lib/util";
import { OrderLookupForm } from "../OrderLookupForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return {
    title: store ? storefrontLocale(store).t.order.title : "Order status",
    robots: { index: false, follow: false },
  };
}

/** What each order state means for the shopper, in the storefront's language. */
const SHOPPER_STATUS: Record<
  OrderStatus,
  {
    label: keyof StorefrontCopy["status"];
    note: keyof StorefrontCopy["status"];
    tone: "brand" | "green" | "amber" | "rose" | "slate";
  }
> = {
  awaiting_payment: { label: "awaitingPayment", note: "awaitingPaymentNote", tone: "slate" },
  paid: { label: "paid", note: "paidNote", tone: "brand" },
  in_production: { label: "inProduction", note: "inProductionNote", tone: "amber" },
  shipped: { label: "shipped", note: "shippedNote", tone: "brand" },
  delivered: { label: "delivered", note: "deliveredNote", tone: "green" },
  cancelled: { label: "cancelled", note: "cancelledNote", tone: "slate" },
  exception: { label: "exception", note: "exceptionNote", tone: "rose" },
};

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ new?: string; t?: string }>;
}) {
  const { slug, code } = await params;
  const { new: isNew, t: token } = await searchParams;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;
  const { t, tag: localeTag, money, dateTime } = storefrontLocale(store);

  // Nothing about the order — not even whether it exists — is readable without
  // the signed link from checkout or the email address on the order.
  if (!(await verifyOrderToken(store.id, code, token))) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.order.title}</h1>
        <p className="mt-2 text-sm text-muted">{fmt(t.order.gateBody, { code })}</p>
        <OrderLookupForm slug={store.slug} code={code} t={t.order} />
      </div>
    );
  }

  const order = await getOrderByCode(store.id, code);
  // The token verified but the order is gone: the store's own not-found page.
  if (!order) return <StorefrontNotFoundView store={store} />;

  const status = SHOPPER_STATUS[order.status];
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const support = storeSupport(store);
  const contactSubject = fmt(t.order.contactSubject, { code: order.code });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {isNew ? (
        // No order email is sent, so this page — and the lookup below it — is
        // the shopper's only way back to the order. The banner says so.
        <Callout tone="green" title={t.order.confirmedTitle}>
          <p>{t.order.confirmedBody}</p>
          <p className="mt-1">
            {fmt(t.order.confirmedFindAgain, {
              code: order.code,
              email: order.customer.email,
            })}
          </p>
        </Callout>
      ) : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {fmt(t.order.heading, { code: order.code })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {fmt(t.order.placed, { when: dateTime(order.createdAt) })}
          </p>
        </div>
        <Badge tone={status.tone}>{t.status[status.label]}</Badge>
      </div>

      <p className="mt-3 rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-inksoft">
        {t.status[status.note]}
      </p>

      {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
        <a
          href={order.fulfillment.trackingUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="btn-primary mt-4"
        >
          {fmt(t.order.trackWith, { carrier: CARRIER_LABELS[order.fulfillment.carrier] })}
        </a>
      ) : null}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">{t.order.whatYouOrdered}</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-4 py-4">
              {item.customization.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.customization.previewUrl}
                  alt={fmt(t.order.previewAlt, { name: item.productName })}
                  width={96}
                  height={96}
                  loading="lazy"
                  className="h-24 w-24 shrink-0 rounded-lg border border-line bg-canvas object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.productName}</p>
                <p className="text-xs text-muted">
                  {fmt(t.order.variantQuantity, {
                    variant: item.variantName,
                    count: item.quantity,
                  })}
                </p>
                {item.customization.text ? (
                  <p className="mt-1 text-xs text-inksoft">
                    {t.order.personalisation}{" "}
                    <span className="font-medium text-ink">{item.customization.text}</span>
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {money(item.unitPrice * item.quantity, order.currency)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-line pt-4">
          <DataList
            rows={[
              { label: t.order.subtotal, value: money(order.subtotal, order.currency) },
              { label: t.order.shipping, value: money(order.shipping, order.currency) },
              ...orderTaxRows(order).map((row) => ({
                label: fmt(t.order.taxRow, { rate: row.rate }),
                value: money(row.amount, order.currency),
              })),
              { label: t.order.paid, value: money(order.total, order.currency) },
              ...(refunded > 0
                ? [{ label: t.order.refunded, value: `− ${money(refunded, order.currency)}` }]
                : []),
            ]}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{t.order.deliveringTo}</h2>
          <address className="mt-2 not-italic text-sm text-inksoft">
            {order.customer.name}
            <br />
            {order.customer.line1}
            <br />
            {order.customer.city} {order.customer.postalCode}
            <br />
            {localCountryName(order.customer.country, localeTag)}
          </address>
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">{t.order.payment}</h2>
          <p className="mt-2 text-sm text-inksoft">
            {order.payment.last4
              ? fmt(t.order.cardEnding, { last4: order.payment.last4 })
              : t.order.card}{" "}
            · {order.payment.status === "refunded" ? t.order.refundedWord : t.order.paidWord} ·{" "}
            {order.payment.paidAt ? dateTime(order.payment.paidAt) : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            {fmt(t.order.merchantOfRecord, { client: store.clientName })}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">{t.order.progress}</h2>
        <ol className="mt-3 space-y-4">
          {order.events.map((entry, index) => (
            <li key={index} className="flex gap-3">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div>
                <p className="text-sm font-medium text-ink">{entry.status}</p>
                <p className="text-sm text-inksoft">{entry.note}</p>
                <p className="text-xs text-muted">{dateTime(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 rounded-xl border border-line bg-canvas px-4 py-4">
        <h2 className="text-base font-semibold text-ink">{t.order.supportTitle}</h2>
        {support.email || support.phone ? (
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
            {support.email ? (
              <>
                <dt className="text-muted">{t.chrome.supportEmailLabel}</dt>
                <dd>
                  <a href={supportMailto(support.email, contactSubject)} className="text-ink hover:underline">
                    {support.email}
                  </a>
                </dd>
              </>
            ) : null}
            {support.phone ? (
              <>
                <dt className="text-muted">{t.chrome.supportPhoneLabel}</dt>
                <dd>
                  <a href={supportTel(support.phone)} className="text-ink hover:underline">
                    {support.phone}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          // Better an honest gap than a button that writes to an address
          // nobody reads: the store has not published one yet.
          <p className="mt-2 text-sm text-muted">{t.chrome.supportPending}</p>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/s/${store.slug}/products`} className="btn-secondary">
          {t.order.continueShopping}
        </Link>
        {support.email ? (
          <a href={supportMailto(support.email, contactSubject)} className="btn-ghost">
            {t.order.contactStore}
          </a>
        ) : null}
      </div>
    </div>
  );
}
