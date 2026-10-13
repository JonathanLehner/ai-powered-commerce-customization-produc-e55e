import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { Badge, Breadcrumbs } from "@/components/ui";
import { isLive } from "@/lib/artwork";
import { JsonLd } from "@/components/JsonLd";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { storefrontBySlug, storefrontProduct } from "@/lib/storefront-data";
import { presentmentPrice } from "@/lib/currency";
import { levelsForProducts } from "@/lib/inventory";
import { inventorySettings, levelId, shopperStock } from "@/lib/inventory-rules";
import { breadcrumbJsonLd, metaDescription, productJsonLd, storeUrl } from "@/lib/seo";
import { shipDays } from "@/lib/shipping-promise";
import { storeSku } from "@/lib/sku";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { localizeProduct } from "@/lib/translations";
import { storeLanguages } from "@/i18n/storefront-routing";
import { Card, CardContent } from "@/components/ui/card";
import { ProductPurchase, type PurchaseProduct } from "./ProductPurchase";
import { Stars } from "@/components/Stars";
import { listApprovedReviews, productRating } from "@/lib/review-data";
import { reviewJsonLd } from "@/lib/reviews";

const productPath = (slug: string) => `/products/${encodeURIComponent(slug)}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, locale, productSlug } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return { title: "Not found", ...notFoundRobots };
  const stored = (await storefrontProduct(store.id, productSlug))?.product;
  if (!stored || !isLive(stored)) return { title: "Not found", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  const product = localizeProduct(stored, active, storeLanguages(store).defaultLocale);
  // The SEO title the store wrote is used as written; the product name gets
  // the store name after it like every other page.
  const seoTitle = product.seoTitle?.trim();
  return shopperPageMetadata(store, active, productPath(product.slug), {
    title: seoTitle || product.name,
    absolute: Boolean(seoTitle),
    description: product.seoDescription?.trim() || metaDescription(product.description),
    imagePath: productPath(product.slug),
  });
}

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string; productSlug: string }>;
}) {
  const { slug, locale: requested, productSlug } = await params;
  const data = await storefrontBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!data) return <UnknownStoreView slug={slug} />;

  const { store, storefront } = data;
  const found = await storefrontProduct(store.id, productSlug);
  // Taken off sale, or never existed: the store's own not-found page, in the
  // store's language and inside its header and footer.
  if (!found || !isLive(found.product)) return <StorefrontNotFoundView store={store} locale={requested} />;

  const { product: stored, catalog } = found;
  const [currency, levels, rating, reviews] = await Promise.all([
    readCurrency(store.defaultCurrency, store.currencies),
    levelsForProducts([stored.id]),
    productRating(store.id, stored.id),
    listApprovedReviews(store.id, stored.id, 20),
  ]);
  const settings = inventorySettings(store);
  const stock = (variantId: string) =>
    shopperStock(levels.find((level) => level.id === levelId(stored.id, variantId)), settings);
  const { locale, t, format, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  // Name, description, colours and the personalisation label in the shopper's language.
  const product = localizeProduct(stored, locale, storeLanguages(store).defaultLocale);
  // Shopper text and artwork go on the first print area.
  const area = catalog?.printAreas[0] ?? null;
  // Every area the product's own artwork is printed on, which is what the
  // description talks about. A product with no artwork yet lists the area the
  // shopper's personalisation goes on.
  const printed = catalog
    ? catalog.printAreas.filter((a) => product.artworks.some((art) => art.printAreaId === a.id))
    : [];
  const printAreas = printed.length > 0 ? printed : area ? [area] : [];
  // The same shipping time the announcement bar shows.
  const days = shipDays(storefront?.published);

  const purchase: PurchaseProduct = {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    currency: product.currency,
    displayCurrency: currency,
    base,
    variants: product.variants
      .filter((v) => v.enabled)
      .map((v) => ({
        id: v.id,
        name: v.name,
        colour: v.colour,
        colourHex: v.colourHex,
        size: v.size,
        price: presentmentPrice(store, v.price, product.currency, currency),
        availability: v.availability,
        ...stock(v.id),
      })),
    mockups: product.mockups.map((m) => ({ id: m.id, url: m.url, view: m.view, colour: m.colour })),
    shopperCustomization: product.shopperCustomization,
    printArea: area,
    // The whole requirements record, not a summary: the storefront runs the
    // same pre-flight the workspace configurator does.
    fileRules: catalog?.fileRequirements ?? null,
  };

  const url = storeUrl(store, locale, productPath(product.slug));
  // A variant the store has sold out of is out of stock to search engines too.
  const enabled = product.variants
    .filter((v) => v.enabled)
    .map((v) => (stock(v.id).soldOut ? { ...v, availability: "out_of_stock" as const } : v));
  const structured = [
    {
      ...productJsonLd({
      name: product.name,
      description: product.description.trim(),
      url,
      sku: storeSku(product, store.channelCode),
      brand: store.name,
      images: product.mockups.map((m) => m.url),
      currency: product.currency,
      variants: enabled.length > 0 ? enabled : [{ price: product.price, availability: "out_of_stock" as const }],
      }),
      ...reviewJsonLd(rating, reviews),
    },
    breadcrumbJsonLd([
      { name: store.name, url: storeUrl(store, locale) },
      { name: t("product.breadcrumbShop"), url: storeUrl(store, locale, "/products") },
      { name: product.name, url },
    ]),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 max-lg:pb-28 sm:px-6">
      <JsonLd data={structured} />
      <Breadcrumbs
        label={t("product.breadcrumb")}
        items={[
          { label: store.name, href: base },
          { label: t("product.breadcrumbShop"), href: `${base}/products` },
          { label: product.name },
        ]}
      />

      <ProductPurchase
        product={purchase}
        heading={
          <>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {product.name}
            </h1>
            {rating.count > 0 ? (
              <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Stars rating={rating.average} label={t("reviews.ratingLabel", { rating: rating.average })} />
                <span>{t("reviews.summary", { rating: rating.average, count: rating.count })}</span>
              </a>
            ) : null}
            {product.tags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {product.tags.map((item) => (
                  <Link key={item} href={`${base}/products?tag=${encodeURIComponent(item)}`}>
                    <Badge tone="neutral">{item}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        }
      />

      <div className="mt-16 grid gap-10 border-t border-border pt-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">{t("product.about")}</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-inksoft">
            {product.description.split("\n\n").map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        <aside className="space-y-3 text-sm">
          {product.giftCard ? (
            <Card size="sm">
              <CardContent>
                <h2 className="text-sm font-semibold text-foreground">{t("giftCard.deliveredTitle")}</h2>
                <p className="mt-1.5 text-muted-foreground">{t("giftCard.deliveredBody")}</p>
              </CardContent>
            </Card>
          ) : (
          <Card size="sm">
            <CardContent>
              <h2 className="text-sm font-semibold text-foreground">{t("product.madeToOrder")}</h2>
              <p className="mt-1.5 text-muted-foreground">
                {days
                  ? t("product.shipsWithin", { days })
                  : t("product.producedBy", {
                      lead: catalog
                        ? t("product.leadDays", {
                            from: catalog.leadTimeDays[0],
                            to: catalog.leadTimeDays[1],
                          })
                        : t("product.leadUnknown"),
                    })}
              </p>
            </CardContent>
          </Card>
          )}
          {printAreas.length > 0 && !product.giftCard ? (
            <Card size="sm">
              <CardContent>
                <h2 className="text-sm font-semibold text-foreground">
                  {t("product.printDetail", { count: printAreas.length })}
                </h2>
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {printAreas.map((a) => (
                    <li key={a.id}>
                      {t("product.printDetailBody", {
                        area: a.name,
                        width: a.widthMm,
                        height: a.heightMm,
                      })}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      {!product.giftCard ? (
        <section id="reviews" aria-labelledby="reviews-heading" className="mt-16 scroll-mt-24 border-t border-border pt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="reviews-heading" className="font-heading text-lg font-semibold text-foreground">
              {t("reviews.title")}
            </h2>
            {rating.count > 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stars rating={rating.average} label={t("reviews.ratingLabel", { rating: rating.average })} />
                {t("reviews.summary", { rating: rating.average, count: rating.count })}
              </p>
            ) : null}
          </div>
          {reviews.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("reviews.none")}</p>
          ) : (
            <ul className="mt-6 grid gap-6 md:grid-cols-2">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-border p-5">
                  <Stars rating={review.rating} label={t("reviews.ratingLabel", { rating: review.rating })} />
                  {review.title ? <p className="mt-2 font-medium text-foreground">{review.title}</p> : null}
                  <p className="mt-2 text-sm whitespace-pre-line text-inksoft">{review.body}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("reviews.byline", {
                      name: review.authorName,
                      date: format.dateTime(new Date(review.createdAt), { dateStyle: "medium" }),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
