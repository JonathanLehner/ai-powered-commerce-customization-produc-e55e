import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms covering agency workspaces, client stores, supplier orders and merchant-of-record responsibilities on Parcelith.",
};

const SECTIONS = [
  {
    heading: "1. The service",
    body: [
      "Parcelith provides a multi-store commerce workspace. An agency creates and operates stores on behalf of its clients. Each store is an isolated commerce channel with its own catalog, customers, orders, currencies, tax configuration, storefront and payment account.",
      "Parcelith supplies the software, the shared supplier catalog and the routing between a paid order and a production partner. It does not manufacture goods, hold stock or take custody of shopper funds.",
    ],
  },
  {
    heading: "2. Merchant of record",
    body: [
      "The seller operating each store is the merchant of record for that store. Payments settle into the store's own connected Stripe account. The seller is responsible for pricing, tax collection and remittance, refunds, chargebacks, consumer rights obligations and any liability arising from goods sold.",
      "Tax brackets configured by the platform administrator are a convenience for calculating tax on a product. Selecting a bracket does not transfer any tax obligation to Parcelith or make Parcelith a party to the sale.",
    ],
  },
  {
    heading: "3. Supplier orders",
    body: [
      "Production partners are independent third parties. Where a partner exposes an order submission API, paid orders may be routed automatically. Where no such API exists — including sourcing marketplaces such as Alibaba.com — the order is flagged for manual handling and the seller raises the purchase order directly with the supplier under that supplier's own terms.",
      "Lead times, availability and fulfilment regions shown in the shared catalog are supplied by the partner and may change without notice. Parcelith does not warrant them.",
    ],
  },
  {
    heading: "4. Artwork and intellectual property",
    body: [
      "You retain ownership of artwork you upload. You warrant that you hold the rights to reproduce it on physical goods, and you indemnify Parcelith and its production partners against claims arising from artwork you supply.",
      "Pre-flight checks — print area bounds, effective resolution, file format, file size and transparency — are automated quality controls. Passing pre-flight is not an assessment of whether you are entitled to print the design.",
    ],
  },
  {
    heading: "5. AI-generated suggestions",
    body: [
      "The commerce assistant produces drafts: product ideas, supplier recommendations, descriptions, tags and prices. Every suggestion is stored in a pending state and applied only after a named user confirms it. You remain responsible for the accuracy of any copy or price you choose to publish.",
    ],
  },
  {
    heading: "6. Data isolation and access",
    body: [
      "Store data is scoped to the store. Agency staff reach a store either through agency ownership or through an explicit invitation with a role attached. Shopper records are never combined across stores, including in agency-level reporting.",
      "Administrative actions, store setup changes, product imports, price changes, AI approvals, publishing actions and order routing are written to an audit history retained for the life of the workspace.",
    ],
  },
  {
    heading: "7. Suspension and termination",
    body: [
      "Either party may end the agreement with 30 days' notice. Archiving a store keeps its records readable for reporting and audit but removes it from day-to-day operation and takes its storefront offline.",
      "Parcelith may suspend a workspace that is used to infringe third-party rights or to sell goods prohibited by a production partner.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of service</h1>
      <p className="mt-3 text-sm text-muted">
        These terms govern agency workspaces and the client stores operated inside them.
      </p>
      <div className="mt-10 space-y-9">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold text-ink">{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mt-3 text-sm leading-relaxed text-inksoft">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
