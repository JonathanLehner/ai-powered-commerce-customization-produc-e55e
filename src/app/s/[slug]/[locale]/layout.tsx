import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { readCurrency, setCurrency } from "@/app/actions/shop";
import { BasketProvider, BasketSheet, type BasketSheetLine } from "@/components/BasketSheet";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Document, siteMetadata } from "@/components/Document";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PlainDocument } from "@/components/SiteChrome";
import { StoreMark } from "@/components/StoreMark";
import { StorefrontMenu } from "@/components/StorefrontMenu";
import { StoreSearch } from "@/components/StoreSearch";
import { UserRoundIcon } from "lucide-react";
import { BLOG_PATH, resolveMenu, storeMenus } from "@/lib/content";
import { menuLookups } from "@/lib/storefront-menus";
import { StorefrontFallbackProvider } from "@/components/StorefrontFallback";
import { basketTotals } from "@/lib/basket";
import { shopperIntl, shopperLocale, shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { collectionProducts, localizeCollection, navCollectionIds } from "@/lib/collections";
import { variantPhoto } from "@/lib/line-preview";
import { POLICY_KEYS, policyPath } from "@/lib/policies";
import { shipDays } from "@/lib/shipping-promise";
import { storefrontBySlug } from "@/lib/storefront-data";
import { storeThemeStyle } from "@/lib/store-theme";
import { storefrontMetadata, storeTagline } from "@/lib/storefront-meta";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { siteContent } from "@/lib/translations";
import { THEMES } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * A client storefront is white-labelled, so its tab titles, description and
 * share preview belong to the shop rather than to Parcelith: the title suffix
 * is the store name, and the preview is drawn in the store's colours. An address that
 * belongs to no store falls back to the platform's own metadata, because that
 * is the chrome the 404 below renders.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const data = await storefrontBySlug(slug);
  if (!data) return siteMetadata;
  const { store, storefront } = data;
  const active = shopperLocale(store, locale);
  const t = await getTranslations({ locale: active, namespace: "storefront.meta" });
  const site = siteContent(storefront?.published, active, storeLanguages(store).defaultLocale);
  return storefrontMetadata(store, t, storeTagline(storefront?.published), site, active);
}

/**
 * Root layout for a client storefront. It is a root layout rather than a nested
 * one so the page can be marked with the shopper's language: `<html lang>` is
 * what browsers and screen readers announce, and it is the only place the
 * language can be applied to the whole document. The language is the
 * `[locale]` segment `src/proxy.ts` rewrote the address to. It is also where the store's
 * theme is applied, for the same reason — `storeThemeStyle` writes the client's
 * colours, type and hairlines onto the shadcn variables on `<html>`, so every
 * component below reads the client's brand and the Sheet and Select overlays
 * that portal into `<body>` do too.
 */
/** The small uppercase heading above a footer column. */
const SECTION_TITLE = "text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale: requested } = await params;
  const data = await storefrontBySlug(slug);

  // An address that belongs to no store still has to render as a page rather
  // than a blank document. The layout carries Parcelith's own chrome instead of
  // a shop's, and keeps rendering `children`: every page below returns the
  // "not this address" body when the store is missing, so the whole page is in
  // the server's HTML.
  if (!data) {
    return (
      <PlainDocument note="© Parcelith">
        {children}
      </PlainDocument>
    );
  }

  const { store, storefront, collections, basket, menuLinks } = data;
  const theme = THEMES[store.theme];
  const { locale, t, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { locales, defaultLocale } = storeLanguages(store);
  const messages = await shopperMessages(store, locale);
  // The announcement, navigation labels and footer note the store published,
  // in the shopper's language. An empty label keeps the built-in one.
  const site = siteContent(storefront?.published, locale, defaultLocale);
  // An empty announcement shows the shipping time the product pages promise.
  const days = shipDays(storefront?.published);
  const announcement = site.announcement || (days ? t("chrome.shipsWithin", { days }) : "");
  // The collections the published header links to, in the order chosen there.
  // One deleted since is skipped.
  const navCollections = collectionProducts(navCollectionIds(storefront?.published), collections).map((c) =>
    localizeCollection(c, locale, defaultLocale),
  );
  const support = storeSupport(store);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const items = basket?.cart.items ?? [];

  // The drawer shows the same prices the basket page does, so they are worked
  // out in the same place rather than re-derived from the stored line.
  const { products, lines, subtotal } = await basketTotals(
    store,
    items,
    currency,
    basket?.discountCode ?? null,
    basket ?? { products: new Map(), rates: new Map() },
  );
  const basketLines: BasketSheetLine[] = lines.map(({ item, unit }, index) => ({
    id: item.id,
    productName: item.productName,
    variantName: item.variantName,
    quantity: item.quantity,
    amount: unit * item.quantity,
    previewUrl: item.previewUrl ?? variantPhoto(products[index], item.variantId),
    previewOverlay: item.previewOverlay ?? null,
    text: item.text,
    artworkUrl: item.artworkUrl,
    artworkPlacement: item.artworkPlacement ?? null,
    plainVariantId: item.text || item.artworkUrl ? null : item.variantId,
  }));

  // The header menu the store built, or the built-in links when it has none:
  // Shop, the collections chosen in the storefront editor and Order status.
  const menus = storeMenus(store);
  const lookups = menuLookups(data);
  const customHeader = resolveMenu(menus.header, base, lookups, locale, defaultLocale);
  const footerLinks = resolveMenu(menus.footer, base, lookups, locale, defaultLocale);
  const hasBlog = menuLinks.entries.some((entry) => entry.kind === "post");
  const headerLinks =
    customHeader.length > 0
      ? customHeader
      : [
          { id: "shop", href: `${base}/products`, label: site.navShop || t("chrome.shop"), external: false },
          ...navCollections.map((c) => ({
            id: c.id,
            href: `${base}/collections/${c.handle}`,
            label: c.name,
            external: false,
          })),
          { id: "orders", href: `${base}/orders`, label: site.navOrders || t("chrome.orderStatus"), external: false },
        ];
  // On small screens the header is one row and the links move into the menu.
  const mobileLinks = [
    ...headerLinks.map(({ href, label }) => ({ href, label })),
    { href: `${base}/search`, label: t("search.title") },
    { href: `${base}/account`, label: t("account.title") },
  ];

  // The currency picker, in the desktop header and in the small-screen menu.
  // Only the desktop one carries the no-JavaScript fallback: the menu cannot
  // open without JavaScript.
  const currencyForm = (id: string, className: string, fallback: boolean) => (
    <form action={setCurrency} className={`${className} items-center gap-1.5`}>
      <input type="hidden" name="storeId" value={store.id} />
      <input type="hidden" name="slug" value={store.slug} />
      <input type="hidden" name="back" value={base} />
      {fallback ? (
        <Label htmlFor={id} className="sr-only">
          {t("chrome.currencyLabel")}
        </Label>
      ) : null}
      <CurrencySelect id={id} defaultValue={currency} currencies={store.currencies} />
      {/* The Select applies a currency as soon as it is picked, but it cannot
          open without JavaScript. Then the browser shows this native select
          and submit instead, and hides the Select's dead trigger. */}
      {fallback ? (
        <noscript>
          <style>{`#${id}{display:none}`}</style>
          <select
            name="currency"
            defaultValue={currency}
            aria-label={t("chrome.currencyLabel")}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {store.currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <Button type="submit" variant="ghost" size="lg">
            {t("chrome.currencyApply")}
          </Button>
        </noscript>
      ) : null}
    </form>
  );

  return (
    <Document lang={locale} style={storeThemeStyle(store.theme)}>
      <NextIntlClientProvider
        locale={locale}
        messages={{ common: messages.common, storefront: messages.storefront }}
      >
        <BasketProvider lines={basketLines} subtotal={subtotal} currency={currency} base={base}>
          <div className="flex min-h-full flex-col bg-background">
            {announcement ? (
              <div className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
                {announcement}
              </div>
            ) : null}
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur">
              <div className="mx-auto flex w-full max-w-6xl items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 md:flex-wrap md:gap-x-5 md:py-3">
                <Link href={base} className="flex min-w-0 items-center gap-2.5">
                  <StoreMark name={store.name} logoUrl={store.logoUrl} />
                  <span className="font-heading truncate text-base font-semibold tracking-tight text-foreground">
                    {store.name}
                  </span>
                </Link>

                <nav
                  aria-label={t("chrome.shop")}
                  className="no-scrollbar -mx-1 hidden max-w-full min-w-0 items-center gap-1 overflow-x-auto px-1 md:flex"
                >
                  {headerLinks.map((link) =>
                    link.external ? (
                      <a key={link.id} href={link.href} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                        {link.label}
                      </a>
                    ) : (
                      <Link key={link.id} href={link.href} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                        {link.label}
                      </Link>
                    ),
                  )}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <StoreSearch storeId={store.id} base={base} className="hidden w-44 lg:block xl:w-56" />
                  <Link
                    href={`${base}/account`}
                    aria-label={t("account.title")}
                    title={t("account.title")}
                    className={`${buttonVariants({ variant: "ghost", size: "icon-lg" })} hidden md:inline-flex`}
                  >
                    <UserRoundIcon aria-hidden />
                  </Link>
                  {locales.length > 1 ? (
                    <div className="hidden md:block">
                      <LanguageSelect root={`/s/${store.slug}`} locales={locales} defaultLocale={defaultLocale} />
                    </div>
                  ) : null}
                  {currencyForm("store-currency", "hidden md:flex", true)}
                  <div className="md:hidden">
                    <StorefrontMenu links={mobileLinks}>
                      {locales.length > 1 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">{t("chrome.languageLabel")}</span>
                          <LanguageSelect root={`/s/${store.slug}`} locales={locales} defaultLocale={defaultLocale} />
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="store-currency-menu" className="font-normal text-muted-foreground">
                          {t("chrome.currencyLabel")}
                        </Label>
                        {currencyForm("store-currency-menu", "flex", false)}
                      </div>
                    </StorefrontMenu>
                  </div>
                  <BasketSheet storeId={store.id} />
                </div>
              </div>
            </header>

            <main className="flex-1">
              {/* The not-found and error boundaries live inside this main area and
                  are given no params, so they read the store from here. */}
              <StorefrontFallbackProvider
                value={{ base, storeName: store.name, accent: theme.accent }}
              >
                {children}
              </StorefrontFallbackProvider>
            </main>

            <footer className="mt-16 border-t border-border bg-muted/60">
              <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">{store.name}</p>
                  {site.footerNote ? (
                    <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p>
                  ) : null}
                </div>
                <div>
                  <p className={SECTION_TITLE}>{t("chrome.shop")}</p>
                  <ul className="mt-3 space-y-2 text-sm text-inksoft">
                    <li>
                      <Link href={`${base}/products`} className="hover:text-foreground hover:underline">
                        {t("chrome.allProducts")}
                      </Link>
                    </li>
                    <li>
                      <Link href={`${base}/cart`} className="hover:text-foreground hover:underline">
                        {t("chrome.basket")}
                      </Link>
                    </li>
                    <li>
                      <Link href={`${base}/orders`} className="hover:text-foreground hover:underline">
                        {t("chrome.orderStatus")}
                      </Link>
                    </li>
                    <li>
                      <Link href={`${base}/account`} className="hover:text-foreground hover:underline">
                        {t("account.title")}
                      </Link>
                    </li>
                    {hasBlog ? (
                      <li>
                        <Link href={`${base}${BLOG_PATH}`} className="hover:text-foreground hover:underline">
                          {t("blog.title")}
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                </div>
                {footerLinks.length > 0 ? (
                  <div>
                    <p className={SECTION_TITLE}>{t("chrome.information")}</p>
                    <ul className="mt-3 space-y-2 text-sm text-inksoft">
                      {footerLinks.map((link) => (
                        <li key={link.id}>
                          {link.external ? (
                            <a href={link.href} className="hover:text-foreground hover:underline">
                              {link.label}
                            </a>
                          ) : (
                            <Link href={link.href} className="hover:text-foreground hover:underline">
                              {link.label}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {support.email || support.phone ? (
                  <div>
                    <p className={SECTION_TITLE}>{t("chrome.help")}</p>
                    <ul className="mt-3 space-y-2 text-sm text-inksoft">
                      {support.email ? (
                        <li>
                          <span className="text-muted-foreground">{t("chrome.supportEmailLabel")}:</span>{" "}
                          <a href={supportMailto(support.email)} className="hover:text-foreground hover:underline">
                            {support.email}
                          </a>
                        </li>
                      ) : null}
                      {support.phone ? (
                        <li>
                          <span className="text-muted-foreground">{t("chrome.supportPhoneLabel")}:</span>{" "}
                          <a href={supportTel(support.phone)} className="hover:text-foreground hover:underline">
                            {support.phone}
                          </a>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
              <Separator />
              <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
                <p>{t("chrome.legal", { year: String(new Date().getFullYear()), client: store.clientName })}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {POLICY_KEYS.map((key) => (
                    <Link key={key} href={policyPath(base, key)} className="hover:text-foreground hover:underline">
                      {t(`policies.${key}`)}
                    </Link>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </BasketProvider>
      </NextIntlClientProvider>
    </Document>
  );
}
