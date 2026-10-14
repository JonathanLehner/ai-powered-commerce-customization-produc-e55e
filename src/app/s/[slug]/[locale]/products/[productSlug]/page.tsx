import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { Badge, Breadcrumbs } from "@/components/ui";
import { isLive } from "@/lib/artwork";
import { takeOffFailingPreflight } from "@/lib/preflight-guard";
import { JsonLd } from "@/components/JsonLd";
import { RulerIcon } from "lucide-react";
import { Carousel, RecentlyViewed } from "@/components/storefront/client";
import { SfIcon, type StorefrontContext } from "@/components/storefront/kit";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductTabs } from "@/components/storefront/ProductTabs";
import { shopperIntl, shopperLocale, shopperMessages } from "@/i18n/storefront";
import { policyPath } from "@/lib/policies";
import { productBlocks } from "@/lib/product-template";
import { productImageRatio, resolveDesign } from "@/lib/store-design";
import { productBadges } from "@/lib/storefront-cards";
import { storefrontContext } from "@/lib/storefront-context";
import { publishedProducts, storefrontBySlug, storefrontProduct } from "@/lib/storefront-data";
import { presentmentPrice } from "@/lib/currency";
import { levelsForProducts } from "@/lib/inventory";
import { inventorySettings, levelId, shopperStock } from "@/lib/inventory-rules";
import { breadcrumbJsonLd, metaDescription, productJsonLd, storeUrl } from "@/lib/seo";
import { shipDays } from "@/lib/shipping-promise";
import { storeSku } from "@/lib/sku";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { labelLocationConflict } from "@/lib/line-preview";
import { localizeBlockProps, localizeProduct } from "@/lib/translations";
import { storeLanguages } from "@/i18n/storefront-routing";
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
  const found = await storefrontProduct(store.id, productSlug);
  if (!found || !isLive(found.product, found.catalog)) return { title: "Not found", ...notFoundRobots };
  const stored = found.product;
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
  // A live product whose artwork has since failed the supplier's file check
  // comes off the storefront here, as well as on the scheduler's next pass.
  if (found && isLive(found.product) && !isLive(found.product, found.catalog)) {
    await takeOffFailingPreflight([found.product], new Map([[found.product.catalogProductId, found.catalog]]));
  }
  // Taken off sale, or never existed: the store's own not-found page, in the
  // store's language and inside its header and footer.
  if (!found || !isLive(found.product, found.catalog)) return <StorefrontNotFoundView store={store} locale={requested} />;

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
  const { locale, t, format, base, money } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { defaultLocale } = storeLanguages(store);
  // Name, description, colours and the personalisation label in the shopper's language.
  const product = localizeProduct(stored, locale, defaultLocale);
  const sectionCopy = (await shopperMessages(store, locale)).storefront.sections;
  const badges = productBadges(stored).filter((badge) => badge !== "custom");
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
    // A label naming another place than the print area would contradict the
    // "Printed on" hint beside it, so it gives way to a neutral one.
    shopperCustomization:
      area && labelLocationConflict(stored.shopperCustomization.textLabel, area.name)
        ? { ...product.shopperCustomization, textLabel: t("purchase.textLabelFallback") }
        : product.shopperCustomization,
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

  // The store's product page template, in the order the editor arranged it.
  const blocks = productBlocks(storefront?.published).map((block) => ({
    ...block,
    props: localizeBlockProps(block.type, block.props, locale, defaultLocale),
  }));
  const main = blocks.find((block) => block.type === "ProductMain")!.props;
  const purchaseProduct =
    main.personalisation === false
      ? { ...purchase, shopperCustomization: { ...purchase.shopperCustomization, textLine: false, artworkUpload: false } }
      : purchase;

  // Related products are read only when the template shows them.
  const relatedBlock = blocks.find((block) => block.type === "RelatedProducts");
  let related: StorefrontContext | null = null;
  if (relatedBlock) {
    const [published, messages] = await Promise.all([publishedProducts(store.id), shopperMessages(store, locale)]);
    const inCollections = new Set(
      data.collections.filter((c) => c.productIds.includes(stored.id)).flatMap((c) => c.productIds),
    );
    const tags = new Set(stored.tags.map((tag) => tag.toLowerCase()));
    const score = (p: (typeof published)[number]) =>
      (inCollections.has(p.id) ? 2 : 0) + (p.tags.some((tag) => tags.has(tag.toLowerCase())) ? 1 : 0);
    const others = published
      .filter((p) => p.id !== stored.id && !p.giftCard)
      .sort((a, b) => score(b) - score(a))
      .slice(0, Math.min(12, Math.max(2, Number(relatedBlock.props.limit) || 8)));
    related = storefrontContext({
      store,
      products: others,
      collections: [],
      locale,
      defaultLocale,
      base,
      preview: false,
      t: messages.storefront.sections,
      price: (p) => money(presentmentPrice(store, p.price, p.currency, currency), currency),
    });
  }

  const description = (
    <div className="space-y-3 text-base leading-relaxed text-inksoft">
      {product.description.split("\n\n").map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
  const production = product.giftCard ? (
    <div className="text-sm">
      <h3 className="font-semibold text-foreground">{t("giftCard.deliveredTitle")}</h3>
      <p className="mt-1.5 text-muted-foreground">{t("giftCard.deliveredBody")}</p>
    </div>
  ) : (
    <div className="grid gap-6 text-sm sm:grid-cols-2">
      <div>
        <h3 className="font-semibold text-foreground">{t("product.madeToOrder")}</h3>
        <p className="mt-1.5 text-muted-foreground">
          {days
            ? t("product.shipsWithin", { days })
            : t("product.producedBy", {
                lead: catalog
                  ? t("product.leadDays", { from: catalog.leadTimeDays[0], to: catalog.leadTimeDays[1] })
                  : t("product.leadUnknown"),
              })}
        </p>
      </div>
      {printAreas.length > 0 ? (
        <div>
          <h3 className="font-semibold text-foreground">{t("product.printDetail", { count: printAreas.length })}</h3>
          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
            {printAreas.map((a) => (
              <li key={a.id}>{t("product.printDetailBody", { area: a.name, width: a.widthMm, height: a.heightMm })}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
  const shipping = (
    <div className="space-y-3 text-sm text-inksoft">
      <p>
        {days
          ? t("product.shipsWithin", { days })
          : t("product.producedBy", {
              lead: catalog
                ? t("product.leadDays", { from: catalog.leadTimeDays[0], to: catalog.leadTimeDays[1] })
                : t("product.leadUnknown"),
            })}
      </p>
      <Link href={policyPath(base, "shipping")} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
        {t("product.shippingPolicy")}
      </Link>
    </div>
  );

  const renderBlock = (block: (typeof blocks)[number]) => {
    const props = block.props;
    const text = (key: string) => String(props[key] ?? "");
    switch (block.type) {
      case "ProductMain":
        return (
          <div key={block.id}>
            <Breadcrumbs
              label={t("product.breadcrumb")}
              items={[
                { label: store.name, href: base },
                { label: t("product.breadcrumbShop"), href: `${base}/products` },
                { label: product.name },
              ]}
            />
            <ProductPurchase
              product={purchaseProduct}
              layout={{
                gallery: props.galleryLayout === "grid" || props.galleryLayout === "stacked" ? props.galleryLayout : "thumbnails",
                side: props.gallerySide === "right" ? "right" : "left",
                sticky: props.stickyBuyBox !== false,
                trustNote: text("trustNote"),
              }}
              heading={
                <>
                  {badges.length > 0 ? (
                    <div className="mb-3 flex gap-1.5">
                      {badges.slice(0, 2).map((badge) => (
                        <Badge key={badge} tone={badge === "soldOut" ? "neutral" : "brand"}>
                          {sectionCopy[`badge${badge[0].toUpperCase()}${badge.slice(1)}` as "badgeNew"]}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <h1 className="font-heading text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight font-semibold tracking-tight text-foreground">
                    {product.name}
                  </h1>
                  {rating.count > 0 ? (
                    <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                      <Stars rating={rating.average} label={t("reviews.ratingLabel", { rating: rating.average })} />
                      <span>{t("reviews.summary", { rating: rating.average, count: rating.count })}</span>
                    </a>
                  ) : null}
                  {props.showTags !== false && product.tags.length > 0 ? (
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
          </div>
        );
      case "DescriptionTabs": {
        const panels = [
          { id: "description", label: t("product.tabDescription"), content: description },
          ...(props.showDetails !== false ? [{ id: "details", label: t("product.tabDetails"), content: production }] : []),
          ...(props.showShipping !== false && !product.giftCard ? [{ id: "shipping", label: t("product.tabShipping"), content: shipping }] : []),
          ...(text("extraTitle") && text("extraBody")
            ? [{ id: "extra", label: text("extraTitle"), content: <p className="text-sm leading-relaxed whitespace-pre-line text-inksoft">{text("extraBody")}</p> }]
            : []),
        ];
        return (
          <section key={block.id} aria-label={t("product.about")} className="mt-16 max-w-3xl">
            {props.style === "accordion" ? (
              <div className="divide-y divide-border border-y border-border">
                {panels.map((panel, i) => (
                  <details key={panel.id} open={i === 0} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                      {panel.label}
                      <span aria-hidden className="text-xl leading-none transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="pb-6">{panel.content}</div>
                  </details>
                ))}
              </div>
            ) : (
              <ProductTabs panels={panels} />
            )}
          </section>
        );
      }
      case "SizeGuide": {
        const rows = text("table")
          .split("\n")
          .map((line) => line.split("|").map((cell) => cell.trim()))
          .filter((cells) => cells.some(Boolean));
        const [head, ...body] = rows;
        return (
          <details key={block.id} className="group mt-12 max-w-3xl rounded-[var(--radius)] border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <RulerIcon aria-hidden className="size-4" />
                {text("title") || t("product.sizeGuide")}
              </span>
              <span aria-hidden className="text-xl leading-none transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="px-5 pb-5">
              {text("intro") ? <p className="mb-4 text-sm text-muted-foreground">{text("intro")}</p> : null}
              {head ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-border">
                        {head.map((cell, i) => (
                          <th key={i} scope="col" className="py-2 pr-4 font-semibold text-foreground">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {body.map((cells, r) => (
                        <tr key={r} className="border-b border-border last:border-0">
                          {cells.map((cell, i) =>
                            i === 0 ? (
                              <th key={i} scope="row" className="py-2 pr-4 font-medium text-foreground">
                                {cell}
                              </th>
                            ) : (
                              <td key={i} className="py-2 pr-4 text-inksoft">
                                {cell}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
        );
      }
      case "ProductFeatures":
        return (
          <ul key={block.id} className="mt-14 grid gap-8 border-y border-border py-10 sm:grid-cols-3">
            {[1, 2, 3]
              .filter((n) => text(`feature${n}Title`))
              .map((n) => (
                <li key={n} className="flex gap-4">
                  <SfIcon name={text(`feature${n}Icon`)} className="mt-0.5 size-6 shrink-0 text-[var(--sf-primary-text)]" />
                  <div>
                    <h2 className="font-semibold text-foreground">{text(`feature${n}Title`)}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text(`feature${n}Body`)}</p>
                  </div>
                </li>
              ))}
          </ul>
        );
      case "ProductText":
        return (
          <section key={block.id} className="mt-14 max-w-3xl">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{text("heading")}</h2>
            <p className="mt-3 text-base leading-relaxed whitespace-pre-line text-inksoft">{text("body")}</p>
          </section>
        );
      case "Reviews":
        return product.giftCard ? null : (
          <section key={block.id} id="reviews" aria-labelledby="reviews-heading" className="mt-16 scroll-mt-24 border-t border-border pt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="reviews-heading" className="font-heading text-xl font-semibold tracking-tight text-foreground">
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
                  <li key={review.id} className="rounded-[var(--radius)] border border-border p-5">
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
        );
      case "RelatedProducts":
        return related && related.products.length > 0 ? (
          <section key={block.id} aria-labelledby={`related-${block.id}`} className="mt-16 border-t border-border pt-10">
            <h2 id={`related-${block.id}`} className="font-heading mb-6 text-xl font-semibold tracking-tight text-foreground">
              {text("title") || t("product.related")}
            </h2>
            <Carousel label={text("title") || t("product.related")} previous={sectionCopy.previous} next={sectionCopy.next}>
              {related.products.map((card) => (
                <ProductCard key={card.id} product={card} ctx={related!} columns={4} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]" />
              ))}
            </Carousel>
          </section>
        ) : null;
      case "RecentlyViewed":
        return (
          <RecentlyViewed
            key={block.id}
            storeId={store.id}
            title={text("title") || t("product.recentlyViewed")}
            limit={Math.min(12, Math.max(2, Number(props.limit) || 6))}
            ratio={productImageRatio(resolveDesign(store))}
            current={{
              id: product.id,
              name: product.name,
              href: `${base}${productPath(product.slug)}`,
              imageUrl: product.mockups[0]?.url ?? null,
              price: purchase.variants[0] ? money(purchase.variants[0].price, currency) : "",
            }}
          />
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-[88rem] px-4 py-8 max-lg:pb-28 sm:px-6">
      <JsonLd data={structured} />
      {blocks.map(renderBlock)}
    </div>
  );
}
