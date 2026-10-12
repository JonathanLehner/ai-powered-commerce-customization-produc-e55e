import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readCurrency } from "@/app/actions/shop";
import { DiscountEntry } from "@/components/DiscountEntry";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { LineThumbnail } from "@/components/LineThumbnail";
import { Callout } from "@/components/ui";
import { basketTotals } from "@/lib/basket";
import { isCountryCode, type FulfillmentSource } from "@/lib/countries";
import { shippingCountries, shippingOptions } from "@/lib/shipping";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { getSupplier } from "@/lib/data";
import { paymentMode } from "@/lib/payment-mode";
import { storefrontBySlug } from "@/lib/storefront-data";
import { variantPhoto } from "@/lib/line-preview";
import { CheckoutDeliveryProvider, SummaryTotals, type CheckoutQuote } from "./CheckoutDelivery";
import { CheckoutForm } from "./CheckoutForm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return { title: "Checkout", ...notFoundRobots };
  const t = await shopperTranslator(store, shopperLocale(store, locale));
  return shopperPageMetadata(store, shopperLocale(store, locale), "/checkout", { title: t("checkout.title") });
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale: requested } = await params;
  const data = await storefrontBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!data) return <UnknownStoreView slug={slug} />;
  const { store, basket, shippingZones: zones } = data;

  const { t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const cart = basket?.cart;
  if (!basket || !cart || cart.items.length === 0) redirect(`${base}/cart`);

  const mode = paymentMode(store);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  // The checkout opens on the store's own country when it ships there, else on
  // the first country it does ship to.
  const shippable = shippingCountries(zones);
  const home = isCountryCode(store.stripe.country) ? store.stripe.country.toUpperCase() : "US";
  const defaultCountry = zones.length === 0 || shippable.includes(home) ? home : shippable[0];
  const { products, lines, discount, discountRefusal, discountMinimum, options, basis, weightGrams } =
    await basketTotals(store, cart.items, currency, basket.discountCode, basket, { zones, country: defaultCountry });
  const quote: CheckoutQuote = {
    currency,
    basis,
    zones:
      zones.length > 0
        ? zones.map((zone) => ({
            countries: zone.countries,
            options: shippingOptions([zone], zone.countries[0], { weightGrams, subtotal: basis.goods, currency }),
          }))
        : null,
    standard: zones.length > 0 ? null : (options[0] ?? null),
  };

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
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t("checkout.title")}
      </h1>

      {mode === "unavailable" ? (
        <div className="mt-8">
          <Callout tone="rose" title={t("checkout.unavailableTitle")}>
            {t("checkout.unavailableBody")}
            <p className="mt-3">
              <Link href={`${base}/cart`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("checkout.backToBasket")}
              </Link>
            </p>
          </Callout>
        </div>
      ) : (
        <CheckoutDeliveryProvider quote={quote} defaultCountry={defaultCountry}>
        <div className="mt-8 space-y-6">
          <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("checkout.summaryTitle")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {lines.map(({ item, unit }, index) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <LineThumbnail
                        previewUrl={item.previewUrl ?? variantPhoto(products[index], item.variantId)}
                        previewOverlay={item.previewOverlay}
                        text={item.text}
                        artworkUrl={item.artworkUrl}
                        artworkPlacement={item.artworkPlacement}
                        alt={t("basket.previewAlt", { name: item.productName })}
                        className="size-14"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{item.productName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.variantName} × {item.quantity}
                          {item.text ? ` · “${item.text}”` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {money(unit * item.quantity, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator className="my-4" />
                <SummaryTotals discount={discount ? { code: discount.code, amount: discount.amount } : null} />
                <DiscountEntry
                  storeId={store.id}
                  code={cart.discountCode ?? null}
                  note={
                    discountRefusal
                      ? t(`discount.${discountRefusal}`, { amount: money(discountMinimum, currency) })
                      : null
                  }
                />
              </CardContent>
            </section>
          </Card>

          <CheckoutForm
            mode={mode}
            storeId={store.id}
            currencies={store.currencies}
            currency={currency}
            fulfillmentSources={[...sources.values()]}
            base={base}
          />
        </div>
        </CheckoutDeliveryProvider>
      )}
    </div>
  );
}
