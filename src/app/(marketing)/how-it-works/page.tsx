import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Parcelith runs the product lifecycle: isolated client stores, a curated supplier catalog, artwork pre-flight, mockup approval, margin review, Stripe checkout and supplier routing.",
};

const ROLES = [
  {
    role: "Platform admin",
    owns: "Suppliers, the shared catalog, global tax brackets, agencies and store access.",
    cannot: "Cannot change a client's storefront copy or prices — that belongs to the store team.",
  },
  {
    role: "Agency team",
    owns: "Creating stores, branding, domains, payments, carriers and the people invited to each store.",
    cannot: "Sees performance across its own stores only. Never another agency's data.",
  },
  {
    role: "Store manager",
    owns: "Catalog imports, artwork, mockups, pricing, tax bracket, visibility and publishing.",
    cannot: "Role-scoped: a catalog manager cannot touch settings, an order manager cannot re-price.",
  },
  {
    role: "Shopper",
    owns: "Browsing, customising eligible products, paying and tracking their own order.",
    cannot: "Only ever sees one store. Carts and orders are scoped to that store.",
  },
];

const STAGES = [
  {
    title: "1 · Store setup",
    body: "A guided six-step wizard covers branding, localisation, domain, Stripe, carriers and tax. Each step records what is still missing, so a half-configured store cannot quietly go live and take payments it cannot settle.",
    detail: [
      "Logo upload, theme selection and default language",
      "Selling currencies with one default — global coverage, formatted per currency",
      "Custom domain with a verification state",
      "Stripe account connection and charge capability",
      "DHL, FedEx and UPS accounts with the services each one offers",
      "Default tax bracket and whether displayed prices include tax",
    ],
  },
  {
    title: "2 · Sourcing and import",
    body: "The shared catalog holds supplier-backed products with base costs, variants, print areas, availability and fulfilment regions. Store managers search, filter and compare candidates, then copy one into their own catalog — the shared record is never mutated.",
    detail: [
      "Filter by category, supplier, availability and fulfilment region",
      "Compare up to three products on cost, lead time and print areas",
      "Import creates an isolated store product with its own price and status",
    ],
  },
  {
    title: "3 · Customisation and pre-flight",
    body: "Artwork is positioned inside a print area declared in millimetres. Effective print resolution is computed from the placement, so scaling a small logo up is caught before production rather than after.",
    detail: [
      "Drag, scale, rotate and remove artwork per print area",
      "Errors block approval: outside the print area, below minimum DPI, wrong format, oversized file, missing transparency",
      "Every error states the correction, not just the failure",
    ],
  },
  {
    title: "4 · Mockups and margin",
    body: "Mockups are composited from the real placement onto the supplier's product photography for each relevant view. A product cannot be published until a person has approved those mockups and seen the full cost-to-margin breakdown.",
    detail: [
      "Front, back and side previews as the product requires",
      "Supplier cost, customisation cost, estimated shipping, tax bracket",
      "Selling price, margin amount and margin percentage before publication",
    ],
  },
  {
    title: "5 · Storefront",
    body: "The storefront editor is a drag-and-drop canvas of approved sections built on Craft.js. Arrange, edit, preview at three widths, then publish — or revert to the last published version if a change did not land.",
    detail: [
      "Eight approved section types, each with a generated settings panel",
      "Desktop, tablet and phone preview widths",
      "Publish, revert to published, and a version history",
    ],
  },
  {
    title: "6 · Checkout and fulfilment",
    body: "Shoppers customise eligible products, review the final preview and pay in a supported currency through the store's own Stripe account. Paid orders are routed to the supplier; anything that needs a human is flagged instead of failing silently.",
    detail: [
      "Order confirmation and a public status page per order",
      "Production, shipment, delivery, cancellation and exception states",
      "Carrier tracking links for teams and shoppers",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From an empty store to a tracked parcel
          </h1>
          <p className="mt-5 text-base leading-relaxed text-inksoft">
            Parcelith is a headless commerce core wrapped in the workflow an agency needs: a store is a
            separate commerce channel with its own catalog, customers, currencies, tax configuration and
            payment account. Everything below happens inside that boundary.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
        <ol className="space-y-10">
          {STAGES.map((stage) => (
            <li key={stage.title}>
              <h2 className="text-xl font-semibold tracking-tight text-ink">{stage.title}</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-inksoft sm:text-base">{stage.body}</p>
              <ul className="mt-4 space-y-2 rounded-xl border border-line bg-canvas p-5">
                {stage.detail.map((d) => (
                  <li key={d} className="flex gap-2.5 text-sm text-inksoft">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {d}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Who can do what</h2>
          <div className="mt-6 relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Owns</th>
                  <th scope="col" className="px-4 py-3">Boundary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ROLES.map((row) => (
                  <tr key={row.role}>
                    <th scope="row" className="px-4 py-3 font-semibold text-ink">{row.role}</th>
                    <td className="px-4 py-3 text-inksoft">{row.owns}</td>
                    <td className="px-4 py-3 text-muted">{row.cannot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-line bg-white p-8">
          <h2 className="text-xl font-semibold tracking-tight text-ink">The assistant</h2>
          <p className="mt-3 text-sm leading-relaxed text-inksoft">
            Drafts product ideas, supplier picks, copy, tags and prices as pending suggestions. Applying one is
            a separate, audited step.
          </p>
          <Link href="/login" className="btn-primary mt-6">
            Try it in the workspace
          </Link>
        </div>
      </section>
    </>
  );
}
