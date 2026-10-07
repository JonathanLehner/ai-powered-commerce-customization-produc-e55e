import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { readCurrency, readShopperSession, setCurrency } from "@/app/actions/shop";
import { BasketSheet, type BasketSheetLine } from "@/components/BasketSheet";
import { Document, siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { StorefrontFallbackProvider } from "@/components/StorefrontFallback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { basketTotals } from "@/lib/basket";
import { getCart, getStorefront, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { storefrontMetadata, storeTagline } from "@/lib/storefront-meta";
import { storeThemeVars } from "@/lib/store-theme";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { classNames } from "@/lib/util";

/**
 * A client storefront is white-labelled, so its tab titles, description and
 * share preview belong to the shop rather than to Parcelith: the title suffix
 * is the store name, and the preview carries the store logo. An address that
 * belongs to no store falls back to the platform's own metadata, because that
 * is the chrome the 404 below renders.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return siteMetadata;
  const storefront = await getStorefront(store.id);
  return storefrontMetadata(store, storeTagline(storefront?.published));
}

/**
 * Root layout for a client storefront. It is a root layout rather than a nested
 * one so the page can be marked with the store's own language: `<html lang>` is
 * what browsers and screen readers announce, and it is the only place the store
 * language can be applied to the whole document.
 *
 * It is also where the store's brand is applied. The wrapper carries the design
 * tokens `storeThemeVars()` derives from the theme chosen in guided setup —
 * colour ramp, ink, surfaces, corner radius and typeface — and because the
 * Tailwind theme is declared `inline`, every component below re-tints from them
 * with no per-component override.
 */
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);

  // An address that belongs to no store still has to render as a page rather
  // than a blank document. The layout carries Parcelith's own chrome instead of
  // a shop's, and keeps rendering `children`: every page below returns the
  // "not this address" body when the store is missing, so the whole page is in
  // the server's HTML.
  if (!store) {
    return (
      <PlainDocument note="Parcelith hosts branded shops for agencies and their clients. Each shop has its own web address.">
        {children}
      </PlainDocument>
    );
  }

  const { tag, t } = storefrontLocale(store);
  const support = storeSupport(store);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const items = cart?.items ?? [];
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Priced through the one place basket money is worked out, so the drawer's
  // subtotal is the same number /cart and the checkout show.
  const priced = items.length > 0 ? await basketTotals(store, items, currency) : null;
  const drawerLines: BasketSheetLine[] = (priced?.lines ?? []).map(({ item, unit }) => ({
    id: item.id,
    productName: item.productName,
    variantName: item.variantName,
    quantity: item.quantity,
    amount: unit * item.quantity,
    previewUrl: item.previewUrl,
    text: item.text,
  }));

  const carriers = store.carriers
    .filter((c) => c.enabled)
    .map((c) => c.carrier.toUpperCase())
    .join(" · ");

  return (
    <Document lang={tag}>
      <div
        className={classNames("store-surface flex min-h-full flex-col bg-background", STORE_FONT_CLASSES)}
        style={storeThemeVars(store.theme)}
      >
        <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
            <Link
              href={`/s/${store.slug}`}
              className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {store.logoUrl ? (
                <Image
                  src={store.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className="h-9 w-9 shrink-0 rounded-md object-contain"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
                >
                  {store.name.slice(0, 1)}
                </span>
              )}
              <span className="truncate text-[15px] font-semibold tracking-tight text-ink sm:text-base">
                {store.name}
              </span>
            </Link>

            <nav aria-label={t.chrome.shop} className="hidden items-center sm:flex">
              <Link
                href={`/s/${store.slug}/products`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-inksoft transition-colors hover:bg-secondary hover:text-ink"
              >
                {t.chrome.shop}
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <form action={setCurrency} className="hidden items-center gap-1.5 sm:flex">
                <input type="hidden" name="storeId" value={store.id} />
                <input type="hidden" name="slug" value={store.slug} />
                <label htmlFor="currency" className="sr-only">
                  {t.chrome.currencyLabel}
                </label>
                <Select
                  id="currency"
                  name="currency"
                  defaultValue={currency}
                  className="h-9 w-auto min-w-[5.25rem] py-1.5 text-sm"
                >
                  {store.currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="ghost" size="sm" className="h-9">
                  {t.chrome.currencyApply}
                </Button>
              </form>
              <BasketSheet
                slug={store.slug}
                lines={drawerLines}
                count={cartCount}
                subtotal={priced?.subtotal ?? 0}
                currency={currency}
                localeTag={tag}
                t={t.chrome}
                basket={t.basket}
                viewBasketLabel={t.purchase.viewBasket}
              />
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* The not-found and error boundaries live inside this main area and
              are given no params, so they read the store from here. */}
          <StorefrontFallbackProvider
            value={{
              slug: store.slug,
              storeName: store.name,
              basketLabel: t.basket.title,
              orderStatusLabel: t.chrome.orderStatus,
              t: t.fallback,
            }}
          >
            {children}
          </StorefrontFallbackProvider>
        </main>

        <footer className="mt-20 border-t border-line bg-secondary">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div>
              <p className="text-sm font-semibold text-ink">{store.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {fmt(t.chrome.operatedBy, { client: store.clientName })}
              </p>
            </div>
            <div>
              <p className="section-title">{t.chrome.shop}</p>
              <ul className="mt-3 space-y-2 text-sm text-inksoft">
                <li>
                  <Link href={`/s/${store.slug}/products`} className="hover:text-ink hover:underline">
                    {t.chrome.allProducts}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/cart`} className="hover:text-ink hover:underline">
                    {t.chrome.basket}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/orders`} className="hover:text-ink hover:underline">
                    {t.chrome.orderStatus}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="section-title">{t.chrome.help}</p>
              {support.email || support.phone ? (
                <ul className="mt-3 space-y-2 text-sm text-inksoft">
                  {support.email ? (
                    <li>
                      <span className="text-muted">{t.chrome.supportEmailLabel}:</span>{" "}
                      <a href={supportMailto(support.email)} className="hover:text-ink hover:underline">
                        {support.email}
                      </a>
                    </li>
                  ) : null}
                  {support.phone ? (
                    <li>
                      <span className="text-muted">{t.chrome.supportPhoneLabel}:</span>{" "}
                      <a href={supportTel(support.phone)} className="hover:text-ink hover:underline">
                        {support.phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">{t.chrome.supportPending}</p>
              )}
            </div>
            <div>
              <p className="section-title">{t.chrome.delivery}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {carriers || t.chrome.carriersPending}.{" "}
                {fmt(t.chrome.pricesShownIn, {
                  currency,
                  tax: store.pricesIncludeTax ? t.chrome.taxIncluded : t.chrome.taxAtCheckout,
                })}
              </p>
            </div>
          </div>
          <div className="border-t border-line">
            <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
              {fmt(t.chrome.legal, {
                year: new Date().getFullYear(),
                client: store.clientName,
              })}
            </p>
          </div>
        </footer>
      </div>
    </Document>
  );
}
