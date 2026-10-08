import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckList, Section, SectionHeading } from "../kit";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Parcelith runs the product lifecycle: isolated client stores, a curated supplier catalog, artwork pre-flight, mockup approval, margin review, Stripe checkout, supplier routing and corporate gifting campaigns.",
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
  {
    role: "Gift buyer",
    owns: "Building a recipient list in their company's gift portal, sending it for approval and paying for the campaign.",
    cannot: "Sees one gift catalogue only, priced to its spend limit. Cannot pay before the approver has signed off.",
  },
  {
    role: "Gift approver",
    owns: "Approving or declining a campaign on a link of their own, with a note back to the buyer.",
    cannot: "Cannot edit the list or pay for it — a change means a new list from the buyer.",
  },
];

/** `id` is set where another page links straight at a stage. */
const STAGES: { id?: string; title: string; body: string; detail: string[] }[] = [
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
  {
    id: "gifting",
    title: "7 · Corporate gifting",
    body: "A store can open a private gift catalogue for a company it supplies, and run a campaign from it. The store sets the catalogue up in the workspace — which published products are in it, who may open it, the spend limit per recipient and who signs a list off. The company's buyer then works entirely in that portal: they build the recipient list, send it to their approver, and pay once it is approved. One payment raises one order per recipient in the store's queue, grouped under the campaign.",
    detail: [
      "Setting the catalogue up: name and intro, the products it offers, gating by private link or invited email addresses, spend limit per recipient, and the approver",
      "Running a campaign: paste the recipient list or upload the spreadsheet, and every row is checked against the catalogue — unreadable address, unknown country, a size that is not made, a gift over the limit — with the problem named per row",
      "Approval: the buyer sends the list to the approver on a link of their own, who sees every recipient and the total and approves or declines with a note",
      "Payment and fulfilment: prices are re-read and the limit re-checked at payment, then one order per recipient joins the store's order queue under the campaign",
      "Regenerating a catalogue's link closes every link already handed out; a paused catalogue stops taking new campaigns",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading max-w-[24ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            From an empty store to a tracked parcel
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Parcelith is a headless commerce core wrapped in the workflow an agency needs: a store is a
            separate commerce channel with its own catalog, customers, currencies, tax configuration and
            payment account. Everything below happens inside that boundary.
          </p>
        </div>
      </section>

      <Section width="prose">
        <ol className="space-y-10">
          {STAGES.map((stage) => (
            <li key={stage.title} id={stage.id} className={stage.id ? "scroll-mt-20" : undefined}>
              <h2 className="font-heading text-xl font-semibold tracking-tight text-balance text-foreground">
                {stage.title}
              </h2>
              <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {stage.body}
              </p>
              <Card className="mt-5">
                <CardContent>
                  <CheckList items={stage.detail} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="muted" width="prose">
        <SectionHeading>Who can do what</SectionHeading>
        <p className="mt-4 text-xs text-muted-foreground sm:hidden">
          Scroll the table sideways to read each role&rsquo;s boundary.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 sm:mt-6">
          <table className="w-full min-w-[36rem] caption-bottom text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Owns</th>
                <th scope="col" className="px-4 py-3">Boundary</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((row) => (
                <tr key={row.role} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 align-top font-semibold text-foreground">{row.role}</th>
                  <td className="px-4 py-3 align-top text-muted-foreground">{row.owns}</td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{row.cannot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section width="prose">
        <Card>
          <CardContent className="py-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">The assistant</h2>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              Drafts product ideas, supplier picks, copy, tags and prices as pending suggestions. Applying one is
              a separate, audited step.
            </p>
            <Button asChild size="lg" className="mt-6 px-4">
              <Link href="/login">Try it in the workspace</Link>
            </Button>
          </CardContent>
        </Card>
      </Section>
    </>
  );
}
