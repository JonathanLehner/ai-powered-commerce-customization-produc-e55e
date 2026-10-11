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
    title: "Separate client stores",
    body: "Each client gets its own catalog, customers, orders, currencies, domain and payments.",
  },
  {
    icon: LibraryBigIcon,
    title: "Shared supplier catalog",
    body: "Supplier-backed apparel and mugs with costs, print areas and fulfilment regions. Copy what you need into any store.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Approval before publishing",
    body: "Artwork, mockups, margins and AI suggestions all need sign-off before they go live.",
  },
];

const FEATURES = [
  {
    title: "Compare suppliers side by side",
    body: "Filter the shared catalog by category, supplier, cost and region, then compare the options.",
    points: [
      "Base cost, print cost and lead time",
      "Fulfilment region coverage",
      "Copy into a store catalog",
    ],
    image: IMAGES["marketing-sourcing"],
    alt: "Blank merchandise samples and fabric swatches arranged on a pale surface",
  },
  {
    title: "Artwork checked before production",
    body: "Place a logo in the print area, then scale and rotate it while the print resolution updates.",
    points: [
      "Print areas in millimetres",
      "Resolution, bounds and file checks",
      "Front, back and side mockups",
    ],
    image: IMAGES["marketing-mockup"],
    alt: "Hands positioning a transfer sheet over a folded blank t-shirt",
  },
  {
    title: "Paid orders go to production",
    body: "Each order is sent to its supplier. Orders that need attention are flagged in the order queue.",
    points: [
      "DHL, FedEx and UPS tracking",
      "Refunds, cancellations and exceptions",
      "Full audit log",
    ],
    image: IMAGES["marketing-fulfilment"],
    alt: "Kraft parcel boxes, packing tape and a barcode scanner on a workbench",
  },
];

const GIFT_FLOW = [
  { step: "01", title: "Publish a catalogue", body: "Choose gifts from the store's published products." },
  { step: "02", title: "Add recipients", body: "Paste a list or upload a CSV." },
  { step: "03", title: "Approve", body: "An approver reviews the list and the total." },
  { step: "04", title: "Pay once", body: "Each recipient gets their own order and tracking." },
];

const GIFT_POINTS = [
  "Private link or invite-only access",
  "Up to 100 recipients per campaign",
  "Spend limit per recipient",
];

const LIFECYCLE = [
  { step: "01", title: "Create the store", body: "Logo, theme, currencies and domain." },
  { step: "02", title: "Connect payments", body: "Stripe, carriers and tax." },
  { step: "03", title: "Add products", body: "Import, place artwork and approve mockups." },
  { step: "04", title: "Build the storefront", body: "Arrange sections, preview and publish." },
  { step: "05", title: "Sell and fulfil", body: "Orders go to production with tracking." },
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
              Branded merchandise stores for every client
            </h1>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              Source, customise and sell print-on-demand products from one agency workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="px-4">
                <Link href="/login">Open the workspace</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-4">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Products</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">Apparel and mugs</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Languages</dt>
                <dd className="mt-1 font-heading text-base font-semibold text-foreground">9</dd>
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
        <SectionHeading>Built for agencies</SectionHeading>
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
              Private gift portals for companies
            </SectionHeading>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Give each company its own gift catalogue with bulk recipient lists and approval before payment.
            </p>
            <CheckList items={GIFT_POINTS} className="mt-6" />
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild variant="outline" size="lg" className="px-4">
                <Link href="/how-it-works#gifting">How gifting works</Link>
              </Button>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Included on every plan
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
        <SectionHeading>From brief to delivery</SectionHeading>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map((item) => (
            <StepCard key={item.step} {...item} />
          ))}
        </ol>
      </Section>

      <Section>
        <div className="rounded-xl bg-primary/5 px-6 py-12 text-center ring-1 ring-primary/20 sm:px-12">
          <h2 className="font-heading mx-auto max-w-[24ch] text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
            Try the demo workspace
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Four sample client stores with products, orders and gift campaigns.
          </p>
          <Button asChild size="lg" className="mt-8 px-4">
            <Link href="/login">Sign in to the demo</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
