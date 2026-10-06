import Image from "next/image";
import Link from "next/link";
import { UnknownGiftPortalView } from "@/components/NotFoundViews";
import { Badge, Callout, EmptyState } from "@/components/ui";
import { getGiftCatalogueBySlug, getStore, listPublishedProducts } from "@/lib/data";
import { readGiftAccess } from "@/lib/gift-access";
import { giftProductOptions, MAX_RECIPIENTS } from "@/lib/gifting";
import { fmt, storefrontLocale, type StorefrontCopy } from "@/lib/i18n";
import { convert } from "@/lib/pricing";
import { GateForm } from "./GateForm";

/** The four steps of a campaign, in the store's own language. */
const steps = (t: StorefrontCopy["gift"]) => [
  { title: t.step1Title, detail: t.step1Body },
  { title: t.step2Title, detail: t.step2Body },
  { title: t.step3Title, detail: t.step3Body },
  { title: t.step4Title, detail: t.step4Body },
];

export default async function GiftCataloguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  // A slug that is no catalogue renders the portal's "not this address" page in
  // Parcelith chrome, server-side, rather than raising notFound().
  if (!catalogue) return <UnknownGiftPortalView slug={slug} />;
  const store = await getStore(catalogue.storeId);
  if (!store) return <UnknownGiftPortalView slug={slug} />;

  const access = await readGiftAccess(catalogue);
  const { t, money } = storefrontLocale(store);

  if (catalogue.status !== "active" || store.status !== "active") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <div className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{t.gift.closedTitle}</h1>
          <p className="mt-2 text-sm text-muted">
            {fmt(t.gift.closedBody, { company: catalogue.companyName })}
          </p>
        </div>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <div className="card p-6">
          <Badge tone="brand">{t.gift.privateBadge}</Badge>
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">{catalogue.name}</h1>
          {catalogue.access === "invite" ? (
            <>
              <p className="mt-2 text-sm text-muted">
                {fmt(t.gift.inviteBody, { company: catalogue.companyName })}
              </p>
              <div className="mt-5">
                <GateForm slug={catalogue.slug} t={t.gift} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {fmt(t.gift.linkOnlyBody, { company: catalogue.companyName })}
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
            {catalogue.intro || fmt(t.gift.introFallback, { company: catalogue.companyName })}
          </p>
        </div>
        {available.length > 0 ? (
          <Link href={`/g/${catalogue.slug}/order`} className="btn-primary">
            {t.gift.startOrder}
          </Link>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">{t.gift.spendLimitLabel}</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {catalogue.spendLimitPerRecipient > 0
              ? money(catalogue.spendLimitPerRecipient, catalogue.currency)
              : t.gift.noLimit}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">{t.gift.approvalLabel}</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {catalogue.approvalRequired
              ? catalogue.approverName || t.gift.approvalRequired
              : t.gift.approvalNotRequired}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <dt className="text-xs font-medium text-muted">{t.gift.recipientsLabel}</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">
            {fmt(t.gift.recipientsUpTo, { count: MAX_RECIPIENTS })}
          </dd>
        </div>
      </dl>

      {available.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t.gift.emptyTitle} description={t.gift.emptyBody} />
        </div>
      ) : (
        <>
          <h2 className="mt-10 text-base font-semibold text-ink">{t.gift.giftsTitle}</h2>
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
                        {t.gift.previewSoon}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                      {catalogue.spendLimitPerRecipient > 0 && price > catalogue.spendLimitPerRecipient ? (
                        <Badge tone="amber">{t.gift.overLimit}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description.split("\n")[0]}</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
                      {money(price, catalogue.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {sizes.length > 0 ? fmt(t.gift.sizes, { sizes: sizes.join(", ") }) : t.gift.oneSize}
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
          <Callout tone="amber" title={t.gift.overLimitTitle}>
            {t.gift.overLimitBody}
          </Callout>
        </div>
      ) : null}

      <section className="mt-12 rounded-xl border border-line bg-canvas p-6">
        <h2 className="text-base font-semibold text-ink">{t.gift.howItWorks}</h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps(t.gift).map((step, index) => (
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
            {t.gift.startOrder}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
