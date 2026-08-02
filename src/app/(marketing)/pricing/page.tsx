import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Parcelith plans for agencies: per-store pricing with no revenue share. Sellers keep their own Stripe account and remain the merchant of record.",
};

const PLANS = [
  {
    name: "Starter",
    price: "$89",
    cadence: "per month",
    summary: "One agency workspace and up to three live client stores.",
    features: [
      "3 live stores, unlimited drafts",
      "Shared supplier catalog access",
      "Artwork configurator and mockup generation",
      "Stripe checkout in every supported currency",
      "DHL, FedEx and UPS tracking",
      "Email support",
    ],
    cta: "Start with Starter",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "$249",
    cadence: "per month",
    summary: "The working plan for agencies running client programmes side by side.",
    features: [
      "15 live stores",
      "Store-scoped roles and invitations",
      "Custom domains per store",
      "Commerce assistant with confirmation flow",
      "Cross-store agency dashboard",
      "Full audit history export",
    ],
    cta: "Choose Studio",
    highlighted: true,
  },
  {
    name: "Scale",
    price: "Talk to us",
    cadence: "annual agreement",
    summary: "For networks running gifting programmes across many markets.",
    features: [
      "Unlimited stores",
      "Priority supplier onboarding and review",
      "Custom tax bracket sets per market",
      "Named production contact at each partner",
      "Single sign-on and provisioning",
      "Quarterly commercial review",
    ],
    cta: "Arrange a call",
    highlighted: false,
  },
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

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <Badge tone="brand">Pricing</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Priced per workspace, not per sale
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-inksoft">
            Every plan includes the shared supplier catalog, the artwork configurator, mockup generation and
            order routing. What changes is how many client stores you can run at once.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.highlighted
                  ? "card relative p-6 ring-2 ring-brand-500"
                  : "card p-6"
              }
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6">
                  <Badge tone="brand">Most agencies pick this</Badge>
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted">{plan.summary}</p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-ink">{plan.price}</span>
                <span className="text-sm text-muted">{plan.cadence}</span>
              </p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm text-inksoft">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={plan.highlighted ? "btn-primary mt-7 w-full" : "btn-secondary mt-7 w-full"}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-3">
          {INCLUDED.map((item) => (
            <div key={item.title} className="card-pad">
              <h2 className="text-base font-semibold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-inksoft">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
