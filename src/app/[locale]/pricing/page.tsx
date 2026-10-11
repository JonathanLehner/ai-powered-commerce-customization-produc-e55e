import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { PLAN_CURRENCIES, PLAN_KEYS, PLANS, YEARLY_DISCOUNT, planPrice, type Plan, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "../kit";
import { SecurityBlock, TrustStrip } from "../trust";
import { PlanCards, type PlanCard } from "./PlanCards";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/pricing", "pricing");
}

function prices(plan: Plan): PlanCard["prices"] {
  if (plan.monthlyPrice === null) return null;
  return Object.fromEntries(
    PLAN_CURRENCIES.map((currency) => [
      currency,
      { monthly: planPrice(plan, "monthly", currency)!, yearly: planPrice(plan, "yearly", currency)! },
    ]),
  ) as NonNullable<PlanCard["prices"]>;
}

type Feature = keyof Messages["pricing"]["features"];

/**
 * Prices and live-store counts come from `lib/plans`, the same table the
 * workspace enforces when a store is created.
 */
const PLAN_FEATURES: Record<PlanKey, Feature[]> = {
  starter: ["draftStores", "catalog", "configurator", "checkout", "gifting", "tracking", "emailSupport"],
  studio: ["everythingStarter", "team", "domains", "assistant", "dashboard", "auditExport"],
  scale: ["everythingStudio", "onboarding", "taxMarkets", "productionContact", "sso"],
};

const COMPARISON: { feature: Feature; cells: [boolean, boolean, boolean] }[] = [
  { feature: "catalog", cells: [true, true, true] },
  { feature: "configurator", cells: [true, true, true] },
  { feature: "checkout", cells: [true, true, true] },
  { feature: "gifting", cells: [true, true, true] },
  { feature: "tracking", cells: [true, true, true] },
  { feature: "team", cells: [false, true, true] },
  { feature: "domains", cells: [false, true, true] },
  { feature: "assistant", cells: [false, true, true] },
  { feature: "dashboard", cells: [false, true, true] },
  { feature: "auditExport", cells: [PLANS.starter.auditExport, PLANS.studio.auditExport, PLANS.scale.auditExport] },
  { feature: "onboarding", cells: [false, false, true] },
  { feature: "taxMarkets", cells: [false, false, true] },
  { feature: "productionContact", cells: [false, false, true] },
  { feature: "sso", cells: [false, false, true] },
];

function Cell({ value, included, missing }: { value: string | boolean; included: string; missing: string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-foreground">{value}</span>;
  }
  return value ? (
    <>
      <CheckIcon aria-hidden className="mx-auto size-4 text-primary" />
      <span className="sr-only">{included}</span>
    </>
  ) : (
    <>
      <MinusIcon aria-hidden className="mx-auto size-4 text-muted-foreground/60" />
      <span className="sr-only">{missing}</span>
    </>
  );
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  const format = await getFormatter();

  const storeLabel = (plan: Plan) =>
    plan.storeLimit === null ? t("unlimitedLiveStores") : t("liveStores", { count: plan.storeLimit });
  const storeCell = (plan: Plan) => (plan.storeLimit === null ? t("unlimited") : String(plan.storeLimit));

  const planCards: PlanCard[] = PLAN_KEYS.map((key) => ({
    name: PLANS[key].name,
    summary: t(`summaries.${key}`),
    features: [storeLabel(PLANS[key]), ...PLAN_FEATURES[key].map((feature) => t(`features.${feature}`))],
    cta: PLANS[key].monthlyPrice === null ? t("contactSales") : t("getStarted"),
    href: PLANS[key].monthlyPrice === null ? `/contact?plan=${key}` : `/signup?plan=${key}`,
    highlighted: key === "studio",
    prices: prices(PLANS[key]),
  }));

  const rows: { feature: string; cells: (string | boolean)[] }[] = [
    { feature: t("liveStoresRow"), cells: PLAN_KEYS.map((key) => storeCell(PLANS[key])) },
    { feature: t("draftStoresRow"), cells: PLAN_KEYS.map(() => t("unlimited")) },
    ...COMPARISON.map((row) => ({ feature: t(`features.${row.feature}`), cells: row.cells })),
  ];

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 pt-14 pb-8 text-center sm:px-6 sm:pt-20">
          <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-[62ch] text-base text-muted-foreground sm:text-lg">
            {t("lead")}
          </p>
        </div>
      </section>

      <Section className="pt-10 sm:pt-12">
        <PlanCards plans={planCards} yearlySaving={format.number(YEARLY_DISCOUNT, { style: "percent" })} />
      </Section>

      <Section tone="muted">
        <SectionHeading>{t("compareTitle")}</SectionHeading>
        <div className="relative mt-8 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{t("compareCaption")}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("featuresColumn")}
                </th>
                {planCards.map((plan) => (
                  <th
                    key={plan.name}
                    scope="col"
                    className={cn("px-4 py-3.5 text-center", plan.highlighted && "bg-primary/[0.04]")}
                  >
                    <span className="font-heading block text-sm font-semibold text-foreground">{plan.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 pr-6 font-normal text-muted-foreground">
                    {row.feature}
                  </th>
                  {row.cells.map((value, index) => (
                    <td
                      key={planCards[index].name}
                      className={cn("px-4 py-3 text-center", planCards[index].highlighted && "bg-primary/[0.04]")}
                    >
                      <Cell
                        value={value}
                        included={t("includedOn", { plan: planCards[index].name })}
                        missing={t("notOn", { plan: planCards[index].name })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section width="prose">
        <SectionHeading>{t("faqTitle")}</SectionHeading>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {(t.raw("faq") as { question: string; answer: string }[]).map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {item.question}
                <PlusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <SecurityBlock tone="muted" />

      <TrustStrip />
    </>
  );
}
