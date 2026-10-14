import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { TemplateShell } from "@/components/storefront/TemplateStorefront";
import { localizedPath } from "@/i18n/locales";
import { demoFor } from "@/lib/templates/demo-route";


export async function generateMetadata({ params }: LayoutProps<"/demo/[template]/[lang]">): Promise<Metadata> {
  const demo = demoFor(await params);
  if (!demo) return siteMetadata;
  const { template, locale } = demo;
  const t = await getTranslations({ locale, namespace: "templates" });
  return {
    ...siteMetadata,
    title: t("demoTitle", { name: template.name }),
    robots: { index: false, follow: true },
  };
}

/**
 * A template's demo store, as a document of its own: the template's design is
 * applied to `<html>` the way a live storefront applies a store's.
 */
export default async function DemoLayout({ children, params }: LayoutProps<"/demo/[template]/[lang]">) {
  const demo = demoFor(await params);
  if (!demo) {
    const t = await getTranslations({ locale: "en", namespace: "templates" });
    return (
      <PlainDocument note="© Parcelith">
        <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("demoMissing")}</h1>
          <Link href="/templates" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
            {t("allTemplates")}
          </Link>
        </div>
      </PlainDocument>
    );
  }
  const { template, locale, base, collections, brand } = demo;
  const t = await getTranslations({ locale, namespace: "templates" });
  return (
    <TemplateShell
      template={template}
      locale={locale}
      base={base}
      brand={brand}
      collections={collections}
      notice={
        <div data-demo-notice className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-neutral-950 px-4 py-2 text-center text-xs text-white">
          <span>{t("demoNotice", { name: template.name })}</span>
          <a href={localizedPath(`/templates/${template.id}`, locale)} className="font-semibold underline underline-offset-2">
            {t("useTemplate")}
          </a>
          <Link href={localizedPath("/templates", locale)} className="underline underline-offset-2">
            {t("allTemplates")}
          </Link>
        </div>
      }
    >
      {children}
    </TemplateShell>
  );
}
