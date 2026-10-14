import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignedInLink } from "@/components/SignedInLink";
import { buttonVariants } from "@/components/ui/button";
import { getPathname } from "@/i18n/navigation";
import { asLocale } from "@/i18n/metadata";
import { DEFAULT_LOCALE, LOCALES, localizedPath, type Locale } from "@/i18n/locales";
import { srcSetFor } from "@/lib/image-variants";
import { SECTION_DEFS } from "@/lib/storefront-schema";
import { getTemplate, templateCopy, templateSummary, TEMPLATES } from "@/lib/templates/index";
import { demoProducts } from "@/lib/templates/demo";
import { Section, SectionHeading } from "../../kit";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => TEMPLATES.map((t) => ({ locale, template: t.id })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/templates/[template]">): Promise<Metadata> {
  const { locale: raw, template: id } = await params;
  const locale = asLocale(raw);
  const template = getTemplate(id);
  if (!template) return {};
  const t = await getTranslations({ locale, namespace: "templates" });
  const description = templateCopy(template, locale).description;
  const path = `/templates/${template.id}`;
  return {
    title: t("templateMetaTitle", { name: template.name }),
    description,
    alternates: {
      canonical: localizedPath(path, locale),
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localizedPath(path, l)])), "x-default": localizedPath(path, DEFAULT_LOCALE) },
    },
    openGraph: {
      type: "website",
      siteName: "Parcelith",
      title: t("templateMetaTitle", { name: template.name }),
      description,
      images: [template.assets.previews?.desktop || template.assets.hero].filter(Boolean),
    },
  };
}

function Shot({ src, alt, className, eager }: { src: string; alt: string; className: string; eager?: boolean }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} srcSet={srcSetFor(src)} sizes="(min-width: 1024px) 760px, 92vw" alt={alt} loading={eager ? "eager" : "lazy"} className={className} />
  );
}

export default async function TemplatePage({ params }: PageProps<"/[locale]/templates/[template]">) {
  const { locale: raw, template: id } = await params;
  const locale: Locale = asLocale(raw);
  setRequestLocale(locale);
  const template = getTemplate(id);
  if (!template) return null;
  const t = await getTranslations("templates");
  const summary = templateSummary(template, locale);
  const copy = templateCopy(template, locale);
  const products = demoProducts(template, locale);
  const demo = `/demo/${template.id}/${locale}`;
  const previews = template.assets.previews;
  const sections = [...new Set(template.sections.map((s) => s.type))];
  const related = TEMPLATES.filter((other) => other.category === template.category && other.id !== template.id);

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-center">
          <div>
            <a href={localizedPath("/templates", locale)} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {t(`categories.${template.category}`)}
            </a>
            <h1 className="font-heading mt-2 text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">{template.name}</h1>
            <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg">{copy.description}</p>
            <p className="mt-3 text-sm text-muted-foreground">{template.styles.map((s) => t(`styles.${s}`)).join(" · ")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={demo} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}>
                {t("livePreview")}
              </a>
              <SignedInLink
                href={`${getPathname({ href: "/signup", locale })}?template=${template.id}`}
                signedInHref={`/app/stores/new?template=${template.id}`}
                label={t("startWithIt")}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              />
            </div>
          </div>
          <div className="relative">
            <Shot
              src={previews?.desktop || template.assets.hero}
              alt={t("desktopPreview", { name: template.name })}
              eager
              className="aspect-[16/10] w-full rounded-xl border border-border object-cover object-top shadow-sm"
            />
            {previews?.mobile ? (
              <Shot
                src={previews.mobile}
                alt={t("mobilePreview", { name: template.name })}
                className="absolute -bottom-6 right-4 hidden aspect-[390/844] w-[22%] rounded-xl border border-border object-cover object-top shadow-lg sm:block"
              />
            ) : null}
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("design")}</h2>
            <div className="mt-3 flex gap-2" aria-hidden>
              {[...new Set([summary.colors.background, summary.colors.primary, summary.colors.text])].map((c) => (
                <span key={c} className="size-10 rounded-lg border border-border" style={{ background: c }} />
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("fonts", { heading: summary.fonts.heading, body: summary.fonts.body })}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("included")}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>{t("includedHome", { count: template.sections.length })}</li>
              <li>{t("includedProductPage")}</li>
              <li>{t("includedCollection")}</li>
              <li>{t("includedHeaderFooter")}</li>
              <li>{t("includedImages")}</li>
              <li>{t("includedLanguages")}</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("sections")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{sections.map((type) => SECTION_DEFS[type].name).join(", ")}</p>
          </div>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading lead={t("starterLead")}>{t("starterTitle")}</SectionHeading>
        <ul className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => (
            <li key={p.card.id}>
              <Shot src={p.card.imageUrl ?? ""} alt={p.card.name} className="aspect-square w-full rounded-lg border border-border object-cover" />
              <p className="mt-2 text-sm font-medium text-foreground">{p.card.name}</p>
              <p className="text-xs text-muted-foreground">{p.colour.name}</p>
            </li>
          ))}
        </ul>
      </Section>

      {related.length > 0 ? (
        <Section>
          <SectionHeading>{t("moreIn", { category: t(`categories.${template.category}`) })}</SectionHeading>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((other) => (
              <li key={other.id}>
                <a href={localizedPath(`/templates/${other.id}`, locale)} className="group block">
                  <Shot
                    src={other.assets.previews?.thumbnail || other.assets.hero}
                    alt=""
                    className="aspect-[4/3] w-full rounded-lg border border-border object-cover object-top"
                  />
                  <p className="mt-2 text-sm font-semibold text-foreground group-hover:underline">{other.name}</p>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
