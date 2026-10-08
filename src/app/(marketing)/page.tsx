import { ArrowRightIcon, LayersIcon, LibraryBigIcon, ShieldCheckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { IMAGES } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckList, Section, SectionHeading } from "./kit";

export const dynamic = "force-static";

const PILLARS = [
  {
    icon: LayersIcon,
    title: "One workspace, many client stores",
    body: "Every client gets an isolated store with its own catalog, customers, orders, currencies, domain and Stripe account. Switch between them in a keystroke; nothing leaks across the boundary.",
  },
  {
    icon: LibraryBigIcon,
    title: "A shared catalog you actually control",
    body: "Platform admins curate supplier-backed apparel and drinkware — costs, print areas, availability and fulfilment regions. Store managers copy what they need into their own catalog.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Nothing publishes without a human",
    body: "Artwork pre-flight, mockup approval, margin review and every AI suggestion require an explicit confirmation before the change is applied.",
  },
];

const FEATURES = [
  {
    title: "Compare production partners before you commit",
    body: "Search the shared catalog by category, supplier, cost and fulfilment region, then put candidates side by side. Printful, Gelato and Printify expose production APIs, so orders route automatically. Alibaba.com sits in the same comparison for bulk sourcing and RFQs — flagged for manual handling, because transaction APIs vary supplier by supplier.",
    points: [
      "Base cost, customisation cost and lead time per supplier",
      "Fulfilment region coverage checked against the store's markets",
      "Copy into a store catalog without touching the shared record",
    ],
    image: IMAGES["marketing-sourcing"],
    alt: "Blank merchandise samples and fabric swatches arranged on a pale surface",
  },
  {
    title: "Artwork that is checked before it reaches production",
    body: "Upload a logo, drag it inside the print area, scale and rotate it, and watch the effective print resolution update as you go. Anything that breaks the supplier's rules blocks approval and tells you exactly how to fix it — the file format, the megapixel ceiling, the transparent background, the design hanging over the seam.",
    points: [
      "2D print areas defined in millimetres, not guesswork",
      "Live DPI, bounds and file-requirement checks",
      "Front, back and side mockups generated from the real placement",
    ],
    image: IMAGES["marketing-mockup"],
    alt: "Hands positioning a transfer sheet over a folded blank t-shirt",
  },
  {
    title: "Paid orders become production jobs",
    body: "When a shopper pays through the store's own Stripe account, the order is routed to the selected supplier and the submission result is recorded. Jobs that need a human — an unsupported destination, a multi-supplier basket, a sourcing marketplace — are flagged rather than silently dropped.",
    points: [
      "DHL, FedEx and UPS tracking surfaced to teams and shoppers",
      "Refunds, cancellations and supplier exceptions handled in one queue",
      "Every routing decision written to the audit log",
    ],
    image: IMAGES["marketing-fulfilment"],
    alt: "Kraft parcel boxes, packing tape and a barcode scanner on a workbench",
  },
];

/**
 * The gifting portal, told in the order the two people outside the workspace
 * meet it: the buyer builds the list, the approver signs it off on a link of
 * their own, and only then does a payment become one order per recipient.
 */
const GIFT_FLOW = [
  {
    step: "01",
    title: "The store publishes a catalogue",
    body: "A private gift range per company, drawn from that store's own published products, open to anyone with the link or only to invited addresses.",
  },
  {
    step: "02",
    title: "The buyer brings the recipient list",
    body: "Paste it or upload the spreadsheet HR already has. Every row is checked — address, country, a size that is actually made, the spend limit per person — before anything is created.",
  },
  {
    step: "03",
    title: "The approver signs it off",
    body: "The list goes to the company's approver on a link of their own, showing every recipient and the total. They approve or decline with a note; the buyer cannot pay until they do.",
  },
  {
    step: "04",
    title: "One campaign, one order each",
    body: "A single payment raises an order per recipient, grouped under the campaign in the store's order queue, so production and exceptions are worked per programme.",
  },
];

const GIFT_POINTS = [
  "Gated by private link or by invited email address, revocable at any time",
  "Up to 100 recipients a campaign, validated row by row before submission",
  "Approval, payment and every per-recipient order kept under one campaign",
];

const LIFECYCLE = [
  { step: "01", title: "Create the store", body: "Name it, upload the client's logo, pick a theme, choose selling currencies and map a custom domain." },
  { step: "02", title: "Connect money and shipping", body: "The client's own Stripe account, their carrier accounts, and the tax bracket each product falls into." },
  { step: "03", title: "Import and customise", body: "Copy supplier products into the store catalog, place artwork, approve the mockups, review the margin." },
  { step: "04", title: "Build the storefront", body: "Drag approved sections into place, preview at phone and desktop widths, publish or revert." },
  { step: "05", title: "Sell and fulfil", body: "Shoppers customise, pay and track. Orders route to production and exceptions land in the order queue." },
];

const FAQ = [
  {
    q: "Who is the merchant of record?",
    a: "Each seller is. Payments settle into the store's own connected Stripe account, and the seller owns tax, refunds and supplier liabilities. Parcelith never takes custody of the funds.",
  },
  {
    q: "How isolated is a client store really?",
    a: "A store is a separate commerce channel. Products, prices, customers, carts, orders, storefront layouts and team members belong to it alone. An agency sees performance across its stores, but shopper data is never combined between them.",
  },
  {
    q: "What can the AI assistant do on its own?",
    a: "Nothing. It drafts ideas, supplier picks, copy, tags and prices as pending suggestions. Applying one is a separate, audited step.",
  },
  {
    q: "Who can open a company's gift catalogue?",
    a: "Whoever the store decides. A catalogue is either open to anyone holding its private link or restricted to a list of invited email addresses, and regenerating the link closes every link handed out so far. It is never indexed and never appears in the client's public storefront.",
  },
  {
    q: "How do gift orders reach fulfilment?",
    a: "The same way every other order does. One approved, paid campaign becomes one order per recipient in the store's queue, each with its own address, shipping and tax, all grouped under the campaign so a programme is worked as a whole.",
  },
  {
    q: "Which products are supported at launch?",
    a: "Apparel with 2D print areas — tees and hoodies — plus 11oz and 15oz ceramic mugs. Each product declares its printable rectangle in millimetres along with the supplier's minimum DPI and file rules.",
  },
];

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

export default function LandingPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div>
            <h1 className="font-heading max-w-[22ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              Launch a branded product store for every client, without a warehouse
            </h1>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              Parcelith gives agencies one workspace for isolated client stores, a curated catalog of
              supplier-backed apparel and mugs, an artwork configurator that pre-flights every design, and
              order routing that ends at a tracked parcel.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="px-4">
                <Link href="/login">Open the workspace</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-4">
                <Link href="/how-it-works">See how it works</Link>
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Print areas</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">Defined in mm</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Payments</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">Seller&rsquo;s Stripe</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Carriers</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">DHL · FedEx · UPS</dd>
              </div>
            </dl>
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Image
              src={IMAGES["marketing-hero"]}
              alt="A studio desk with folded blank apparel, ceramic mugs and colour swatches"
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
        <SectionHeading>Built around how agencies actually work</SectionHeading>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <Card key={pillar.title} className="h-full">
              <CardHeader>
                <pillar.icon aria-hidden className="size-5 text-muted-foreground" />
                <CardTitle asChild className="mt-2">
                  <h3>{pillar.title}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {FEATURES.map((feature, index) => (
        <Section key={feature.title} tone={index % 2 === 1 ? "muted" : "plain"}>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
              <SectionHeading>{feature.title}</SectionHeading>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{feature.body}</p>
              <CheckList items={feature.points} className="mt-6" />
            </div>
            <div className={index % 2 === 1 ? "lg:order-1" : undefined}>
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <Image
                  src={feature.image}
                  alt={feature.alt}
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
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Corporate gifting</p>
            <SectionHeading className="mt-3">
              A gifting portal each company can run on its own
            </SectionHeading>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every store can open a private gift catalogue for the companies it supplies: its own web
              address, its own branded product range, a spend limit per recipient and an approver who has to
              sign the list off before a card is charged. The buyer never sees the workspace, and the store
              never re-keys a spreadsheet.
            </p>
            <CheckList items={GIFT_POINTS} className="mt-6" />
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild variant="outline" size="lg" className="px-4">
                <Link href="/how-it-works#gifting">See the gifting walkthrough</Link>
              </Button>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                On every plan
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Image
              src={IMAGES["marketing-gifting"]}
              alt="Kraft gift boxes tied with ribbon beside a folded navy hoodie and a white ceramic mug"
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
          {GIFT_FLOW.map((item) => (
            <StepCard key={item.step} {...item} />
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading
          lead="The whole product lifecycle sits in one place, so nothing depends on a spreadsheet handover between the person who designs the range and the person who ships it."
        >
          From brief to delivered parcel
        </SectionHeading>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map((item) => (
            <StepCard key={item.step} {...item} />
          ))}
        </ol>
      </Section>

      <Section tone="muted">
        <SectionHeading>Common questions</SectionHeading>
        <dl className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map((item) => (
            <Card key={item.q} className="h-full">
              <CardContent>
                <dt className="font-heading text-base font-medium text-foreground">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
              </CardContent>
            </Card>
          ))}
        </dl>
      </Section>

      <Section>
        <div className="rounded-xl bg-primary/5 px-6 py-12 text-center ring-1 ring-primary/20 sm:px-12">
          <h2 className="font-heading mx-auto max-w-[24ch] text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
            Open the workspace with demo data
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Four client stores, a shared supplier catalog, live artwork pre-flight and a full order queue are
            already populated. Sign in as an agency director, a catalog producer or the platform admin.
          </p>
          <Button asChild size="lg" className="mt-8 px-4">
            <Link href="/login">Sign in to the demo</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
