import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckList, Section, SectionHeading } from "../kit";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/how-it-works">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/how-it-works", "howItWorks");
}

const ROLES = ["platform", "agency", "manager", "shopper", "buyer", "approver"] as const;

/** `id` is set where another page links straight at a stage. */
const STAGES: { key: "setup" | "sourcing" | "artwork" | "mockups" | "storefront" | "checkout" | "gifting"; id?: string }[] = [
  { key: "setup" },
  { key: "sourcing" },
  { key: "artwork" },
  { key: "mockups" },
  { key: "storefront" },
  { key: "checkout" },
  { key: "gifting", id: "gifting" },
];

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how-it-works">) {
  setRequestLocale(asLocale((await params).locale));
  const t = await getTranslations("howItWorks");

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading max-w-[24ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("lead")}
          </p>
        </div>
      </section>

      <Section width="prose">
        <ol className="space-y-10">
          {STAGES.map((stage) => (
            <li key={stage.key} id={stage.id} className={stage.id ? "scroll-mt-20" : undefined}>
              <h2 className="font-heading text-xl font-semibold tracking-tight text-balance text-foreground">
                {t(`stages.${stage.key}.title`)}
              </h2>
              <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t(`stages.${stage.key}.body`)}
              </p>
              <Card className="mt-5">
                <CardContent>
                  <CheckList items={t.raw(`stages.${stage.key}.detail`) as string[]} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="muted" width="prose">
        <SectionHeading>{t("rolesTitle")}</SectionHeading>
        <div className="mt-6 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[36rem] caption-bottom text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">{t("roleColumn")}</th>
                <th scope="col" className="px-4 py-3">{t("managesColumn")}</th>
                <th scope="col" className="px-4 py-3">{t("noAccessColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 align-top font-semibold text-foreground">{t(`roles.${role}.role`)}</th>
                  <td className="px-4 py-3 align-top text-muted-foreground">{t(`roles.${role}.owns`)}</td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{t(`roles.${role}.cannot`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section width="prose">
        <Card>
          <CardContent className="py-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{t("assistantTitle")}</h2>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              {t("assistantBody")}
            </p>
            <Button asChild size="lg" className="mt-6 px-4">
              <Link href="/login">{t("assistantCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      </Section>
    </>
  );
}
