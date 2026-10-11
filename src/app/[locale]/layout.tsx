import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Document, siteMetadata } from "@/components/Document";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { LOCALES } from "@/i18n/locales";
import { asLocale } from "@/i18n/metadata";

/** Every language is prerendered; any other first segment is not a page. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    ...siteMetadata,
    title: { default: t("title"), template: "%s · Parcelith" },
    description: t("description"),
    openGraph: { title: t("title"), description: t("description"), type: "website", siteName: "Parcelith", locale },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
  };
}

/** Root layout for the public marketing pages, in the language the address names. */
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { common, site, pricing, contact, signup } = await getMessages();

  return (
    <Document lang={locale}>
      {/* Only what the client components on these pages read. */}
      <NextIntlClientProvider messages={{ common, site, pricing, contact, signup }}>
        <div className="flex min-h-full flex-col">
          <SiteHeader locale={locale} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale} />
        </div>
      </NextIntlClientProvider>
    </Document>
  );
}
