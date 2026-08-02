import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { IMAGES } from "@/lib/images";

export const dynamic = "force-static";

const PILLARS = [
  {
    title: "One workspace, many client stores",
    body: "Every client gets an isolated store with its own catalog, customers, orders, currencies, domain and Stripe account. Switch between them in a keystroke; nothing leaks across the boundary.",
  },
  {
    title: "A shared catalog you actually control",
    body: "Platform admins curate supplier-backed apparel and drinkware — costs, print areas, availability and fulfilment regions. Store managers copy what they need into their own catalog.",
  },
  {
    title: "Nothing publishes without a human",
    body: "Artwork pre-flight, mockup approval, margin review and every AI suggestion require an explicit confirmation before the change is applied.",
  },
];

const FEATURES = [
  {
    eyebrow: "Sourcing",
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
    eyebrow: "Configurator",
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
    eyebrow: "Fulfilment",
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
    a: "Nothing. Gemini drafts product ideas, supplier recommendations, descriptions, tags and prices. Each one is stored as a pending suggestion, shown next to the value it would replace, and applied only when a person confirms it.",
  },
  {
    q: "Which products are supported at launch?",
    a: "Apparel with 2D print areas — tees and hoodies — plus 11oz and 15oz ceramic mugs. Each product declares its printable rectangle in millimetres along with the supplier's minimum DPI and file rules.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge tone="brand">Multi-store commerce for agencies</Badge>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              Launch a branded product store for every client — without a warehouse
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-inksoft sm:text-lg">
              Parcelith gives agencies one workspace for isolated client stores, a curated catalog of
              supplier-backed apparel and mugs, an artwork configurator that pre-flights every design, and
              order routing that ends at a tracked parcel.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary">
                Open the workspace
              </Link>
              <Link href="/how-it-works" className="btn-secondary">
                See how it works
              </Link>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
              <div>
                <dt className="text-muted">Print areas</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink">Defined in mm</dd>
              </div>
              <div>
                <dt className="text-muted">Payments</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink">Seller&rsquo;s Stripe</dd>
              </div>
              <div>
                <dt className="text-muted">Carriers</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink">DHL · FedEx · UPS</dd>
              </div>
            </dl>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
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
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Built around how agencies actually work
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="card-pad">
              <h3 className="text-base font-semibold text-ink">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-inksoft">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {FEATURES.map((feature, index) => (
        <section
          key={feature.title}
          className={index % 2 === 1 ? "border-y border-line bg-canvas" : undefined}
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-2 lg:items-center">
            <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
              <p className="section-title">{feature.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{feature.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-inksoft sm:text-base">{feature.body}</p>
              <ul className="mt-5 space-y-2.5">
                {feature.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm text-inksoft">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className={index % 2 === 1 ? "lg:order-1" : undefined}>
              <div className="overflow-hidden rounded-2xl border border-line bg-white">
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
        </section>
      ))}

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          From brief to delivered parcel
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-inksoft sm:text-base">
          The whole product lifecycle sits in one place, so nothing depends on a spreadsheet handover
          between the person who designs the range and the person who ships it.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map((item) => (
            <li key={item.step} className="card p-5">
              <span className="font-mono text-xs font-semibold text-brand-600">{item.step}</span>
              <h3 className="mt-2 text-sm font-semibold text-ink">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Questions worth asking</h2>
          <dl className="mt-8 grid gap-5 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="card-pad">
                <dt className="text-base font-semibold text-ink">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-inksoft">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Open the workspace with demo data
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-inksoft sm:text-base">
            Four client stores, a shared supplier catalog, live artwork pre-flight and a full order queue are
            already populated. Sign in as an agency director, a catalog producer or the platform admin.
          </p>
          <Link href="/login" className="btn-primary mt-7">
            Sign in to the demo
          </Link>
        </div>
      </section>
    </>
  );
}
