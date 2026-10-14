import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { LockIcon, RulerIcon, ShoppingBagIcon, SmileIcon, SparklesIcon, TruckIcon } from "lucide-react";
import { Document } from "@/components/Document";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { RenderSection } from "@/components/sections";
import { StoreMark } from "@/components/StoreMark";
import { StorefrontMenu } from "@/components/StorefrontMenu";
import { CollectionBanner } from "@/components/storefront/CollectionBanner";
import { AnnouncementBar, Carousel, HeaderScrollState, NewsletterForm } from "@/components/storefront/client";
import { DemoBuyBox } from "@/components/storefront/DemoBuyBox";
import { SfIcon, type StorefrontCollection, type StorefrontContext } from "@/components/storefront/kit";
import { PaymentMarks } from "@/components/storefront/marks";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductTabs } from "@/components/storefront/ProductTabs";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/locales";
import { srcSetFor } from "@/lib/image-variants";
import { productBlocks } from "@/lib/product-template";
import { resolveDesign, type ResolvedDesign } from "@/lib/store-design";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { storeThemeAttributes, storeThemeStyle } from "@/lib/store-theme";
import { layoutSettings } from "@/lib/storefront-layout";
import { sectionsFromTree, type CraftTree } from "@/lib/storefront-schema";
import type { DemoProduct } from "@/lib/templates/demo";
import { templateTree } from "@/lib/templates/tree";
import type { StoreTemplate } from "@/lib/templates/index";
import { siteContent } from "@/lib/translations";

/**
 * A template drawn as a whole storefront without a store behind it: the
 * marketing gallery's live demos, and a store's own products previewed in a
 * template before it is applied. Built from the same sections, tokens and
 * layout settings the live storefront reads, so what is previewed is what the
 * store gets; the parts that need a real store (basket, account, currency)
 * are left out.
 */

const SECTION_TITLE = "text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase";

/** The template's tree in one language: its copy, layout, product page and design. */
export function demoTree(template: StoreTemplate, locale: Locale): CraftTree {
  return templateTree(template, { sourceLocale: locale, locales: [locale] });
}

export function demoDesign(template: StoreTemplate): ResolvedDesign {
  return resolveDesign({ theme: template.theme, design: template.design });
}

export async function demoContext(input: {
  template: StoreTemplate;
  locale: Locale;
  base: string;
  brand: { name: string; logoUrl: string | null };
  products: DemoProduct[];
  collections: StorefrontCollection[];
}): Promise<StorefrontContext> {
  const messages = await getMessages({ locale: input.locale });
  return {
    storeName: input.brand.name,
    clientName: input.brand.name,
    base: input.base,
    logoUrl: input.brand.logoUrl,
    design: demoDesign(input.template),
    // No store id: quick add and sign-up forms are left out of a demo.
    products: input.products.map((p) => p.card),
    collections: input.collections,
    preview: false,
    t: messages.storefront.sections,
    locale: input.locale,
    demoNote: messages.templates.demoNewsletter,
  };
}

/* ------------------------------------------------------------------ shell */

export async function TemplateShell({
  template,
  locale,
  base,
  brand,
  collections,
  notice,
  children,
}: {
  template: StoreTemplate;
  locale: Locale;
  base: string;
  brand: { name: string; logoUrl: string | null };
  collections: StorefrontCollection[];
  /** A line above the store saying what this is, with a way back. */
  notice: React.ReactNode;
  children: React.ReactNode;
}) {
  const [messages, t] = await Promise.all([getMessages({ locale }), getTranslations({ locale, namespace: "storefront" })]);
  const tree = demoTree(template, locale);
  const design = demoDesign(template);
  const layout = layoutSettings(tree);
  const site = siteContent(tree, locale, locale);
  const sections = messages.storefront.sections;
  const announcements = [site.announcement, site.announcement2, site.announcement3].filter((m) => m.trim() !== "");
  const centred = layout.headerLayout === "center";
  const linkClass = "inline-flex h-10 items-center rounded-[var(--radius)] px-3 text-sm font-medium text-foreground hover:bg-muted";
  const links = [
    { href: `${base}/products`, label: site.navShop || t("chrome.shop") },
    ...collections
      .filter((c) => c.name !== (site.navShop || t("chrome.shop")))
      .slice(0, 3)
      .map((c) => ({ href: `${base}/collections/${c.handle}`, label: c.name ?? "" })),
  ];

  const brandMark = (
    <Link href={base} className={`flex min-w-0 items-center gap-2.5 ${centred ? "justify-center" : ""}`}>
      <StoreMark name={brand.name} logoUrl={brand.logoUrl} />
      <span className="font-heading truncate text-lg font-semibold tracking-tight text-foreground">{brand.name}</span>
    </Link>
  );
  const desktopNav = (
    <nav aria-label={t("chrome.shop")} className="hidden min-w-0 items-center gap-0.5 md:flex">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={linkClass}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
  const mobileMenu = (
    <div className="md:hidden">
      <StorefrontMenu links={links}>{null}</StorefrontMenu>
    </div>
  );
  const actions = (
    <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
      {centred ? null : mobileMenu}
      <Link href={`${base}/products`} aria-label={t("chrome.basket")} className="inline-flex size-10 items-center justify-center rounded-[var(--radius)] text-foreground hover:bg-muted">
        <ShoppingBagIcon aria-hidden className="size-5" />
      </Link>
    </div>
  );
  const newsletter = layout.footerNewsletter ? (
    <div className="max-w-md">
      <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{site.newsletterHeading || t("chrome.newsletterTitle")}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{site.newsletterBody || t("chrome.newsletterBody")}</p>
      <NewsletterForm
        storeId=""
        source="footer"
        className="mt-4"
        demoNote={messages.templates.demoNewsletter}
        labels={{ email: sections.newsletterEmail, placeholder: sections.newsletterEmail, button: t("chrome.newsletterButton") }}
      />
    </div>
  ) : null;
  const footerLink = "hover:text-foreground hover:underline";

  return (
    <Document lang={locale} style={storeThemeStyle(design)} attributes={storeThemeAttributes(design)} className={STORE_FONT_CLASSES}>
      <NextIntlClientProvider locale={locale} messages={{ common: messages.common, storefront: { chrome: messages.storefront.chrome } }}>
        <div className="flex min-h-full flex-col bg-background">
          {notice}
          {announcements.length > 0 ? (
            <AnnouncementBar
              messages={announcements}
              countdown={null}
              labels={{ previous: t("chrome.previousMessage"), next: t("chrome.nextMessage") }}
            />
          ) : null}
          <header
            data-transparent={layout.headerTransparent ? "true" : "false"}
            className={`sf-header ${layout.headerSticky ? "sticky" : "relative"} top-0 z-40 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur`}
          >
            {layout.headerTransparent ? <HeaderScrollState /> : null}
            {centred ? (
              <div className="mx-auto grid h-16 w-full max-w-[88rem] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
                <div className="flex min-w-0 items-center">
                  {mobileMenu}
                  {desktopNav}
                </div>
                {brandMark}
                {actions}
              </div>
            ) : (
              <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center gap-x-3 px-4 sm:px-6 md:gap-x-6">
                {brandMark}
                {desktopNav}
                {actions}
              </div>
            )}
          </header>

          <main className="flex-1">{children}</main>

          {layout.footerTrust ? (
            <div className="border-t border-border bg-muted/60">
              <ul className="mx-auto grid w-full max-w-[88rem] grid-cols-2 gap-x-6 gap-y-4 px-4 py-6 text-sm font-medium text-foreground sm:px-6 lg:grid-cols-4">
                {(
                  [
                    [LockIcon, t("chrome.trustSecure")],
                    [TruckIcon, t("chrome.trustTracked")],
                    [SparklesIcon, t("chrome.trustMadeToOrder")],
                    [SmileIcon, t("chrome.trustSupport")],
                  ] as const
                ).map(([Icon, label]) => (
                  <li key={label} className="flex items-center gap-2.5">
                    <Icon aria-hidden className="size-5 shrink-0 text-[var(--sf-primary-text)]" strokeWidth={1.6} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <footer className={`${layout.footerTrust ? "" : "mt-16"} border-t border-border bg-muted/60`}>
            {layout.footerLayout === "centered" ? (
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-14 text-center sm:px-6">
                <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">{brand.name}</p>
                {site.footerNote ? <p className="-mt-4 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p> : null}
                {newsletter ? <div className="flex w-full flex-col items-center">{newsletter}</div> : null}
                <nav aria-label={t("chrome.information")} className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-inksoft">
                  <Link href={`${base}/products`} className={footerLink}>
                    {t("chrome.allProducts")}
                  </Link>
                  {collections.slice(0, 4).map((c) => (
                    <Link key={c.id} href={`${base}/collections/${c.handle}`} className={footerLink}>
                      {c.name}
                    </Link>
                  ))}
                </nav>
              </div>
            ) : (
              <div className="mx-auto grid w-full max-w-[88rem] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr]">
                <div className="space-y-6">
                  <div>
                    <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{brand.name}</p>
                    {site.footerNote ? <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p> : null}
                  </div>
                  {newsletter}
                </div>
                <div>
                  <p className={SECTION_TITLE}>{t("chrome.shop")}</p>
                  <ul className="mt-3 space-y-2 text-sm text-inksoft">
                    <li>
                      <Link href={`${base}/products`} className={footerLink}>
                        {t("chrome.allProducts")}
                      </Link>
                    </li>
                    {collections.slice(0, 4).map((c) => (
                      <li key={c.id}>
                        <Link href={`${base}/collections/${c.handle}`} className={footerLink}>
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={SECTION_TITLE}>{t("chrome.information")}</p>
                  <ul className="mt-3 space-y-2 text-sm text-inksoft">
                    {(["shipping", "refunds", "terms", "privacy"] as const).map((key) => (
                      <li key={key}>{t(`policies.${key}`)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="border-t border-border">
              <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
                <p>{t("chrome.legal", { year: String(new Date().getFullYear()), client: brand.name })}</p>
                {layout.footerPayments ? <PaymentMarks label={t("chrome.weAccept")} /> : null}
              </div>
            </div>
          </footer>
        </div>
      </NextIntlClientProvider>
    </Document>
  );
}

/* ------------------------------------------------------------------ pages */

export function TemplateHome({ tree, ctx }: { tree: CraftTree; ctx: StorefrontContext }) {
  return (
    <>
      {sectionsFromTree(tree).map((section, index) => (
        // A marker for the template check script; `contents` keeps it out of the layout.
        <div key={section.id} data-template-section={section.type} className="contents">
          <RenderSection type={section.type} props={section.props} ctx={ctx} index={index} />
        </div>
      ))}
    </>
  );
}

/** The shop page or one collection, laid out the way the template sets its collection pages. */
export async function TemplateCollection({
  template,
  locale,
  base,
  products,
  collection,
}: {
  template: StoreTemplate;
  locale: Locale;
  base: string;
  products: DemoProduct[];
  collection: StorefrontCollection | null;
}) {
  const t = await getTranslations({ locale, namespace: "storefront" });
  const layout = layoutSettings(demoTree(template, locale));
  const shown = collection ? products.filter((p) => collection.productIds.includes(p.card.id)) : products;
  const title = collection?.name ?? t("shop.title");
  const count = t("shop.productCount", { count: shown.length });
  const banner = layout.collectionHeader === "banner" && collection?.imageUrl ? collection.imageUrl : null;
  return (
    <>
      {banner ? <CollectionBanner title={title} description="" count={count} imageUrl={banner} /> : null}
      <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${banner ? "pt-8 pb-12" : "py-12"}`}>
        {banner ? null : (
          <header className="max-w-2xl">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{count}</p>
          </header>
        )}
        <ProductTileGrid className="mt-10" columns={layout.collectionColumns}>
          {shown.map((product, index) => (
            <ProductTile
              key={product.card.id}
              href={`${base}/products/${product.card.slug}`}
              name={product.card.name}
              tagline={product.description}
              price={product.card.price}
              imageUrl={product.card.imageUrl ?? null}
              imageAlt={product.card.name}
              placeholder={t("shop.previewSoon")}
              priority={!banner && index < 3}
              columns={layout.collectionColumns}
              badge={product.personalise ? <Badge tone="brand">{t("shop.personalise")}</Badge> : null}
            />
          ))}
        </ProductTileGrid>
      </div>
    </>
  );
}

/** A product page built from the template's product page blocks. */
export async function TemplateProduct({
  template,
  locale,
  base,
  product,
  ctx,
}: {
  template: StoreTemplate;
  locale: Locale;
  base: string;
  product: DemoProduct;
  ctx: StorefrontContext;
}) {
  const [t, messages] = await Promise.all([getTranslations({ locale, namespace: "storefront" }), getMessages({ locale })]);
  const blocks = productBlocks(demoTree(template, locale));
  const sectionCopy = messages.storefront.sections;
  const related = ctx.products.filter((p) => p.id !== product.card.id).slice(0, 8);
  const text = (props: Record<string, unknown>, key: string) => String(props[key] ?? "");

  return (
    <div className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-6">
      {blocks.map((block) => {
        const props = block.props;
        switch (block.type) {
          case "ProductMain":
            return (
              <DemoBuyBox
                key={block.id}
                product={{ name: product.card.name, price: product.card.price, images: product.images.map((src) => ({ src, srcSet: srcSetFor(src) })), colour: product.colour, sizes: product.sizes, personalise: product.personalise, tags: product.card.tags ?? [] }}
                layout={{
                  gallery: props.galleryLayout === "grid" || props.galleryLayout === "stacked" ? props.galleryLayout : "thumbnails",
                  side: props.gallerySide === "right" ? "right" : "left",
                  showTags: props.showTags !== false,
                  trustNote: text(props, "trustNote"),
                }}
                labels={{
                  colour: t("purchase.colour"),
                  size: t("purchase.size"),
                  personalise: t("shop.personalise"),
                  textPlaceholder: t("purchase.textPlaceholder"),
                  addToBasket: t("purchase.addToBasket"),
                  demoNote: messages.templates.demoBasket,
                  breadcrumbShop: t("product.breadcrumbShop"),
                  shopHref: `${base}/products`,
                }}
              />
            );
          case "DescriptionTabs": {
            const panels = [
              { id: "description", label: t("product.tabDescription"), content: <p className="text-base leading-relaxed text-inksoft">{product.description}</p> },
              ...(props.showDetails !== false
                ? [{ id: "details", label: t("product.tabDetails"), content: <p className="text-sm text-muted-foreground">{t("product.madeToOrder")}</p> }]
                : []),
              ...(props.showShipping !== false
                ? [{ id: "shipping", label: t("product.tabShipping"), content: <p className="text-sm text-inksoft">{t("product.shipsWithin", { days: 5 })}</p> }]
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
                          <span aria-hidden className="text-xl leading-none transition-transform group-open:rotate-45">
                            +
                          </span>
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
            if (product.sizes.length === 0) return null;
            const rows = text(props, "table")
              .split("\n")
              .map((line) => line.split("|").map((cell) => cell.trim()))
              .filter((cells) => cells.some(Boolean));
            const [head, ...body] = rows;
            return (
              <details key={block.id} className="group mt-12 max-w-3xl rounded-[var(--radius)] border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <RulerIcon aria-hidden className="size-4" />
                    {text(props, "title") || t("product.sizeGuide")}
                  </span>
                  <span aria-hidden className="text-xl leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="px-5 pb-5">
                  {text(props, "intro") ? <p className="mb-4 text-sm text-muted-foreground">{text(props, "intro")}</p> : null}
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
                              {cells.map((cell, i) => (
                                <td key={i} className={`py-2 pr-4 ${i === 0 ? "font-medium text-foreground" : "text-inksoft"}`}>
                                  {cell}
                                </td>
                              ))}
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
                  .filter((n) => text(props, `feature${n}Title`))
                  .map((n) => (
                    <li key={n} className="flex gap-4">
                      <SfIcon name={text(props, `feature${n}Icon`)} className="mt-0.5 size-6 shrink-0 text-[var(--sf-primary-text)]" />
                      <div>
                        <h2 className="font-semibold text-foreground">{text(props, `feature${n}Title`)}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text(props, `feature${n}Body`)}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            );
          case "ProductText":
            return (
              <section key={block.id} className="mt-14 max-w-3xl">
                <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{text(props, "heading")}</h2>
                <p className="mt-3 text-base leading-relaxed whitespace-pre-line text-inksoft">{text(props, "body")}</p>
              </section>
            );
          case "Reviews":
            return (
              <section key={block.id} className="mt-16 border-t border-border pt-10">
                <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{t("reviews.title")}</h2>
                <p className="mt-4 text-sm text-muted-foreground">{t("reviews.none")}</p>
              </section>
            );
          case "RelatedProducts":
            return related.length > 0 ? (
              <section key={block.id} aria-labelledby={`related-${block.id}`} className="mt-16 border-t border-border pt-10">
                <h2 id={`related-${block.id}`} className="font-heading mb-6 text-xl font-semibold tracking-tight text-foreground">
                  {text(props, "title") || t("product.related")}
                </h2>
                <Carousel label={text(props, "title") || t("product.related")} previous={sectionCopy.previous} next={sectionCopy.next}>
                  {related.map((card) => (
                    <ProductCard key={card.id} product={card} ctx={ctx} columns={4} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]" />
                  ))}
                </Carousel>
              </section>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
}

/** An address inside a demo store that names no product or collection. */
export async function TemplateMissing({ locale, base }: { locale: Locale; base: string }) {
  const t = await getTranslations({ locale, namespace: "storefront.fallback" });
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("notFoundBody")}</p>
      <Link href={`${base}/products`} className="sf-btn sf-btn-primary mt-8 inline-flex">
        {t("browseProducts")}
      </Link>
    </div>
  );
}
