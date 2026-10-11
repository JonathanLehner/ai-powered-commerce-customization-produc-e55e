import { CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import { PLANS, YEARLY_DISCOUNT, planPrice, planStoreLabel, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "../kit";
import { PlanCards, type PlanCard } from "./PlanCards";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Parcelith plans for agencies of every size, billed monthly or yearly.",
};

function prices(plan: Plan): PlanCard["prices"] {
  const monthly = planPrice(plan, "monthly");
  const yearly = planPrice(plan, "yearly");
  return monthly && yearly ? { monthly, yearly } : null;
}

/**
 * Prices and live-store counts come from `lib/plans`, the same table the
 * workspace enforces when a store is created.
 */
const PLAN_CARDS: PlanCard[] = [
  {
    name: PLANS.starter.name,
    summary: "For small agencies getting started.",
    features: [
      planStoreLabel(PLANS.starter),
      "Unlimited draft stores",
      "Shared supplier catalog",
      "Artwork configurator and mockups",
      "Multi-currency checkout",
      "Corporate gifting",
      "DHL, FedEx and UPS tracking",
      "Email support",
    ],
    cta: "Get started",
    href: "/contact?plan=starter",
    highlighted: false,
    prices: prices(PLANS.starter),
  },
  {
    name: PLANS.studio.name,
    summary: "For agencies running several client stores.",
    features: [
      planStoreLabel(PLANS.studio),
      "Everything in Starter",
      "Team roles and invitations",
      "Custom domains",
      "AI commerce assistant",
      "Agency dashboard",
      "Audit log export",
    ],
    cta: "Get started",
    href: "/contact?plan=studio",
    highlighted: true,
    prices: prices(PLANS.studio),
  },
  {
    name: PLANS.scale.name,
    summary: "For large networks selling in many markets.",
    features: [
      planStoreLabel(PLANS.scale),
      "Everything in Studio",
      "Priority supplier onboarding",
      "Tax brackets per market",
      "Dedicated production contact",
      "Single sign-on",
    ],
    cta: "Contact sales",
    href: "/contact?plan=scale",
    highlighted: false,
    prices: prices(PLANS.scale),
  },
];

function storeCell(plan: Plan): string {
  return plan.storeLimit === null ? "Unlimited" : String(plan.storeLimit);
}

const COMPARISON: { feature: string; cells: [string | boolean, string | boolean, string | boolean] }[] = [
  { feature: "Live stores", cells: [storeCell(PLANS.starter), storeCell(PLANS.studio), storeCell(PLANS.scale)] },
  { feature: "Draft stores", cells: ["Unlimited", "Unlimited", "Unlimited"] },
  { feature: "Shared supplier catalog", cells: [true, true, true] },
  { feature: "Artwork configurator and mockups", cells: [true, true, true] },
  { feature: "Multi-currency checkout", cells: [true, true, true] },
  { feature: "Corporate gifting", cells: [true, true, true] },
  { feature: "DHL, FedEx and UPS tracking", cells: [true, true, true] },
  { feature: "Team roles and invitations", cells: [false, true, true] },
  { feature: "Custom domains", cells: [false, true, true] },
  { feature: "AI commerce assistant", cells: [false, true, true] },
  { feature: "Agency dashboard", cells: [false, true, true] },
  { feature: "Audit log export", cells: [PLANS.starter.auditExport, PLANS.studio.auditExport, PLANS.scale.auditExport] },
  { feature: "Priority supplier onboarding", cells: [false, false, true] },
  { feature: "Tax brackets per market", cells: [false, false, true] },
  { feature: "Dedicated production contact", cells: [false, false, true] },
  { feature: "Single sign-on", cells: [false, false, true] },
];

function Cell({ value, plan }: { value: string | boolean; plan: string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-foreground">{value}</span>;
  }
  return value ? (
    <>
      <CheckIcon aria-hidden className="mx-auto size-4 text-primary" />
      <span className="sr-only">Included on {plan}</span>
    </>
  ) : (
    <>
      <MinusIcon aria-hidden className="mx-auto size-4 text-muted-foreground/60" />
      <span className="sr-only">Not on {plan}</span>
    </>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 pt-14 pb-8 text-center sm:px-6 sm:pt-20">
          <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-[62ch] text-base text-muted-foreground sm:text-lg">
            Simple plans for agencies of every size.
          </p>
        </div>
      </section>

      <Section className="pt-10 sm:pt-12">
        <PlanCards plans={PLAN_CARDS} yearlySaving={`${Math.round(YEARLY_DISCOUNT * 100)}%`} />
      </Section>

      <Section tone="muted">
        <SectionHeading>Compare plans</SectionHeading>
        <div className="mt-8 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Parcelith plans compared</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Features
                </th>
                {PLAN_CARDS.map((plan) => (
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
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 pr-6 font-normal text-muted-foreground">
                    {row.feature}
                  </th>
                  {row.cells.map((value, index) => (
                    <td
                      key={PLAN_CARDS[index].name}
                      className={cn("px-4 py-3 text-center", PLAN_CARDS[index].highlighted && "bg-primary/[0.04]")}
                    >
                      <Cell value={value} plan={PLAN_CARDS[index].name} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
