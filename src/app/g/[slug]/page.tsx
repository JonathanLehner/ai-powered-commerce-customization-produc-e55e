import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Callout, EmptyState } from "@/components/ui";
import { getGiftCatalogueBySlug, getStore, listPublishedProducts } from "@/lib/data";
import { readGiftAccess } from "@/lib/gift-access";
import { giftProductOptions, MAX_RECIPIENTS } from "@/lib/gifting";
import { convert } from "@/lib/pricing";
import { formatMoney } from "@/lib/util";
import { GateForm } from "./GateForm";

const STEPS = [
  {
    title: "Pick the gift",
    detail: "Everything here is already produced for this programme, in the sizes your people can choose from.",
  },
  {
    title: "Add your recipient list",
    detail: "Paste it from a spreadsheet or upload a CSV — names, addresses, sizes and an optional message.",
  },
  {
    title: "Approval",
    detail: "The list goes to your approver with its total before anything is paid for.",
  },
  {
    title: "One payment, one parcel each",
    detail: "You are charged once. Every recipient gets their own parcel and their own tracking.",
  },
];

export default async function GiftCataloguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  if (!catalogue) notFound();
  const store = await getStore(catalogue.storeId);
  if (!store) notFound();

  const access = await readGiftAccess(catalogue);

  if (catalogue.status !== "active" || store.status !== "active") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <div className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">This catalogue is closed</h1>
          <p className="mt-2 text-sm text-muted">
            {catalogue.companyName}&rsquo;s gifting programme is paused. Whoever runs it for you can reopen it —
            campaigns already placed are unaffected.
          </p>
        </div>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <div className="card p-6">
          <Badge tone="brand">Private catalogue</Badge>
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">{catalogue.name}</h1>
          {catalogue.access === "invite" ? (
            <>
              <p className="mt-2 text-sm text-muted">
                {catalogue.companyName}&rsquo;s gift catalogue is open to invited colleagues. Confirm the address
                it was sent to and you will be let straight in.
              </p>
              <div className="mt-5">
                <GateForm slug={catalogue.slug} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              This catalogue opens from the private link {catalogue.companyName}&rsquo;s programme owner shared.
              Use that link again, or ask them for a fresh one — links are rotated whenever the programme changes
              hands.
            </p>
          )}
        </div>
      </div>
    );
  }

  const published = await listPublishedProducts(store.id);
  const products = giftProductOptions(catalogue, published, store.channelCode);
  const available = published.filter((product) => products.some((option) => option.id === product.id));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{catalogue.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-inksoft">
            {catalogue.intro ||
              `Gifts for ${catalogue.companyName}, produced to order and delivered to each recipient individually.`}
          </p>
        </div>
        {available.length > 0 ? (
          <Link href={`/g/${catalogue.slug}/order`} className="btn-primary">
            Start a bulk order
          </Link>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">Spend limit per recipient</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {catalogue.spendLimitPerRecipient > 0
              ? formatMoney(catalogue.spendLimitPerRecipient, catalogue.currency)
              : "No limit"}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">Approval</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {catalogue.approvalRequired ? catalogue.approverName || "Required" : "Not required"}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">Recipients per campaign</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">Up to {MAX_RECIPIENTS}</dd>
        </div>
      </dl>

      {available.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No gifts available right now"
            description="Nothing in this catalogue is currently in production. Whoever runs the programme for you will know when it is back."
          />
        </div>
      ) : (
        <>
          <h2 className="mt-10 text-base font-semibold text-ink">Gifts in this catalogue</h2>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((product, index) => {
              const price = convert(product.price, product.currency, catalogue.currency);
              const sizes = [
                ...new Set(product.variants.filter((v) => v.enabled).map((v) => v.size).filter(Boolean)),
              ];
              return (
                <li key={product.id} className="overflow-hidden rounded-xl border border-line bg-white">
                  <div className="bg-canvas">
                    {product.mockups[0] ? (
                      <Image
                        src={product.mockups[0].url}
                        alt={product.name}
                        width={640}
                        height={640}
                        priority={index < 3}
                        loading={index < 3 ? "eager" : "lazy"}
                        sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
                        className="h-auto w-full object-cover"
                        style={{ aspectRatio: "1 / 1" }}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center text-sm text-muted"
                        style={{ aspectRatio: "1 / 1" }}
                      >
                        Preview coming soon
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                      {catalogue.spendLimitPerRecipient > 0 && price > catalogue.spendLimitPerRecipient ? (
                        <Badge tone="amber">Over limit</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description.split("\n")[0]}</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
                      {formatMoney(price, catalogue.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {sizes.length > 0 ? `Sizes: ${sizes.join(", ")}` : "One size"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {available.some(
        (product) =>
          catalogue.spendLimitPerRecipient > 0 &&
          convert(product.price, product.currency, catalogue.currency) > catalogue.spendLimitPerRecipient,
      ) ? (
        <div className="mt-6">
          <Callout tone="amber" title="Some gifts sit above your spend limit">
            A recipient listed against one of these is rejected when the list is read, so the row can be changed
            before anyone is asked to approve it.
          </Callout>
        </div>
      ) : null}

      <section className="mt-12 rounded-xl border border-line bg-canvas p-6">
        <h2 className="text-base font-semibold text-ink">How a campaign works</h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-ink">
                {index + 1}
              </span>
              <p className="mt-2 text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
        {available.length > 0 ? (
          <Link href={`/g/${catalogue.slug}/order`} className="btn-primary mt-6 inline-flex">
            Start a bulk order
          </Link>
        ) : null}
      </section>
    </div>
  );
}
