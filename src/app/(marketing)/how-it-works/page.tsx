import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckList, Section, SectionHeading } from "../kit";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Store setup, supplier sourcing, artwork checks, mockups, storefronts, checkout, fulfilment and corporate gifting in Parcelith.",
};

const ROLES = [
  {
    role: "Platform admin",
    owns: "Suppliers, shared catalog, tax brackets, agencies and store access",
    cannot: "Store copy and prices",
  },
  {
    role: "Agency team",
    owns: "Stores, branding, domains, payments, carriers and team members",
    cannot: "Other agencies' stores",
  },
  {
    role: "Store manager",
    owns: "Catalog, artwork, mockups, pricing and publishing",
    cannot: "Anything outside their role",
  },
  {
    role: "Shopper",
    owns: "Browsing, personalising, paying and tracking orders",
    cannot: "Other stores",
  },
  {
    role: "Gift buyer",
    owns: "Recipient lists, approval requests and campaign payment",
    cannot: "Paying before approval",
  },
  {
    role: "Gift approver",
    owns: "Approving or declining a campaign",
    cannot: "Editing or paying for the list",
  },
];

/** `id` is set where another page links straight at a stage. */
const STAGES: { id?: string; title: string; body: string; detail: string[] }[] = [
  {
    title: "1. Store setup",
    body: "A six-step setup covers branding, language, domain, payments, carriers and tax.",
    detail: [
      "Logo, theme and default language",
      "Selling currencies",
      "Custom domain",
      "Stripe account",
      "DHL, FedEx and UPS accounts",
      "Tax bracket and tax-inclusive prices",
    ],
  },
  {
    title: "2. Sourcing",
    body: "Search the shared supplier catalog and copy products into a store.",
    detail: [
      "Filter by category, supplier, availability and region",
      "Compare up to three products",
      "Set the store's own price and status",
    ],
  },
  {
    title: "3. Artwork",
    body: "Place artwork inside each print area. Problems are flagged with a fix.",
    detail: [
      "Move, scale, rotate and remove artwork",
      "Print area, resolution, format, file size and transparency checks",
    ],
  },
  {
    title: "4. Mockups and margin",
    body: "Approve the mockups and review the margin before publishing.",
    detail: [
      "Front, back and side previews",
      "Supplier cost, print cost, shipping and tax",
      "Selling price and margin",
    ],
  },
  {
    title: "5. Storefront",
    body: "Arrange sections, preview on any screen size and publish.",
    detail: [
      "Eight section types",
      "Desktop, tablet and phone preview",
      "Publish, revert and version history",
    ],
  },
  {
    title: "6. Checkout and fulfilment",
    body: "Shoppers pay in their currency. Orders go to the supplier automatically.",
    detail: [
      "Order confirmation and status page",
      "Production, shipping and delivery updates",
      "Carrier tracking links",
    ],
  },
  {
    id: "gifting",
    title: "7. Corporate gifting",
    body: "Open a private gift catalogue for a company. Their buyer adds recipients, an approver signs off, and each recipient gets an order.",
    detail: [
      "Private link or invite-only access",
      "Spend limit per recipient",
      "CSV or pasted recipient lists",
      "Approval before payment",
      "Orders grouped by campaign",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading max-w-[24ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            How it works
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            From setting up a client store to delivering the first order.
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
        <SectionHeading>Roles</SectionHeading>
        <div className="mt-6 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[36rem] caption-bottom text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Manages</th>
                <th scope="col" className="px-4 py-3">No access to</th>
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
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">AI assistant</h2>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              Suggests products, suppliers, descriptions, tags and prices. You review each one before it is applied.
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
