import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { PrintButton } from "@/app/s/[slug]/[locale]/orders/[code]/invoice/PrintButton";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { buttonVariants } from "@/components/ui/button";
import { shopperLocale } from "@/i18n/storefront";
import { localCountryName } from "@/lib/countries";
import { getOrder } from "@/lib/data";
import { giftCardLineIds } from "@/lib/gift-card-data";
import { remainingQuantities } from "@/lib/order-ops";
import { requireStoreAccess } from "@/lib/session";
import { storeSupport } from "@/lib/support";
import { CARRIER_LABELS } from "@/lib/util";

/** Printing shows the slip alone, without the workspace around it. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden; }
  #packing-slip, #packing-slip * { visibility: visible; }
  #packing-slip { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; }
  #packing-slip [data-print="hide"] { display: none; }
}`;

/**
 * The slip that goes in the parcel, in the language the shopper checked out
 * in: one parcel's lines when a shipment is named, otherwise everything still
 * to ship (or the whole order once it has all gone). No prices.
 */
export default async function PackingSlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
  searchParams: Promise<{ shipment?: string }>;
}) {
  const { storeId, orderId } = await params;
  const { shipment: shipmentId } = await searchParams;
  const { store, viaPlatform } = await requireStoreAccess(storeId, "store.orders");
  const order = await getOrder(orderId);
  if (!order || order.storeId !== storeId || viaPlatform) {
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;
  }

  const locale = shopperLocale(store, order.locale ?? store.defaultLanguage);
  const [t, back, format, giftLines] = await Promise.all([
    getTranslations({ locale, namespace: "storefront.packingSlip" }),
    getTranslations("orderDetail"),
    getFormatter({ locale }),
    giftCardLineIds(order),
  ]);
  const shipment = shipmentId ? order.shipments?.find((s) => s.id === shipmentId) : undefined;
  const remaining = remainingQuantities(order, giftLines);
  const lines = shipment
    ? shipment.lines
    : remaining.size > 0
      ? [...remaining].map(([itemId, quantity]) => ({ itemId, quantity }))
      : order.items.filter((item) => !giftLines.has(item.id)).map((item) => ({ itemId: item.id, quantity: item.quantity }));
  const support = storeSupport(store);
  const { customer } = order;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <style>{PRINT_CSS}</style>
      <article id="packing-slip" className="rounded-xl border border-border bg-card p-6 text-foreground sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted-foreground">{t("order")}</dt>
              <dd className="font-medium tabular-nums">{order.code}</dd>
              <dt className="text-muted-foreground">{t("date")}</dt>
              <dd className="tabular-nums">{format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })}</dd>
              {shipment ? (
                <>
                  <dt className="text-muted-foreground">{t("tracking")}</dt>
                  <dd className="tabular-nums">
                    {CARRIER_LABELS[shipment.carrier]} · {shipment.trackingNumber}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
          <div className="text-right text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {store.logoUrl ? <img src={store.logoUrl} alt={store.name} className="mb-2 ml-auto h-10 w-auto" /> : null}
            <p className="font-semibold">{store.name}</p>
            {support.email ? <p className="text-muted-foreground">{support.email}</p> : null}
            {support.phone ? <p className="text-muted-foreground">{support.phone}</p> : null}
          </div>
        </header>

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("shipTo")}</h2>
          <address className="mt-1.5 text-sm not-italic">
            {customer.name}
            <br />
            {customer.line1}
            {customer.line2 ? (
              <>
                <br />
                {customer.line2}
              </>
            ) : null}
            <br />
            {[customer.city, customer.region, customer.postalCode].filter(Boolean).join(" ")}
            <br />
            {localCountryName(customer.country, locale)}
            {customer.phone ? (
              <>
                <br />
                {customer.phone}
              </>
            ) : null}
          </address>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="py-2 pr-3">{t("item")}</th>
              <th scope="col" className="py-2 text-right">{t("quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const item = order.items.find((i) => i.id === line.itemId);
              if (!item) return null;
              return (
                <tr key={line.itemId} className="border-b border-border align-top">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{item.productName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.variantName}
                      {item.customization.text ? ` · “${item.customization.text}”` : ""}
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{line.quantity}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="mt-8 text-sm text-muted-foreground">{t("thanks", { store: store.name })}</p>

        <div data-print="hide" className="mt-8 flex flex-wrap gap-3">
          <PrintButton label={back("print")} />
          <Link href={`/app/stores/${storeId}/orders/${order.id}`} className={buttonVariants({ variant: "ghost" })}>
            {back("backToOrder")}
          </Link>
        </div>
      </article>
    </div>
  );
}
