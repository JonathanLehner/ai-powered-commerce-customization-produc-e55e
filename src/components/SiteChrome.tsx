import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Document } from "@/components/Document";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignedInLink } from "@/components/SignedInLink";
import { SiteMenu } from "@/components/SiteMenu";
import { Logo } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * The public Parcelith header and footer.
 *
 * They live here rather than inside the marketing layout because the site-wide
 * not-found page is a root layout of its own — an unmatched address never
 * reaches the marketing layout — and it has to look like the same site.
 */

/** The small uppercase heading above a footer column. */
const SECTION_TITLE = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/**
 * Links to the public pages stay in the visitor's language. The addresses are
 * worked out from the `locale` prop rather than from the request, because the
 * site-wide 404 renders this header too and must not read the request. Sign-in
 * has no localized address.
 */
export async function SiteHeader({
  locale,
  languageSwitcher = true,
}: {
  locale: Locale;
  /** Off on the site-wide 404, whose address has no translation to switch to. */
  languageSwitcher?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "site" });
  const nav = [
    { href: getPathname({ href: "/how-it-works", locale }), label: t("howItWorks") },
    { href: getPathname({ href: "/templates", locale }), label: t("templates") },
    { href: getPathname({ href: "/pricing", locale }), label: t("pricing") },
    { href: getPathname({ href: "/contact", locale }), label: t("contact") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href={getPathname({ href: "/", locale })}
          className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
        >
          <Logo />
        </Link>
        <div className="flex min-w-0 items-center gap-1 md:gap-2">
          {/* Below md the page links move into the menu; sign-in stays in view. */}
          <nav aria-label={t("mainNav")} className="hidden items-center gap-2 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-inksoft hover:bg-canvas hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <SignedInLink
            href="/login"
            label={t("signIn")}
            signedInHref="/app"
            signedInLabel={t("dashboard")}
            className={cn(buttonVariants({ size: "sm" }), "whitespace-nowrap md:ml-2 md:px-4 md:py-2 md:text-sm")}
          />
          <SiteMenu
            labels={{ menu: t("menu"), close: t("closeMenu"), language: t("language") }}
            links={nav}
            languages={languageSwitcher}
          />
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter({
  locale,
  languageSwitcher = true,
}: {
  locale: Locale;
  /** Off on the site-wide 404, whose address has no translation to switch to. */
  languageSwitcher?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "site" });
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <div>
          <h2 className={SECTION_TITLE}>{t("platform")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-inksoft">
            <li><Link href={getPathname({ href: "/how-it-works", locale })} className="hover:text-ink hover:underline">{t("howItWorks")}</Link></li>
            <li><Link href={getPathname({ href: "/templates", locale })} className="hover:text-ink hover:underline">{t("templates")}</Link></li>
            <li><Link href={getPathname({ href: "/pricing", locale })} className="hover:text-ink hover:underline">{t("pricing")}</Link></li>
            <li><Link href={getPathname({ href: "/developers", locale })} className="hover:text-ink hover:underline">{t("developers")}</Link></li>
            <li><Link href={getPathname({ href: "/contact", locale })} className="hover:text-ink hover:underline">{t("contactSales")}</Link></li>
            <li><Link href="/login" className="hover:text-ink hover:underline">{t("signIn")}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className={SECTION_TITLE}>{t("legal")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-inksoft">
            <li><Link href={getPathname({ href: "/legal/terms", locale })} className="hover:text-ink hover:underline">{t("terms")}</Link></li>
            <li><Link href={getPathname({ href: "/legal/privacy", locale })} className="hover:text-ink hover:underline">{t("privacy")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          {languageSwitcher ? <LanguageSwitcher label={t("language")} /> : null}
        </div>
      </div>
    </footer>
  );
}

/**
 * A whole document with Parcelith's mark and nothing else, used by the
 * storefront and gift portal layouts when the address in the URL resolves to no
 * shop or catalogue. Those layouts are root layouts, so the fallback has to be a
 * document too — and it must keep rendering `children`, because the page below
 * is what raises the 404.
 */
export function PlainDocument({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <Document>
      <div className="flex min-h-full flex-col bg-white">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 sm:px-6">
            <Link href="/" aria-label="Parcelith">
              <Logo />
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-canvas">
          <p className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">{note}</p>
        </footer>
      </div>
    </Document>
  );
}
