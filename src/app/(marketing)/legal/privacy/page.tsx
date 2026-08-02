import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What Parcelith stores about agency staff, store teams and shoppers, why it is stored, and how store data is kept isolated.",
};

const SECTIONS = [
  {
    heading: "Who controls what",
    body: [
      "For agency and store team accounts, Parcelith is the controller of the account record: name, work email, role and the actions attributed to that person in the audit history.",
      "For shopper data — order contact details, delivery address, artwork uploaded at checkout and personalisation text — the store operating the sale is the controller. Parcelith processes that data on the store's instruction so the order can be produced and delivered.",
    ],
  },
  {
    heading: "What is stored",
    body: [
      "Account records: name, email, role, agency, and store memberships.",
      "Store configuration: branding, currencies, domain, connected payment account identifier, carrier account numbers and tax settings. Card details are never stored — payment credentials go directly to Stripe.",
      "Commerce records: products, artwork files and their placement, generated mockups, orders, fulfilment events, tracking numbers and refunds.",
      "Audit history: who changed what and when, across store setup, imports, pricing, AI approvals, publishing, order routing and administration.",
    ],
  },
  {
    heading: "How isolation works",
    body: [
      "Every commerce record carries the store it belongs to, and every read is scoped to a store the signed-in person has been granted access to. Agency-level reporting aggregates order totals per store; it never merges shopper identities between stores.",
      "A shopper who buys from two stores operated by the same agency exists as two separate customer records, because the two stores are separate controllers.",
    ],
  },
  {
    heading: "Third parties",
    body: [
      "Stripe processes payments on behalf of each store under that store's own account.",
      "Production partners — Printful, Gelato and Printify — receive the delivery address, the item specification and the artwork file needed to make and ship the order. Sourcing enquiries raised through Alibaba.com are made by the seller directly.",
      "DHL, FedEx and UPS receive the delivery address to carry the parcel and return tracking events.",
      "The commerce assistant sends product and catalog context to a third-party AI provider to draft suggestions. Shopper personal data is not included in those prompts.",
    ],
  },
  {
    heading: "Retention",
    body: [
      "Order and fulfilment records are retained for as long as the store operates plus the period the seller must keep them for tax purposes. Archiving a store keeps its records readable for audit and reporting but takes its storefront offline.",
      "Artwork uploaded by a shopper is retained while the order can still be reproduced or disputed, then removed with the order record.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Team members can ask their agency administrator to correct or remove their account. Shoppers should contact the store they bought from — the store team can export or erase an order record and its artwork from the order screen.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy notice</h1>
      <p className="mt-3 text-sm text-muted">
        How data moves through an agency workspace, and where the boundary between stores sits.
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
