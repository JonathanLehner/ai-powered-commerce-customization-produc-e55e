import { ArrowRightIcon, LayersIcon, LibraryBigIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { alternatesFor, asLocale, shareFor } from "@/i18n/metadata";
import { Link as IntlLink } from "@/i18n/navigation";
import { IMAGES } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckList, Section, SectionHeading } from "./kit";

export const dynamic = "force-static";

const PILLARS = [
  { key: "stores", icon: LayersIcon },
  { key: "catalog", icon: LibraryBigIcon },
  { key: "approval", icon: ShieldCheckIcon },
] as const;

const FEATURES = [
  { key: "sourcing", image: IMAGES["marketing-sourcing"] },
  { key: "artwork", image: IMAGES["marketing-mockup"] },
  { key: "fulfilment", image: IMAGES["marketing-fulfilment"] },
] as const;

const GIFT_FLOW = ["publish", "recipients", "approve", "pay"] as const;

const LIFECYCLE = ["create", "payments", "products", "storefront", "sell"] as const;

/** "01", "02", … */
const stepNumber = (index: number) => String(index + 1).padStart(2, "0");

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  return { alternates: alternatesFor("/", locale), ...shareFor("/", locale, t("title"), t("description")) };
}

/** A numbered step, used by the gifting flow and the lifecycle. */
function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <Card asChild size="sm" className="h-full">
      <li>
        <CardContent>
          <span className="font-mono text-xs font-semibold text-muted-foreground">{step}</span>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </CardContent>
      </li>
    </Card>
  );
}

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div>
            <h1 className="font-heading max-w-[22ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("lead")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="px-4">
                <Link href="/login">{t("openWorkspace")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-4">
                <IntlLink href="/how-it-works">{t("howItWorks")}</IntlLink>
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t("factsProducts")}</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">{t("factsProductsValue")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t("factsLanguages")}</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">9</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">{t("factsCarriers")}</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">DHL · FedEx · UPS</dd>
              </div>
            </dl>
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Image
              src={IMAGES["marketing-hero"]}
              alt={t("heroAlt")}
              width={1024}
              height={1024}
              priority
              sizes="(min-width: 1024px) 512px, 100vw"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>
        </div>
      </section>

      <Section tone="muted">
        <SectionHeading>{t("pillarsTitle")}</SectionHeading>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <Card key={pillar.key} className="h-full">
              <CardHeader>
                <pillar.icon aria-hidden className="size-5 text-muted-foreground" />
                <CardTitle asChild className="mt-2">
                  <h3>{t(`pillars.${pillar.key}.title`)}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`pillars.${pillar.key}.body`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {FEATURES.map((feature, index) => (
        <Section key={feature.key} tone={index % 2 === 1 ? "muted" : "plain"}>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
              <SectionHeading>{t(`features.${feature.key}.title`)}</SectionHeading>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{t(`features.${feature.key}.body`)}</p>
              <CheckList items={t.raw(`features.${feature.key}.points`) as string[]} className="mt-6" />
            </div>
            <div className={index % 2 === 1 ? "lg:order-1" : undefined}>
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <Image
                  src={feature.image}
                  alt={t(`features.${feature.key}.alt`)}
                  width={1024}
                  height={1024}
                  loading="lazy"
                  sizes="(min-width: 1024px) 512px, 100vw"
                  className="h-auto w-full object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                />
              </div>
            </div>
          </div>
        </Section>
      ))}

      <Section id="gifting" tone="muted">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">{t("giftingEyebrow")}</p>
            <SectionHeading className="mt-3">
              {t("giftingTitle")}
            </SectionHeading>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("giftingBody")}
            </p>
            <CheckList items={t.raw("giftingPoints") as string[]} className="mt-6" />
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild variant="outline" size="lg" className="px-4">
                <IntlLink href="/how-it-works#gifting">{t("giftingHow")}</IntlLink>
              </Button>
              <IntlLink
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {t("giftingIncluded")}
                <ArrowRightIcon aria-hidden className="size-4" />
              </IntlLink>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Image
              src={IMAGES["marketing-gifting"]}
              alt={t("giftingAlt")}
              width={1024}
              height={1024}
              loading="lazy"
              sizes="(min-width: 1024px) 512px, 100vw"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GIFT_FLOW.map((key, index) => (
            <StepCard
              key={key}
              step={stepNumber(index)}
              title={t(`giftFlow.${key}.title`)}
              body={t(`giftFlow.${key}.body`)}
            />
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading>{t("lifecycleTitle")}</SectionHeading>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map((key, index) => (
            <StepCard
              key={key}
              step={stepNumber(index)}
              title={t(`lifecycle.${key}.title`)}
              body={t(`lifecycle.${key}.body`)}
            />
          ))}
        </ol>
      </Section>

      <Section>
        <div className="rounded-xl bg-primary/5 px-6 py-12 text-center ring-1 ring-primary/20 sm:px-12">
          <h2 className="font-heading mx-auto max-w-[24ch] text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
            {t("demoTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("demoBody")}
          </p>
          <Button asChild size="lg" className="mt-8 px-4">
            <Link href="/login">{t("demoCta")}</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
