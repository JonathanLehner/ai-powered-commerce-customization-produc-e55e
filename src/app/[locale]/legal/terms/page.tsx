import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale, pageMetadata } from "@/i18n/metadata";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/legal/terms">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/legal/terms", "terms");
}

export default async function TermsPage({ params }: PageProps<"/[locale]/legal/terms">) {
  setRequestLocale(asLocale((await params).locale));
  const t = await getTranslations("terms");
  const sections = t.raw("sections") as { heading: string; body: string[] }[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance text-foreground">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {t("lead")}
      </p>
      <hr className="mt-10 border-t border-border" />
      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {section.heading}
            </h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mt-3 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
