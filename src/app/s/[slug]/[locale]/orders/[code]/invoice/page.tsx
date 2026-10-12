import type { Metadata } from "next";
import Link from "next/link";
import { UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { buttonVariants } from "@/components/ui/button";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localCountryName } from "@/lib/countries";
import { getOrderByCode } from "@/lib/data";
import { orderStatusUrl, verifyOrderToken } from "@/lib/order-access";
import { orderTax } from "@/lib/shipping";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storefrontBySlug } from "@/lib/storefront-data";
import { storeSupport } from "@/lib/support";
import { PrintButton } from "./PrintButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string; code: string }>;
}): Promise<Metadata> {
  const { slug, locale, code } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  const robots = { index: false, follow: false };
  if (!store) return { title: "Invoice", robots };
  const t = await shopperTranslator(store, shopperLocale(store, locale));
  return shopperPageMetadata(store, shopperLocale(store, locale), `/orders/${encodeURIComponent(code)}/invoice`, {
    title: t("invoice.title", { code }),
    robots,
  });
}

/** Printing shows the invoice alone, without the storefront's header and footer. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden; }
  #invoice, #invoice * { visibility: visible; }
  #invoice { position: absolute; inset: 0 auto auto 0; width: 100%; }
  #invoice [data-print="hide"] { display: none; }
}`;

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; locale: string; code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug, locale: requested, code } = await params;
  const { t: token } = await searchParams;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const { locale, t, format, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);

  // The same signed link as the order page; without it there is nothing to show.
  const order = (await verifyOrderToken(store.id, code, token)) ? await getOrderByCode(store.id, code) : null;
  if (!order || order.status === "awaiting_payment") return <StorefrontNotFoundView store={store} locale={requested} />;

  const tax = orderTax(order);
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const support = storeSupport(store);
  const issued = order.payment.paidAt ?? order.createdAt;
  const amount = (minor: number) => money(minor, order.currency);
  const taxLabel = (rate: number | null) =>
    rate === null
      ? tax.inclusive
        ? t("order.taxIncludedPlain")
        : t("order.tax")
      : tax.inclusive
        ? t("order.taxIncludedRow", { rate })
        : t("order.taxRow", { rate });

  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: t("order.subtotal"), value: amount(order.subtotal) },
    ...(order.discount ? [{ label: t("discount.row", { code: order.discount.code }), value: `− ${amount(order.discount.amount)}` }] : []),
    {
      label: order.shippingRate ? t("order.shippingWith", { rate: order.shippingRate.name }) : t("order.shipping"),
      value: amount(order.shipping),
    },
    ...tax.rows.map((row) => ({ label: taxLabel(row.rate), value: amount(row.amount) })),
    { label: t("invoice.total"), value: amount(order.total), strong: true },
    ...(refunded > 0 ? [{ label: t("order.refunded"), value: `− ${amount(refunded)}` }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <style>{PRINT_CSS}</style>
      <article id="invoice" className="rounded-xl border border-border bg-card p-6 text-foreground sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("invoice.heading")}</h1>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted-foreground">{t("invoice.number")}</dt>
              <dd className="font-medium tabular-nums">{order.code}</dd>
              <dt className="text-muted-foreground">{t("invoice.date")}</dt>
              <dd className="tabular-nums">{format.dateTime(new Date(issued), "date")}</dd>
            </dl>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{store.clientName || store.name}</p>
            {store.clientName && store.clientName !== store.name ? (
              <p className="text-muted-foreground">{store.name}</p>
            ) : null}
            {support.email ? <p className="text-muted-foreground">{support.email}</p> : null}
            {support.phone ? <p className="text-muted-foreground">{support.phone}</p> : null}
          </div>
        </header>

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("invoice.billTo")}</h2>
          <address className="mt-1.5 text-sm not-italic">
            {order.customer.name}
            <br />
            {order.customer.line1}
            {order.customer.line2 ? (
              <>
                <br />
                {order.customer.line2}
              </>
            ) : null}
            <br />
            {[order.customer.city, order.customer.region, order.customer.postalCode].filter(Boolean).join(" ")}
            <br />
            {localCountryName(order.customer.country, locale)}
            <br />
            <span className="text-muted-foreground">{order.customer.email}</span>
          </address>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="py-2 pr-3">{t("invoice.item")}</th>
              <th scope="col" className="py-2 pr-3 text-right">{t("invoice.quantity")}</th>
              <th scope="col" className="py-2 pr-3 text-right">{t("invoice.unitPrice")}</th>
              <th scope="col" className="py-2 text-right">{t("invoice.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border align-top">
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{item.productName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.variantName}
                    {item.customization.text ? ` · “${item.customization.text}”` : ""}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{amount(item.unitPrice)}</td>
                <td className="py-2.5 text-right tabular-nums">{amount(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          {rows.map((row) => (
            <div
              key={row.label}
              className={row.strong ? "flex justify-between gap-4 border-t border-border pt-2 font-semibold" : "flex justify-between gap-4"}
            >
              <dt className={row.strong ? undefined : "text-muted-foreground"}>{row.label}</dt>
              <dd className="tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div data-print="hide" className="mt-8 flex flex-wrap gap-3">
          <PrintButton label={t("invoice.print")} />
          {token ? (
            <Link href={orderStatusUrl(base, order.code, token)} className={buttonVariants({ variant: "ghost" })}>
              {t("invoice.backToOrder")}
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}
