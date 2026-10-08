import Link from "next/link";
import { UnknownGiftPortalView } from "@/components/NotFoundViews";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { Badge, Callout, EmptyState } from "@/components/ui";
import { getGiftCatalogueBySlug, getStore, listPublishedProducts } from "@/lib/data";
import { readGiftAccess } from "@/lib/gift-access";
import { giftProductOptions, MAX_RECIPIENTS } from "@/lib/gifting";
import { fmt, storefrontLocale, type StorefrontCopy } from "@/lib/i18n";
import { convert } from "@/lib/pricing";
import { GateForm } from "./GateForm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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
        <Card className="block overflow-visible p-6">
          <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{t.gift.closedTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {fmt(t.gift.closedBody, { company: catalogue.companyName })}
        </p>
        </Card>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <Card className="block overflow-visible p-6">
          <Badge tone="brand">{t.gift.privateBadge}</Badge>
          <h1 className="font-heading mt-3 text-lg font-semibold tracking-tight text-foreground">{catalogue.name}</h1>
          {catalogue.access === "invite" ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {fmt(t.gift.inviteBody, { company: catalogue.companyName })}
              </p>
              <div className="mt-5">
                <GateForm slug={catalogue.slug} t={t.gift} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{catalogue.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-inksoft">
            {catalogue.intro || fmt(t.gift.introFallback, { company: catalogue.companyName })}
          </p>
        </div>
        {available.length> 0 ? (
          <Link href={`/g/${catalogue.slug}/order`} className={buttonVariants({ size: "lg" })}>
            {t.gift.startOrder}
          </Link>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
        ].map((stat) => (
          <Card asChild key={stat.label} size="sm">
            <dl>
              <CardContent>
                <dt className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  {stat.label}
                </dt>
                <dd className="font-heading mt-1.5 text-lg font-semibold text-foreground">
                  {stat.value}
                </dd>
              </CardContent>
            </dl>
          </Card>
        ))}
      </div>

      {available.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t.gift.emptyTitle} description={t.gift.emptyBody} />
        </div>
      ) : (
        <>
          <h2 className="font-heading mt-12 text-base font-semibold text-foreground">
            {t.gift.giftsTitle}
          </h2>
          <ProductTileGrid className="mt-5">
            {available.map((product, index) => {
              const price = convert(product.price, product.currency, catalogue.currency);
              const sizes = [
                ...new Set(product.variants.filter((v) => v.enabled).map((v) => v.size).filter(Boolean)),
              ];
              return (
                <ProductTile
                  key={product.id}
                  name={product.name}
                  tagline={product.description.split("\n")[0]}
                  price={money(price, catalogue.currency)}
                  imageUrl={product.mockups[0]?.url ?? null}
                  imageAlt={product.name}
                  placeholder={t.gift.previewSoon}
                  priority={index < 3}
                  meta={sizes.length > 0 ? fmt(t.gift.sizes, { sizes: sizes.join(", ") }) : t.gift.oneSize}
                  badge={
                    catalogue.spendLimitPerRecipient > 0 && price > catalogue.spendLimitPerRecipient ? (
                      <Badge tone="amber">{t.gift.overLimit}</Badge>
                    ) : null
                  }
                />
              );
            })}
          </ProductTileGrid>
        </>
      )}

      {available.some(
        (product) =>
          catalogue.spendLimitPerRecipient> 0 &&
          convert(product.price, product.currency, catalogue.currency)> catalogue.spendLimitPerRecipient,
      ) ? (
        <div className="mt-6">
          <Callout tone="amber" title={t.gift.overLimitTitle}>
            {t.gift.overLimitBody}
          </Callout>
        </div>
      ) : null}

      <section className="mt-16 rounded-xl border border-border bg-muted/60 p-6 sm:p-8">
        <h2 className="font-heading text-base font-semibold text-foreground">{t.gift.howItWorks}</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps(t.gift).map((step, index) => (
            <li key={step.title}>
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
        {available.length > 0 ? (
          <Link
            href={`/g/${catalogue.slug}/order`}
            className={cn(buttonVariants({ size: "lg" }), "mt-8 inline-flex")}
          >
            {t.gift.startOrder}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
