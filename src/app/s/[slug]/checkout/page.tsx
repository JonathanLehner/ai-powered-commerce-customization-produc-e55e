import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readCurrency, readShopperSession } from "@/app/actions/shop";
import { DiscountEntry } from "@/components/DiscountEntry";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import type { FulfillmentSource } from "@/lib/countries";
import { getCart, getStoreBySlug, getSupplier } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Checkout", ...notFoundRobots };
  return { title: storefrontLocale(store).t.checkout.title };
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  if (!cart || cart.items.length === 0) redirect(`/s/${store.slug}/cart`);

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { t, tag: localeTag, money } = storefrontLocale(store);
  const discountCode = await cartDiscountCode(store.id, cart);
  const { products, lines, discount, discountRefusal, discountMinimum, shipping, taxRows, total } =
    await basketTotals(store, cart.items, currency, discountCode);

  // Which supplier stands behind each basket line, so the form can tell the
  // shopper their destination is out of region before the card is charged.
  const sources = new Map<string, FulfillmentSource>();
  for (const [index, item] of cart.items.entries()) {
    const supplierId = products[index]?.supplierId;
    if (!supplierId) continue;
    const existing = sources.get(supplierId);
    if (existing) {
      if (!existing.productNames.includes(item.productName)) existing.productNames.push(item.productName);
      continue;
    }
    const supplier = await getSupplier(supplierId);
    if (!supplier) continue;
    sources.set(supplierId, {
      supplierId,
      supplierName: supplier.name,
      regions: supplier.regions,
      productNames: [item.productName],
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t.checkout.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {fmt(t.checkout.merchantNote, { client: store.clientName })}
      </p>

      {!store.stripe.connected || !store.stripe.chargesEnabled ? (
        <div className="mt-8">
          <Callout tone="rose" title={t.checkout.unavailableTitle}>
            {t.checkout.unavailableBody}
            <p className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${store.slug}/cart`}>{t.checkout.backToBasket}</Link>
              </Button>
            </p>
          </Callout>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* The summary comes first: a single column reads top to bottom, and
              what is being paid for belongs above the card details. */}
          <section className="rounded-card border border-border bg-secondary p-5">
            <h2 className="text-base font-semibold text-ink">{t.checkout.summaryTitle}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {lines.map(({ item, unit }) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{item.productName}</span>
                    <span className="block text-xs text-muted">
                      {item.variantName} × {item.quantity}
                      {item.text ? ` · \u201c${item.text}\u201d` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {money(unit * item.quantity, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.checkout.shipping}</dt>
                <dd className="tabular-nums text-ink">{money(shipping, currency)}</dd>
              </div>
              {discount ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{fmt(t.discount.row, { code: discount.code })}</dt>
                  <dd className="tabular-nums text-emerald-700">− {money(discount.amount, currency)}</dd>
                </div>
              ) : null}
              {taxRows.map((row) => (
                <div key={row.rate} className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {fmt(t.checkout.taxRow, { rate: row.rate })}{" "}
                    {store.pricesIncludeTax ? t.checkout.taxIncludedSuffix : ""}
                  </dt>
                  <dd className="tabular-nums text-ink">{money(row.amount, currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-line pt-2">
                <dt className="font-semibold text-ink">{t.checkout.total}</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">
                  {money(total, currency)}
                </dd>
              </div>
            </dl>
            <DiscountEntry
              storeId={store.id}
              code={cart.discountCode ?? null}
              note={
                discountRefusal
                  ? fmt(t.discount[discountRefusal], { amount: money(discountMinimum, currency) })
                  : null
              }
              t={t.discount}
            />
          </section>

          <CheckoutForm
            storeId={store.id}
            currencies={store.currencies}
            currency={currency}
            stripeAccountId={store.stripe.accountId}
            defaultCountry={store.stripe.country}
            fulfillmentSources={[...sources.values()]}
            localeTag={localeTag}
            t={t.checkout}
          />
        </div>
      )}
    </div>
  );
}
