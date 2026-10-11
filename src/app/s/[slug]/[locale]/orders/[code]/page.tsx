import type { Metadata } from "next";
import Link from "next/link";
import { LineThumbnail } from "@/components/LineThumbnail";
import { UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { Badge, Callout, DataList } from "@/components/ui";
import { localCountryName } from "@/lib/countries";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { getOrderByCode, getStoreBySlug } from "@/lib/data";
import { verifyOrderToken } from "@/lib/order-access";
import { shopperTimeline } from "@/lib/order-timeline";
import { orderTaxRows } from "@/lib/pricing";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import type { OrderStatus } from "@/lib/types";
import { CARRIER_LABELS } from "@/lib/util";
import { OrderLookupForm } from "../OrderLookupForm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string; code: string }>;
}): Promise<Metadata> {
  const { slug, locale, code } = await params;
  const store = await getStoreBySlug(slug);
  const robots = { index: false, follow: false };
  if (!store) return { title: "Order status", robots };
  const t = await shopperTranslator(store, shopperLocale(store, locale));
  return shopperPageMetadata(store, shopperLocale(store, locale), `/orders/${encodeURIComponent(code)}`, {
    title: t("order.title"),
    robots,
  });
}

/** What each order state means for the shopper, in the storefront's language. */
const SHOPPER_STATUS: Record<
  OrderStatus,
  {
    label: keyof ShopperMessages["status"];
    note: keyof ShopperMessages["status"];
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
  params: Promise<{ slug: string; locale: string; code: string }>;
  searchParams: Promise<{ new?: string; t?: string }>;
}) {
  const { slug, locale: requested, code } = await params;
  const { new: isNew, t: token } = await searchParams;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;
  const { locale, t, format, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const dateTime = (iso: string) => format.dateTime(new Date(iso), "dateTime");

  // Nothing about the order — not even whether it exists — is readable without
  // the signed link from checkout or the email address on the order.
  if (!(await verifyOrderToken(store.id, code, token))) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t("order.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("order.gateBody", { code })}</p>
        <OrderLookupForm slug={store.slug} code={code} />
      </div>
    );
  }

  const order = await getOrderByCode(store.id, code);
  // The token verified but the order is gone: the store's own not-found page.
  if (!order) return <StorefrontNotFoundView store={store} locale={requested} />;

  const status = SHOPPER_STATUS[order.status];
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const support = storeSupport(store);
  const contactSubject = t("order.contactSubject", { code: order.code });
  const timeline = shopperTimeline(order.events);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {isNew ? (
        // No order email is sent, so this page — and the lookup below it — is
        // the shopper's only way back to the order. The banner says so.
        <Callout tone="green" title={t("order.confirmedTitle")}>
          <p>{t("order.confirmedBody")}</p>
          <p className="mt-1">
            {t("order.confirmedFindAgain", {
              code: order.code,
              email: order.customer.email,
            })}
          </p>
        </Callout>
      ) : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            {t("order.heading", { code: order.code })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("order.placed", { when: dateTime(order.createdAt) })}
          </p>
        </div>
        <Badge tone={status.tone}>{t(`status.${status.label}`)}</Badge>
      </div>

      <p className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-inksoft">
        {t(`status.${status.note}`)}
      </p>

      {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
        <a
          href={order.fulfillment.trackingUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ size: "lg" }), "mt-5")}
        >
          {t("order.trackWith", { carrier: CARRIER_LABELS[order.fulfillment.carrier] })}
        </a>
      ) : null}

      <section className="mt-8">
        <h2 className="font-heading text-base font-semibold text-foreground">{t("order.whatYouOrdered")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-4 py-4">
              <LineThumbnail
                previewUrl={item.customization.previewUrl}
                previewOverlay={item.customization.previewOverlay}
                text={item.customization.text}
                artworkUrl={item.customization.artworkUrl}
                artworkPlacement={item.customization.artworkPlacement}
                alt={t("order.previewAlt", { name: item.productName })}
                className="size-24 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("order.variantQuantity", {
                    variant: item.variantName,
                    count: item.quantity,
                  })}
                </p>
                {item.customization.text ? (
                  <p className="mt-1 text-xs text-inksoft">
                    {t("order.personalisation")}{" "}
                    <span className="font-medium text-foreground">{item.customization.text}</span>
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {money(item.unitPrice * item.quantity, order.currency)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-border pt-4">
          <DataList
            rows={[
              { label: t("order.subtotal"), value: money(order.subtotal, order.currency) },
              { label: t("order.shipping"), value: money(order.shipping, order.currency) },
              ...(order.discount
                ? [
                    {
                      label: t("discount.row", { code: order.discount.code }),
                      value: `− ${money(order.discount.amount, order.currency)}`,
                    },
                  ]
                : []),
              ...orderTaxRows(order).map((row) => ({
                label: t("order.taxRow", { rate: row.rate }),
                value: money(row.amount, order.currency),
              })),
              { label: t("order.paid"), value: money(order.total, order.currency) },
              ...(refunded > 0
                ? [{ label: t("order.refunded"), value: `− ${money(refunded, order.currency)}` }]
                : []),
            ]}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{t("order.deliveringTo")}</h2>
          <address className="mt-2 not-italic text-sm text-inksoft">
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
            {localCountryName(order.customer.country, locale)}
          </address>
        </div>
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{t("order.payment")}</h2>
          <p className="mt-2 text-sm text-inksoft">
            {order.payment.last4
              ? t("order.cardEnding", { last4: order.payment.last4 })
              : t("order.card")}{" "}
            · {order.payment.status === "refunded" ? t("order.refundedWord") : t("order.paidWord")} ·{" "}
            {order.payment.paidAt ? dateTime(order.payment.paidAt) : ""}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-base font-semibold text-foreground">{t("order.progress")}</h2>
        {/* A timeline, newest last: each entry is a filled dot on a hairline
            rail, and the one the order is sitting on now is ringed so the
            shopper can see where it has got to at a glance. */}
        <ol className="mt-4">
          {timeline.map((entry, index) => {
            const current = index === timeline.length - 1;
            return (
              <li key={index} className="relative flex gap-4 pb-6 last:pb-0">
                {current ? null : (
                  <span
                    aria-hidden
                    className="absolute top-3 bottom-0 left-[0.3125rem] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "relative mt-2 size-2.5 shrink-0 rounded-full",
                    current ? "bg-primary ring-4 ring-primary/15" : "bg-border",
                  )}
                />
                <div className="min-w-0 pb-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {entry.milestone === "refunded" ? t("order.refunded") : t(`status.${entry.milestone}`)}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">{dateTime(entry.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {support.email || support.phone ? (
        <section className="mt-10 rounded-xl border border-border bg-muted/60 px-4 py-4">
          <h2 className="font-heading text-base font-semibold text-foreground">{t("order.supportTitle")}</h2>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
            {support.email ? (
              <>
                <dt className="text-muted-foreground">{t("chrome.supportEmailLabel")}</dt>
                <dd>
                  <a href={supportMailto(support.email, contactSubject)} className="text-foreground hover:underline">
                    {support.email}
                  </a>
                </dd>
              </>
            ) : null}
            {support.phone ? (
              <>
                <dt className="text-muted-foreground">{t("chrome.supportPhoneLabel")}</dt>
                <dd>
                  <a href={supportTel(support.phone)} className="text-foreground hover:underline">
                    {support.phone}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
      </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`${base}/products`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          {t("order.continueShopping")}
        </Link>
        {support.email ? (
          <a
            href={supportMailto(support.email, contactSubject)}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            {t("order.contactStore")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
