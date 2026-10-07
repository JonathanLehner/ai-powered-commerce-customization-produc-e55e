import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Document, siteMetadata } from "@/components/Document";
import { GiftPortalFallbackProvider } from "@/components/GiftPortalFallback";
import { PlainDocument } from "@/components/SiteChrome";
import { Badge } from "@/components/ui/badge";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { giftPortalMetadata } from "@/lib/storefront-meta";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { storeThemeVars } from "@/lib/store-theme";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { classNames } from "@/lib/util";

/**
 * The portal is the client's, not Parcelith's: pages below it are suffixed with
 * the catalogue name and share as the catalogue, with the store logo. A link
 * that no longer resolves falls back to the platform's own metadata, matching
 * the chrome the 404 below renders.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  if (!catalogue || !store) return { ...siteMetadata, robots: { index: false, follow: false } };
  return giftPortalMetadata(catalogue, store);
}

/**
 * Root layout for a company's private gift portal. It is a root layout rather
 * than a nested one so the page can be marked with the store's own language:
 * the portal is the store's surface as much as the shop is, so its built-in
 * copy, money and dates follow the store's `defaultLanguage` exactly as the
 * storefront's do.
 *
 * It carries the store's branding
 * because the store is the merchant of record here too, but it is never linked
 * from the public storefront: everyone arrives holding a link or an invitation.
 */
export default async function GiftPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;

  // A portal link that no longer resolves still gets a page with a way out.
  // `children` keeps rendering: the pages below return the "not this address"
  // body themselves, so it is server-rendered into this chrome.
  if (!catalogue || !store) {
    return <PlainDocument note="Corporate gifting powered by Parcelith.">{children}</PlainDocument>;
  }

  const { tag, t } = storefrontLocale(store);
  // The same contacts the storefront publishes: a gifting buyer with a problem
  // has no other route to the seller either, and nothing here is invented from
  // the client's name.
  const support = storeSupport(store);

  return (
    <Document lang={tag}>
      <div
        className={classNames("store-surface flex min-h-full flex-col bg-background", STORE_FONT_CLASSES)}
        style={storeThemeVars(store.theme)}
      >
        <header className="border-b border-line bg-background">
          <div className="mx-auto flex h-16 w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6">
            <Link href={`/g/${catalogue.slug}`} className="flex min-w-0 items-center gap-2.5">
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
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold tracking-tight text-ink">
                  {catalogue.companyName}
                </span>
                <span className="block truncate text-xs text-muted">
                  {fmt(t.gift.chromeSubtitle, { store: store.name })}
                </span>
              </span>
            </Link>
            <Badge variant="outline" className="ml-auto gap-1.5">
              <LockIcon aria-hidden className="size-3" />
              {t.gift.private}
            </Badge>
          </div>
        </header>

        <main className="flex-1">
          <GiftPortalFallbackProvider value={{ slug: catalogue.slug, t: t.gift }}>
            {children}
          </GiftPortalFallbackProvider>
        </main>

        <footer className="mt-20 border-t border-line bg-secondary">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-muted sm:px-6">
            <p className="text-ink">{catalogue.name}</p>
            <p className="mt-1">{fmt(t.gift.operatedBy, { client: store.clientName })}</p>
            {support.email || support.phone ? (
              <p className="mt-3">
                {t.gift.supportTitle}{" "}
                {support.email ? (
                  <a href={supportMailto(support.email)} className="text-ink hover:underline">
                    {support.email}
                  </a>
                ) : null}
                {support.email && support.phone ? " · " : null}
                {support.phone ? (
                  <a href={supportTel(support.phone)} className="text-ink hover:underline">
                    {support.phone}
                  </a>
                ) : null}
              </p>
            ) : (
              <p className="mt-3">{fmt(t.gift.supportPending, { client: store.clientName })}</p>
            )}
            <p className="mt-3 text-xs">
              {fmt(t.gift.legal, { year: new Date().getFullYear(), client: store.clientName })}
            </p>
          </div>
        </footer>
      </div>
    </Document>
  );
}
