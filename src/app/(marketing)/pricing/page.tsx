import { ArrowRightIcon, CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { PLANS, planAuditLabel, planStoreLabel, type Plan } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckList, Section, SectionHeading } from "../kit";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Parcelith plans for agencies: per-store pricing with no revenue share, corporate gifting on every plan. Sellers keep their own Stripe account and remain the merchant of record.",
};

/**
 * Corporate gifting is not tiered: every store on every plan can run gift
 * catalogues and campaigns, so the same line appears on all three cards rather
 * than an escalating version that would imply a gate the platform does not
 * apply. What scales with the plan is how many client stores can run one.
 */
const GIFTING_FEATURE = "Corporate gifting portals, campaigns and approvals";

/**
 * What each plan costs and what comes with it. The live-store counts and the
 * audit entitlement are read from `lib/plans`, which is also what the workspace
 * enforces when a store is created and when the audit history is downloaded, so
 * this page cannot advertise something the platform does not apply.
 *
 * `href` is where the button goes: there is one sales route for every plan, with
 * the plan carried in the query so the form opens on the right one.
 */
const PLAN_CARDS = [
  {
    name: PLANS.starter.name,
    price: "$89",
    cadence: "per month",
    summary: "One agency workspace and up to three live client stores.",
    features: [
      `${planStoreLabel(PLANS.starter)}, unlimited drafts`,
      "Shared supplier catalog access",
      "Artwork configurator and mockup generation",
      "Stripe checkout in every supported currency",
      GIFTING_FEATURE,
      "DHL, FedEx and UPS tracking",
      "Email support",
    ],
    cta: "Start with Starter",
    href: "/contact?plan=starter",
    highlighted: false,
  },
  {
    name: PLANS.studio.name,
    price: "$249",
    cadence: "per month",
    summary: "The working plan for agencies running client programmes side by side.",
    features: [
      planStoreLabel(PLANS.studio),
      "Store-scoped roles and invitations",
      "Custom domains per store",
      "Commerce assistant with confirmation flow",
      GIFTING_FEATURE,
      "Cross-store agency dashboard",
      planAuditLabel(PLANS.studio),
    ],
    cta: "Choose Studio",
    href: "/contact?plan=studio",
    highlighted: true,
  },
  {
    name: PLANS.scale.name,
    price: "Talk to us",
    cadence: "annual agreement",
    summary: "For networks running gifting programmes across many markets.",
    features: [
      planStoreLabel(PLANS.scale),
      "Priority supplier onboarding and review",
      "Custom tax bracket sets per market",
      GIFTING_FEATURE,
      "Named production contact at each partner",
      "Single sign-on and provisioning",
      "Quarterly commercial review",
    ],
    cta: "Arrange a call",
    href: "/contact?plan=scale",
    highlighted: false,
  },
];

/** How many live stores a plan's column shows, in the ceiling the workspace enforces. */
function storeCell(plan: Plan): string {
  return plan.storeLimit === null ? "Unlimited" : String(plan.storeLimit);
}

/** Reading the audit history is on every plan; downloading it is not. */
function auditCell(plan: Plan): string {
  return plan.auditExport ? "On screen and export" : "On screen";
}

/**
 * The same lines the three cards carry, laid out as one row per capability so a
 * plan can be read across rather than card by card. A cell is either a tick, a
 * dash, or the value that differs between the plans.
 */
const COMPARISON: { feature: string; cells: [string | boolean, string | boolean, string | boolean] }[] = [
  { feature: "Live client stores", cells: [storeCell(PLANS.starter), storeCell(PLANS.studio), storeCell(PLANS.scale)] },
  { feature: "Draft stores", cells: ["Unlimited", "Unlimited", "Unlimited"] },
  { feature: "Shared supplier catalog access", cells: [true, true, true] },
  { feature: "Artwork configurator and mockup generation", cells: [true, true, true] },
  { feature: "Stripe checkout in every supported currency", cells: [true, true, true] },
  { feature: GIFTING_FEATURE, cells: [true, true, true] },
  { feature: "DHL, FedEx and UPS tracking", cells: [true, true, true] },
  { feature: "Store-scoped roles and invitations", cells: [false, true, true] },
  { feature: "Custom domains per store", cells: [false, true, true] },
  { feature: "Commerce assistant with confirmation flow", cells: [false, true, true] },
  { feature: "Cross-store agency dashboard", cells: [false, true, true] },
  { feature: "Audit history", cells: [auditCell(PLANS.starter), auditCell(PLANS.studio), auditCell(PLANS.scale)] },
  { feature: "Priority supplier onboarding and review", cells: [false, false, true] },
  { feature: "Custom tax bracket sets per market", cells: [false, false, true] },
  { feature: "Named production contact at each partner", cells: [false, false, true] },
  { feature: "Single sign-on and provisioning", cells: [false, false, true] },
  { feature: "Quarterly commercial review", cells: [false, false, true] },
];

const INCLUDED = [
  {
    title: "No revenue share",
    body: "Parcelith charges for the workspace, not a slice of your client's sales. Payments settle directly into each store's own Stripe account.",
  },
  {
    title: "Supplier costs are passed through",
    body: "You see the supplier's base cost, the customisation cost per print area and the estimated shipping on every product before you publish it.",
  },
  {
    title: "Sellers stay merchant of record",
    body: "Each store owns its payments, tax obligations, refunds and supplier liabilities. Parcelith never takes custody of funds.",
  },
];

/** A comparison cell: the value where plans differ, otherwise a tick or a dash. */
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
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <Badge tone="brand">Pricing</Badge>
          <h1 className="font-heading mx-auto mt-4 max-w-[22ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            Priced per workspace, not per sale
          </h1>
          <p className="mx-auto mt-5 max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Every plan includes the shared supplier catalog, the artwork configurator, mockup generation, the
            corporate gifting portal and order routing. What changes is how many client stores you can run at
            once.
          </p>
        </div>
      </section>

      <Section>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {PLAN_CARDS.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "h-full",
                // The badge sits on the card's top edge, so this one card is
                // not clipped, and at one column it keeps clear of the card above.
                plan.highlighted && "relative mt-3 overflow-visible bg-primary/[0.03] ring-2 ring-primary lg:mt-0",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6">
                  <Badge tone="brand" className="bg-primary text-primary-foreground border-transparent">
                    Most agencies pick this
                  </Badge>
                </span>
              ) : null}
              <CardHeader>
                <h2 className="font-heading text-lg font-semibold text-foreground">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">{plan.summary}</p>
              </CardHeader>
              <CardContent>
                <p className="flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                </p>
                <CheckList items={plan.features} className="mt-6" />
              </CardContent>
              <CardFooter className="bg-transparent border-0 pt-0">
                <Button
                  asChild
                  size="lg"
                  variant={plan.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading lead="The three plans side by side. Everything in the row is what the workspace itself enforces.">
          Compare the plans
        </SectionHeading>
        <p className="mt-4 text-xs text-muted-foreground lg:hidden">
          Scroll the table sideways to reach Studio and Scale.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 lg:mt-8">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Parcelith plans compared feature by feature</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Included
                </th>
                {PLAN_CARDS.map((plan) => (
                  <th
                    key={plan.name}
                    scope="col"
                    className={cn(
                      "px-4 py-3.5 text-center",
                      plan.highlighted && "bg-primary/[0.04]",
                    )}
                  >
                    <span className="font-heading block text-sm font-semibold text-foreground">
                      {plan.name}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {plan.price} · {plan.cadence}
                    </span>
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
                      className={cn(
                        "px-4 py-3 text-center",
                        PLAN_CARDS[index].highlighted && "bg-primary/[0.04]",
                      )}
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

      <Section>
        <Card className="bg-primary/5 ring-primary/20">
          <CardContent className="py-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              Corporate gifting is on Starter, Studio and Scale
            </h2>
            <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
              Any store, on any plan, can open a private gift catalogue for a company it supplies: gated by
              private link or invited email addresses, drawn from that store&rsquo;s published products, with a
              spend limit per recipient. Buyers upload a recipient list of up to 100 people, an approver signs it
              off on a link of their own, and the payment raises one order per recipient under the campaign. What
              the plan decides is how many client stores can be running one at a time.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button asChild variant="outline">
                <Link href="/how-it-works#gifting">How gifting works</Link>
              </Button>
              <Link
                href="/contact?plan=scale"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Talk to us about a gifting programme
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section tone="muted">
        <div className="grid gap-4 md:grid-cols-3">
          {INCLUDED.map((item) => (
            <Card key={item.title} className="h-full">
              <CardContent>
                <h2 className="font-heading text-base font-medium text-foreground">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
