import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TemplateGallery } from "@/components/TemplateGallery";
import { alternatesFor, asLocale } from "@/i18n/metadata";
import { TEMPLATE_CATEGORIES, TEMPLATE_STYLES, TEMPLATES } from "@/lib/templates/index";
import { galleryTemplates } from "@/lib/templates/gallery";
import { Section } from "../kit";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/templates">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "templates" });
  const image = TEMPLATES[0]?.assets.previews?.desktop || TEMPLATES[0]?.assets.hero;
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: alternatesFor("/templates", locale),
    openGraph: { type: "website", siteName: "Parcelith", title: `${t("metaTitle")} · Parcelith`, description: t("metaDescription"), images: image ? [image] : [] },
  };
}

export default async function TemplatesPage({ params }: PageProps<"/[locale]/templates">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("templates");
  const categories = TEMPLATE_CATEGORIES.filter((c) => TEMPLATES.some((tpl) => tpl.category === c));

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading max-w-[24ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg">{t("lead", { count: TEMPLATES.length })}</p>
        </div>
      </section>
      <Section>
        <TemplateGallery
          templates={galleryTemplates(locale)}
          categories={categories.map((key) => ({ key, label: t(`categories.${key}`) }))}
          styles={TEMPLATE_STYLES.map((key) => ({ key, label: t(`styles.${key}`) }))}
          labels={{
            all: t("all"),
            allStyles: t("allStyles"),
            category: t("category"),
            style: t("style"),
            preview: t("livePreview"),
            details: t("details"),
            none: t("none"),
          }}
        />
      </Section>
    </>
  );
}
