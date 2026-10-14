import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import Link from "next/link";
import { Document, siteMetadata } from "@/components/Document";
import { GiftPortalFallbackProvider } from "@/components/GiftPortalFallback";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PlainDocument } from "@/components/SiteChrome";
import { StoreMark } from "@/components/StoreMark";
import { shopperIntl, shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { POLICY_KEYS, policyPath } from "@/lib/policies";
import { giftPortalMetadata } from "@/lib/storefront-meta";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { storeThemeAttributes, storeThemeStyle } from "@/lib/store-theme";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
 * than a nested one so the page can be marked with the shopper's language:
 * the portal is the store's surface as much as the shop is, so it is offered in
 * the store's languages and its built-in copy, money and dates follow the
 * `[locale]` segment exactly as the storefront's do.
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
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale: requested } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;

  // A portal link that no longer resolves still gets a page with a way out.
  // `children` keeps rendering: the pages below return the "not this address"
  // body themselves, so it is server-rendered into this chrome.
  if (!catalogue || !store) {
    return <PlainDocument note="Corporate gifting powered by Parcelith.">{children}</PlainDocument>;
  }

  const root = `/g/${catalogue.slug}`;
  const { locale, t, base } = await shopperIntl(store, requested, root);
  const { locales, defaultLocale } = storeLanguages(store);
  const messages = await shopperMessages(store, locale);
  // The same contacts the storefront publishes: a gifting buyer with a problem
  // has no other route to the seller either, and nothing here is invented from
  // the client's name.
  const support = storeSupport(store);

  return (
    <Document lang={locale} style={storeThemeStyle(store)} attributes={storeThemeAttributes(store)} className={STORE_FONT_CLASSES}>
      <NextIntlClientProvider
        locale={locale}
        messages={{ common: messages.common, storefront: messages.storefront }}
      >
        <div className="flex min-h-full flex-col bg-background">
          <header className="border-b border-border bg-background">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
              <Link href={base} className="flex min-w-0 items-center gap-2.5">
                <StoreMark name={store.name} logoUrl={store.logoUrl} />
                <span className="min-w-0">
                  <span className="font-heading block truncate text-base font-semibold tracking-tight text-foreground">
                    {catalogue.companyName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t("gift.chromeSubtitle", { store: store.name })}
                  </span>
                </span>
              </Link>
              <div className="ml-auto flex items-center gap-2">
                {locales.length > 1 ? (
                  <LanguageSelect root={root} locales={locales} defaultLocale={defaultLocale} />
                ) : null}
                <Badge variant="outline" className="rounded-full">
                  {t("gift.private")}
                </Badge>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <GiftPortalFallbackProvider value={{ base }}>
              {children}
            </GiftPortalFallbackProvider>
          </main>

          <footer className="mt-16 border-t border-border bg-muted/60">
            <div className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-muted-foreground sm:px-6">
              <p className="font-heading font-semibold text-foreground">{catalogue.name}</p>
              {support.email || support.phone ? (
                <p className="mt-2">
                  {t("gift.supportTitle")}:{" "}
                  {support.email ? (
                    <a href={supportMailto(support.email)} className="text-foreground hover:underline">
                      {support.email}
                    </a>
                  ) : null}
                  {support.email && support.phone ? " · " : null}
                  {support.phone ? (
                    <a href={supportTel(support.phone)} className="text-foreground hover:underline">
                      {support.phone}
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
            <Separator />
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
              <p>{t("gift.legal", { year: String(new Date().getFullYear()), client: store.clientName })}</p>
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
      </NextIntlClientProvider>
    </Document>
  );
}
