import Link from "next/link";
import { LockIcon } from "lucide-react";
import { UnknownGiftPortalView } from "@/components/NotFoundViews";
import { ProductCard } from "@/components/ProductCard";
import { Callout, EmptyState } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{t.gift.closedTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {fmt(t.gift.closedBody, { company: catalogue.companyName })}
          </p>
        </Card>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <Card className="p-6">
          <Badge className="gap-1.5">
            <LockIcon aria-hidden className="size-3" />
            {t.gift.privateBadge}
          </Badge>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">{catalogue.name}</h1>
          {catalogue.access === "invite" ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {fmt(t.gift.inviteBody, { company: catalogue.companyName })}
              </p>
              <div className="mt-6">
                <GateForm slug={catalogue.slug} t={t.gift} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {fmt(t.gift.linkOnlyBody, { company: catalogue.companyName })}
            </p>
          )}
        </Card>
      </div>
    );
  }

  const published = await listPublishedProducts(store.id);
  const products = giftProductOptions(catalogue, published, store.channelCode);
  const available = published.filter((product) => products.some((option) => option.id === product.id));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            {catalogue.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {catalogue.intro || fmt(t.gift.introFallback, { company: catalogue.companyName })}
          </p>
        </div>
        {available.length > 0 ? (
          <Button asChild size="lg">
            <Link href={`/g/${catalogue.slug}/order`}>{t.gift.startOrder}</Link>
          </Button>
        ) : null}
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: t.gift.spendLimitLabel,
            value:
              catalogue.spendLimitPerRecipient > 0
                ? money(catalogue.spendLimitPerRecipient, catalogue.currency)
                : t.gift.noLimit,
          },
          {
            label: t.gift.approvalLabel,
            value: catalogue.approvalRequired
              ? catalogue.approverName || t.gift.approvalRequired
              : t.gift.approvalNotRequired,
          },
          {
            label: t.gift.recipientsLabel,
            value: fmt(t.gift.recipientsUpTo, { count: MAX_RECIPIENTS }),
          },
        ].map((row) => (
          <Card key={row.label} className="bg-secondary p-4">
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">{row.label}</dt>
            <dd className="mt-1.5 text-base font-semibold text-ink">{row.value}</dd>
          </Card>
        ))}
      </dl>

      {available.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={t.gift.emptyTitle} description={t.gift.emptyBody} />
        </div>
      ) : (
        <>
          <h2 className="mt-14 text-xl font-semibold tracking-tight text-ink">{t.gift.giftsTitle}</h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3">
            {available.map((product, index) => {
              const price = convert(product.price, product.currency, catalogue.currency);
              const sizes = [
                ...new Set(product.variants.filter((v) => v.enabled).map((v) => v.size).filter(Boolean)),
              ];
              const overLimit =
                catalogue.spendLimitPerRecipient > 0 && price > catalogue.spendLimitPerRecipient;
              return (
                <li key={product.id}>
                  <ProductCard
                    href={`/g/${catalogue.slug}/order`}
                    name={product.name}
                    price={money(price, catalogue.currency)}
                    tagline={product.description.split("\n")[0]}
                    imageUrl={product.mockups[0]?.url ?? null}
                    placeholder={t.gift.previewSoon}
                    eager={index < 2}
                    badge={overLimit ? <Badge variant="warning">{t.gift.overLimit}</Badge> : null}
                    footnote={
                      sizes.length > 0 ? fmt(t.gift.sizes, { sizes: sizes.join(", ") }) : t.gift.oneSize
                    }
                  />
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
        <div className="mt-8">
          <Callout tone="amber" title={t.gift.overLimitTitle}>
            {t.gift.overLimitBody}
          </Callout>
        </div>
      ) : null}

      <section className="mt-16 rounded-card border border-line bg-secondary p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t.gift.howItWorks}</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps(t.gift).map((step, index) => (
            <li key={step.title}>
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
        {available.length > 0 ? (
          <Button asChild className="mt-7">
            <Link href={`/g/${catalogue.slug}/order`}>{t.gift.startOrder}</Link>
          </Button>
        ) : null}
      </section>
    </div>
  );
}
