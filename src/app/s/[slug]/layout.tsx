import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { readCurrency, readShopperSession, setCurrency } from "@/app/actions/shop";
import { Document, siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { StorefrontFallbackProvider } from "@/components/StorefrontFallback";
import { getCart, getStorefront, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { storefrontMetadata, storeTagline } from "@/lib/storefront-meta";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { THEMES } from "@/lib/types";

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

  const theme = THEMES[store.theme];
  const { tag, t } = storefrontLocale(store);
  const support = storeSupport(store);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const cartCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  return (
    <Document lang={tag}>
      <div className="flex min-h-full flex-col bg-white">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-2.5">
              {store.logoUrl ? (
                <Image
                  src={store.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className="h-9 w-9 shrink-0 rounded object-contain"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ background: theme.accent }}
                >
                  {store.name.slice(0, 1)}
                </span>
              )}
              <span className="truncate text-base font-semibold tracking-tight text-ink">{store.name}</span>
            </Link>

            <nav aria-label={t.chrome.shop} className="flex items-center gap-1 sm:gap-2">
              <Link
                href={`/s/${store.slug}/products`}
                className="rounded-lg px-2.5 py-2 text-sm font-medium text-inksoft hover:bg-canvas hover:text-ink"
              >
                {t.chrome.shop}
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <form action={setCurrency} className="flex items-center gap-1.5">
                <input type="hidden" name="storeId" value={store.id} />
                <input type="hidden" name="slug" value={store.slug} />
                <label htmlFor="currency" className="sr-only">
                  {t.chrome.currencyLabel}
                </label>
                <select
                  id="currency"
                  name="currency"
                  defaultValue={currency}
                  className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
                >
                  {store.currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-ghost btn-sm">
                  {t.chrome.currencyApply}
                </button>
              </form>
              <Link
                href={`/s/${store.slug}/cart`}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
              >
                {cartCount > 0
                  ? fmt(t.chrome.basketWithCount, { count: cartCount })
                  : t.chrome.basket}
              </Link>
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
              accent: theme.accent,
              basketLabel: t.basket.title,
              orderStatusLabel: t.chrome.orderStatus,
              t: t.fallback,
            }}
          >
            {children}
          </StorefrontFallbackProvider>
        </main>

        <footer className="border-t border-line bg-canvas">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div>
              <p className="text-sm font-semibold text-ink">{store.name}</p>
              <p className="mt-1.5 text-sm text-muted">
                {fmt(t.chrome.operatedBy, { client: store.clientName })}
              </p>
            </div>
            <div>
              <p className="section-title">{t.chrome.shop}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-inksoft">
                <li>
                  <Link href={`/s/${store.slug}/products`} className="hover:underline">
                    {t.chrome.allProducts}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/cart`} className="hover:underline">
                    {t.chrome.basket}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/orders`} className="hover:underline">
                    {t.chrome.orderStatus}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="section-title">{t.chrome.help}</p>
              {support.email || support.phone ? (
                <ul className="mt-2 space-y-1.5 text-sm text-inksoft">
                  {support.email ? (
                    <li>
                      <span className="text-muted">{t.chrome.supportEmailLabel}:</span>{" "}
                      <a href={supportMailto(support.email)} className="hover:underline">
                        {support.email}
                      </a>
                    </li>
                  ) : null}
                  {support.phone ? (
                    <li>
                      <span className="text-muted">{t.chrome.supportPhoneLabel}:</span>{" "}
                      <a href={supportTel(support.phone)} className="hover:underline">
                        {support.phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">{t.chrome.supportPending}</p>
              )}
            </div>
            <div>
              <p className="section-title">{t.chrome.delivery}</p>
              <p className="mt-2 text-sm text-muted">
                {store.carriers
                  .filter((c) => c.enabled)
                  .map((c) => c.carrier.toUpperCase())
                  .join(" · ") || t.chrome.carriersPending}
                .{" "}
                {fmt(t.chrome.pricesShownIn, {
                  currency,
                  tax: store.pricesIncludeTax ? t.chrome.taxIncluded : t.chrome.taxAtCheckout,
                })}
              </p>
            </div>
          </div>
          <div className="border-t border-line">
            <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
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
