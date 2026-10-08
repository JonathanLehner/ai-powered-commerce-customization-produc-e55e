import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { readCurrency, readShopperSession, setCurrency } from "@/app/actions/shop";
import { BasketSheet, type BasketSheetLine } from "@/components/BasketSheet";
import { Document, siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { StorefrontFallbackProvider } from "@/components/StorefrontFallback";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import { getCart, getStorefront, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { storeThemeStyle } from "@/lib/store-theme";
import { storefrontMetadata, storeTagline } from "@/lib/storefront-meta";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { THEMES } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
 * language can be applied to the whole document. It is also where the store's
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
  const { tag, t, money } = storefrontLocale(store);
  const support = storeSupport(store);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const items = cart?.items ?? [];
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // The drawer shows the same prices the basket page does, so they are worked
  // out in the same place rather than re-derived from the stored line.
  const discountCode = await cartDiscountCode(store.id, cart);
  const { lines, subtotal } = await basketTotals(store, items, currency, discountCode);
  const basketLines: BasketSheetLine[] = lines.map(({ item, unit }) => ({
    id: item.id,
    productName: item.productName,
    variantName: item.variantName,
    quantity: item.quantity,
    amount: money(unit * item.quantity, currency),
    previewUrl: item.previewUrl,
    text: item.text,
  }));

  return (
    <Document lang={tag} style={storeThemeStyle(store.theme)}>
      <div className="flex min-h-full flex-col bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
            <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-2.5">
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
              <span className="font-heading truncate text-base font-semibold tracking-tight text-foreground">
                {store.name}
              </span>
            </Link>

            <nav aria-label={t.chrome.shop} className="flex items-center gap-1">
              <Link
                href={`/s/${store.slug}/products`}
                className={buttonVariants({ variant: "ghost", size: "lg" })}
              >
                {t.chrome.shop}
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <form action={setCurrency} className="flex items-center gap-1.5">
                <input type="hidden" name="storeId" value={store.id} />
                <input type="hidden" name="slug" value={store.slug} />
                <Label htmlFor="store-currency" className="sr-only">
                  {t.chrome.currencyLabel}
                </Label>
                <select
                  id="store-currency"
                  name="currency"
                  defaultValue={currency}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {store.currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="ghost" size="lg">
                  {t.chrome.currencyApply}
                </Button>
              </form>
              <BasketSheet
                storeId={store.id}
                slug={store.slug}
                triggerLabel={
                  cartCount > 0
                    ? fmt(t.chrome.basketWithCount, { count: cartCount })
                    : t.chrome.basket
                }
                lines={basketLines}
                subtotal={money(subtotal, currency)}
                t={t.basket}
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
              accent: theme.accent,
              basketLabel: t.basket.title,
              orderStatusLabel: t.chrome.orderStatus,
              t: t.fallback,
            }}
          >
            {children}
          </StorefrontFallbackProvider>
        </main>

        <footer className="mt-16 border-t border-border bg-muted/60">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div>
              <p className="font-heading text-sm font-semibold text-foreground">{store.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {fmt(t.chrome.operatedBy, { client: store.clientName })}
              </p>
            </div>
            <div>
              <p className={SECTION_TITLE}>{t.chrome.shop}</p>
              <ul className="mt-3 space-y-2 text-sm text-inksoft">
                <li>
                  <Link href={`/s/${store.slug}/products`} className="hover:text-foreground hover:underline">
                    {t.chrome.allProducts}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/cart`} className="hover:text-foreground hover:underline">
                    {t.chrome.basket}
                  </Link>
                </li>
                <li>
                  <Link href={`/s/${store.slug}/orders`} className="hover:text-foreground hover:underline">
                    {t.chrome.orderStatus}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className={SECTION_TITLE}>{t.chrome.help}</p>
              {support.email || support.phone ? (
                <ul className="mt-3 space-y-2 text-sm text-inksoft">
                  {support.email ? (
                    <li>
                      <span className="text-muted-foreground">{t.chrome.supportEmailLabel}:</span>{" "}
                      <a href={supportMailto(support.email)} className="hover:text-foreground hover:underline">
                        {support.email}
                      </a>
                    </li>
                  ) : null}
                  {support.phone ? (
                    <li>
                      <span className="text-muted-foreground">{t.chrome.supportPhoneLabel}:</span>{" "}
                      <a href={supportTel(support.phone)} className="hover:text-foreground hover:underline">
                        {support.phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t.chrome.supportPending}</p>
              )}
            </div>
            <div>
              <p className={SECTION_TITLE}>{t.chrome.delivery}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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
          <Separator />
          <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
            {fmt(t.chrome.legal, {
              year: new Date().getFullYear(),
              client: store.clientName,
            })}
          </p>
        </footer>
      </div>
    </Document>
  );
}
