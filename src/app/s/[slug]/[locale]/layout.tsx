import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { after } from "next/server";
import { readCurrency, setCurrency } from "@/app/actions/shop";
import { BasketProvider, BasketSheet } from "@/components/BasketSheet";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Document, siteMetadata } from "@/components/Document";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PlainDocument } from "@/components/SiteChrome";
import { StoreMark } from "@/components/StoreMark";
import { StorefrontMenu } from "@/components/StorefrontMenu";
import { StoreSearch } from "@/components/StoreSearch";
import { LockIcon, SmileIcon, SparklesIcon, TruckIcon, UserRoundIcon } from "lucide-react";
import { AnnouncementBar, HeaderScrollState, NewsletterForm } from "@/components/storefront/client";
import { PaymentMarks, SocialIcon } from "@/components/storefront/marks";
import { BLOG_PATH, resolveMenu, storeMenus } from "@/lib/content";
import { menuLookups } from "@/lib/storefront-menus";
import { StorefrontFallbackProvider } from "@/components/StorefrontFallback";
import { basketSheetLines, basketTotals } from "@/lib/basket";
import { fxStale, usesAutomaticRates } from "@/lib/currency";
import { refreshStoreFxIfStale } from "@/lib/fx-rates";
import { shopperIntl, shopperLocale, shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { collectionProducts, localizeCollection, navCollectionIds } from "@/lib/collections";
import { POLICY_KEYS, policyPath } from "@/lib/policies";
import { shipDays } from "@/lib/shipping-promise";
import { storefrontBySlug } from "@/lib/storefront-data";
import { resolveDesign } from "@/lib/store-design";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { storeThemeAttributes, storeThemeStyle } from "@/lib/store-theme";
import { layoutSettings } from "@/lib/storefront-layout";
import { storefrontMetadata, storeTagline } from "@/lib/storefront-meta";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { siteContent } from "@/lib/translations";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { kickScheduler } from "@/lib/scheduler";

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
  const { locale, t, base, root } = await shopperIntl(store, requested, `/s/${store.slug}`);
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
  // Market rates a day old are fetched again once this page has gone out.
  if (store.currencies.length > 1 && usesAutomaticRates(store) && fxStale(store)) {
    after(() => refreshStoreFxIfStale(store).catch(() => store));
  }
  kickScheduler();
  const items = basket?.cart.items ?? [];

  // The drawer shows the same prices the basket page does, so they are worked
  // out in the same place rather than re-derived from the stored line.
  const totals = await basketTotals(
    store,
    items,
    currency,
    basket?.discountCode ?? null,
    basket ?? { products: new Map(), brackets: [] },
  );
  const { subtotal } = totals;
  const basketLines = basketSheetLines(totals);


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

  const design = resolveDesign(store);
  const layout = layoutSettings(storefront?.published);
  // Rotating messages: the store's own, else the shipping time the product pages promise.
  const messagesShown = [site.announcement, site.announcement2, site.announcement3].filter((m) => m.trim() !== "");
  const announcements = messagesShown.length > 0 ? messagesShown : announcement ? [announcement] : [];
  // The clock hides itself once the time has passed.
  const countdownAt = layout.announcementCountdown;
  const sections = messages.storefront.sections;
  const centred = layout.headerLayout === "center";
  // The mega menu shows the header's collections, or the first six when none are chosen.
  const megaCollections = (navCollections.length > 0 ? navCollections : collections.map((c) => localizeCollection(c, locale, defaultLocale))).slice(0, 6);
  const mega = layout.megaMenu && megaCollections.length > 0;
  const shopHref = `${base}/products`;
  const linkClass = "inline-flex h-10 items-center rounded-[var(--radius)] px-3 text-sm font-medium text-foreground hover:bg-muted";

  const navLink = (link: (typeof headerLinks)[number]) =>
    link.external ? (
      <a key={link.id} href={link.href} className={linkClass}>
        {link.label}
      </a>
    ) : (
      <Link key={link.id} href={link.href} className={linkClass}>
        {link.label}
      </Link>
    );

  const desktopNav = (
    <nav aria-label={t("chrome.shop")} className="hidden min-w-0 items-center gap-0.5 md:flex">
      {headerLinks.map((link) =>
        mega && link.id === "shop" ? (
          <div key={link.id} className="group/mega">
            <Link href={link.href} className={linkClass} aria-haspopup="true">
              {link.label}
            </Link>
            <div className="invisible absolute inset-x-0 top-full z-50 border-y border-border bg-background opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-focus-within/mega:visible group-focus-within/mega:opacity-100 group-hover/mega:visible group-hover/mega:opacity-100">
              <div className="mx-auto grid w-full max-w-6xl grid-cols-[12rem_1fr] gap-8 px-6 py-8">
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link href={shopHref} className="font-semibold text-foreground hover:underline">
                      {t("chrome.allProducts")}
                    </Link>
                  </li>
                  {megaCollections.map((c) => (
                    <li key={c.id}>
                      <Link href={`${base}/collections/${c.handle}`} className="text-inksoft hover:text-foreground hover:underline">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <ul className="grid grid-cols-3 gap-4 lg:grid-cols-6">
                  {megaCollections.map((c) => (
                    <li key={c.id}>
                      <Link href={`${base}/collections/${c.handle}`} className="group/tile block">
                        <span className="block aspect-[4/5] overflow-hidden rounded-[var(--radius)] bg-muted">
                          {c.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover/tile:scale-[1.04]" />
                          ) : null}
                        </span>
                        <span className="mt-2 block text-sm font-medium text-foreground">{t("chrome.shopAllIn", { name: c.name })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          navLink(link)
        ),
      )}
    </nav>
  );

  const brand = (
    <Link href={base || "/"} className={`flex min-w-0 items-center gap-2.5 ${centred ? "justify-center" : ""}`}>
      <StoreMark name={store.name} logoUrl={store.logoUrl} />
      <span className={`font-heading truncate text-lg font-semibold tracking-tight text-foreground ${store.logoUrl && centred ? "sr-only" : ""}`}>
        {store.name}
      </span>
    </Link>
  );

  const mobileMenu = (
    <div className="md:hidden">
      <StorefrontMenu links={mobileLinks}>
        {locales.length > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t("chrome.languageLabel")}</span>
            <LanguageSelect root={root} locales={locales} defaultLocale={defaultLocale} />
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
  );

  const actions = (
    <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
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
          <LanguageSelect root={root} locales={locales} defaultLocale={defaultLocale} />
        </div>
      ) : null}
      {currencyForm("store-currency", "hidden md:flex", true)}
      {centred ? null : mobileMenu}
      <BasketSheet storeId={store.id} />
    </div>
  );

  const footerLink = "hover:text-foreground hover:underline";
  const social = layout.social.length > 0 ? (
    <div>
      <p className={SECTION_TITLE}>{t("chrome.followUs")}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {layout.social.map(({ network, url }) => (
          <li key={network}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={t(`chrome.social.${network}`)}
              className="inline-flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground"
            >
              <SocialIcon network={network} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  const newsletter = layout.footerNewsletter ? (
    <div className="max-w-md">
      <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{site.newsletterHeading || t("chrome.newsletterTitle")}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{site.newsletterBody || t("chrome.newsletterBody")}</p>
      <NewsletterForm
        storeId={store.id}
        source="footer"
        className="mt-4"
        labels={{ email: sections.newsletterEmail, placeholder: sections.newsletterEmail, button: t("chrome.newsletterButton") }}
      />
    </div>
  ) : null;
  const shopLinks = (
    <ul className="mt-3 space-y-2 text-sm text-inksoft">
      <li>
        <Link href={`${base}/products`} className={footerLink}>
          {t("chrome.allProducts")}
        </Link>
      </li>
      <li>
        <Link href={`${base}/cart`} className={footerLink}>
          {t("chrome.basket")}
        </Link>
      </li>
      <li>
        <Link href={`${base}/orders`} className={footerLink}>
          {t("chrome.orderStatus")}
        </Link>
      </li>
      <li>
        <Link href={`${base}/account`} className={footerLink}>
          {t("account.title")}
        </Link>
      </li>
      {hasBlog ? (
        <li>
          <Link href={`${base}${BLOG_PATH}`} className={footerLink}>
            {t("blog.title")}
          </Link>
        </li>
      ) : null}
    </ul>
  );
  const infoLinks =
    footerLinks.length > 0 ? (
      <ul className="mt-3 space-y-2 text-sm text-inksoft">
        {footerLinks.map((link) => (
          <li key={link.id}>
            {link.external ? (
              <a href={link.href} className={footerLink}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className={footerLink}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    ) : null;
  const help =
    support.email || support.phone ? (
      <ul className="mt-3 space-y-2 text-sm text-inksoft">
        {support.email ? (
          <li>
            <span className="text-muted-foreground">{t("chrome.supportEmailLabel")}:</span>{" "}
            <a href={supportMailto(support.email)} className={footerLink}>
              {support.email}
            </a>
          </li>
        ) : null}
        {support.phone ? (
          <li>
            <span className="text-muted-foreground">{t("chrome.supportPhoneLabel")}:</span>{" "}
            <a href={supportTel(support.phone)} className={footerLink}>
              {support.phone}
            </a>
          </li>
        ) : null}
      </ul>
    ) : null;

  return (
    <Document
      lang={locale}
      style={storeThemeStyle(design)}
      attributes={storeThemeAttributes(design)}
      className={STORE_FONT_CLASSES}
    >
      <NextIntlClientProvider
        locale={locale}
        messages={{ common: messages.common, storefront: messages.storefront }}
      >
        <BasketProvider lines={basketLines} subtotal={subtotal} currency={currency} base={base}>
          <div className="flex min-h-full flex-col bg-background">
            {announcements.length > 0 || countdownAt ? (
              <AnnouncementBar
                messages={announcements}
                countdown={countdownAt ? { endsAt: countdownAt, units: { days: sections.days, hours: sections.hours, minutes: sections.minutes, seconds: sections.seconds } } : null}
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
                  {brand}
                  {actions}
                </div>
              ) : (
                <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center gap-x-3 px-4 sm:px-6 md:gap-x-6">
                  {brand}
                  {desktopNav}
                  {actions}
                </div>
              )}
            </header>

            <main className="flex-1">
              {/* The not-found and error boundaries live inside this main area and
                  are given no params, so they read the store from here. */}
              <StorefrontFallbackProvider
                value={{ base, storeName: store.name, accent: design.colors.primary }}
              >
                {/* The agency's trial ended and its grace period is over: no
                    page takes orders until payment details are added. */}
                {data.paused ? (
                  <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
                    <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                      {t("home.pausedTitle")}
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">{t("home.closedBody")}</p>
                  </div>
                ) : (
                  children
                )}
              </StorefrontFallbackProvider>
            </main>

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
                  <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">{store.name}</p>
                  {site.footerNote ? <p className="-mt-4 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p> : null}
                  {newsletter ? <div className="flex w-full flex-col items-center [&_form]:mx-auto">{newsletter}</div> : null}
                  <nav aria-label={t("chrome.information")} className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-inksoft">
                    <Link href={`${base}/products`} className={footerLink}>{t("chrome.allProducts")}</Link>
                    <Link href={`${base}/orders`} className={footerLink}>{t("chrome.orderStatus")}</Link>
                    <Link href={`${base}/account`} className={footerLink}>{t("account.title")}</Link>
                    {footerLinks.map((link) =>
                      link.external ? (
                        <a key={link.id} href={link.href} className={footerLink}>{link.label}</a>
                      ) : (
                        <Link key={link.id} href={link.href} className={footerLink}>{link.label}</Link>
                      ),
                    )}
                  </nav>
                  {social ? <div className="[&_ul]:justify-center">{social}</div> : null}
                  {help}
                </div>
              ) : (
                <div className="mx-auto grid w-full max-w-[88rem] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                  <div className="space-y-6">
                    <div>
                      <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{store.name}</p>
                      {site.footerNote ? (
                        <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p>
                      ) : null}
                    </div>
                    {newsletter}
                  </div>
                  <div>
                    <p className={SECTION_TITLE}>{t("chrome.shop")}</p>
                    {shopLinks}
                  </div>
                  {infoLinks ? (
                    <div>
                      <p className={SECTION_TITLE}>{t("chrome.information")}</p>
                      {infoLinks}
                    </div>
                  ) : null}
                  {help || social ? (
                    <div className="space-y-6">
                      {help ? (
                        <div>
                          <p className={SECTION_TITLE}>{t("chrome.help")}</p>
                          {help}
                        </div>
                      ) : null}
                      {social}
                    </div>
                  ) : null}
                </div>
              )}
              <Separator />
              <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
                <p>{t("chrome.legal", { year: String(new Date().getFullYear()), client: store.clientName })}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {POLICY_KEYS.map((key) => (
                    <Link key={key} href={policyPath(base, key)} className="hover:text-foreground hover:underline">
                      {t(`policies.${key}`)}
                    </Link>
                  ))}
                </div>
                {layout.footerPayments ? <PaymentMarks label={t("chrome.weAccept")} /> : null}
              </div>
            </footer>
          </div>
        </BasketProvider>
      </NextIntlClientProvider>
    </Document>
  );
}
