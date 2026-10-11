import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Document } from "@/components/Document";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { FallbackPanel } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/i18n/locales";

export const metadata: Metadata = {
  title: "Page not found · Parcelith",
  description: "This page does not exist.",
};

/**
 * The site-wide 404, for an address that matches no route at all.
 *
 * It is a root layout of its own — an unmatched address never reaches any of
 * the app's layouts — so it renders the document itself and borrows the public
 * site's header and footer. Being prerendered, the HTML arrives complete and
 * with a 404 status, and needs no JavaScript to read. The address names no
 * language, so it is in English.
 */
export default async function RootNotFound() {
  // The locale is passed explicitly rather than set for the request: this
  // component is rendered into every route's tree as the root 404 boundary.
  const locale = DEFAULT_LOCALE;
  const [t, site, notFound] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "site" }),
    getTranslations({ locale, namespace: "notFound" }),
  ]);

  return (
    <Document>
      <div className="flex min-h-full flex-col">
        <SiteHeader locale={DEFAULT_LOCALE} languageSwitcher={false} />
        <main className="flex-1">
          <FallbackPanel
            eyebrow="404"
            title={t("notFoundTitle")}
            description={<p>{notFound("body")}</p>}
            actions={
              <>
                <Link href="/" className={buttonVariants()}>
                  {t("backToHomepage")}
                </Link>
                <Link href="/how-it-works" className={buttonVariants({ variant: "outline" })}>
                  {site("howItWorks")}
                </Link>
                <Link href="/login" className={buttonVariants({ variant: "outline" })}>
                  {site("signIn")}
                </Link>
              </>
            }
          />
        </main>
        <SiteFooter locale={DEFAULT_LOCALE} languageSwitcher={false} />
      </div>
    </Document>
  );
}
