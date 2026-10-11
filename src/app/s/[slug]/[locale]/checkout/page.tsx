import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readCurrency, readShopperSession } from "@/app/actions/shop";
import { DiscountEntry } from "@/components/DiscountEntry";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { LineThumbnail } from "@/components/LineThumbnail";
import { Callout } from "@/components/ui";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import type { FulfillmentSource } from "@/lib/countries";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { getCart, getStoreBySlug, getSupplier } from "@/lib/data";
import { variantPhoto } from "@/lib/line-preview";
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
  const store = await getStoreBySlug(slug);
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
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const { t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  if (!cart || cart.items.length === 0) redirect(`${base}/cart`);

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
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
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t("checkout.title")}
      </h1>

      {!store.stripe.connected || !store.stripe.chargesEnabled ? (
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
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("checkout.shipping")}</dt>
                    <dd className="tabular-nums text-foreground">{money(shipping, currency)}</dd>
                  </div>
                  {discount ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("discount.row", { code: discount.code })}</dt>
                      <dd className="tabular-nums text-emerald-700">− {money(discount.amount, currency)}</dd>
                    </div>
                  ) : null}
                  {taxRows.map((row) => (
                    <div key={row.rate} className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t("checkout.taxRow", { rate: row.rate })}{" "}
                        {store.pricesIncludeTax ? t("checkout.taxIncludedSuffix") : ""}
                      </dt>
                      <dd className="tabular-nums text-foreground">{money(row.amount, currency)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-2">
                    <dt className="font-semibold text-foreground">{t("checkout.total")}</dt>
                    <dd className="text-base font-semibold tabular-nums text-foreground">
                      {money(total, currency)}
                    </dd>
                  </div>
                </dl>
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
            storeId={store.id}
            currencies={store.currencies}
            currency={currency}
            defaultCountry={store.stripe.country}
            fulfillmentSources={[...sources.values()]}
            base={base}
          />
        </div>
      )}
    </div>
  );
}
