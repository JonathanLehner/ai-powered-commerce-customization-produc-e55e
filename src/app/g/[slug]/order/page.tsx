import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UnknownGiftPortalView } from "@/components/NotFoundViews";
import { Callout } from "@/components/ui";
import { getGiftCatalogueBySlug, getStore, listPublishedProducts } from "@/lib/data";
import { readGiftAccess, GIFT_LINK_HOLDER } from "@/lib/gift-access";
import { giftProductOptions, MAX_RECIPIENTS } from "@/lib/gifting";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { convert } from "@/lib/pricing";
import { sizesFor } from "@/lib/gift-recipients";
import { BulkOrderForm } from "./BulkOrderForm";

/** The tab title is the store's too, so it is resolved per catalogue. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  return {
    title: store ? storefrontLocale(store).t.gift.orderTitle : "Bulk gift order",
    robots: { index: false, follow: false },
  };
}

export default async function BulkOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  // A slug that is no catalogue renders the portal's "not this address" page in
  // Parcelith chrome, server-side, rather than raising notFound().
  if (!catalogue) return <UnknownGiftPortalView slug={slug} />;
  const store = await getStore(catalogue.storeId);
  if (!store) return <UnknownGiftPortalView slug={slug} />;

  const access = await readGiftAccess(catalogue);
  if (!access || catalogue.status !== "active" || store.status !== "active") redirect(`/g/${slug}`);

  const { t, tag } = storefrontLocale(store);
  const published = await listPublishedProducts(store.id);
  const options = giftProductOptions(catalogue, published, store.channelCode);
  if (options.length === 0) redirect(`/g/${slug}`);

  const products = options.map((option) => ({
    id: option.id,
    name: option.name,
    price: convert(
      Math.min(...option.variants.filter((v) => v.enabled).map((v) => v.price)),
      option.currency,
      catalogue.currency,
    ),
    sizes: sizesFor(option),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Link href={`/g/${slug}`} className="text-sm font-medium text-primary hover:underline">
        ← {catalogue.name}
      </Link>
      <h1 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-foreground">{t.gift.orderTitle}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inksoft">
        {fmt(t.gift.orderIntro, {
          approval: catalogue.approvalRequired ? t.gift.orderIntroApproval : "",
        })}
      </p>

      {!store.stripe.connected || !store.stripe.chargesEnabled ? (
        <div className="mt-6">
          <Callout tone="amber" title={t.gift.paymentPendingTitle}>
            {fmt(t.gift.paymentPendingBody, { client: store.clientName })}
          </Callout>
        </div>
      ) : null}

      <div className="mt-8">
        <BulkOrderForm
          slug={catalogue.slug}
          products={products}
          currency={catalogue.currency}
          spendLimit={catalogue.spendLimitPerRecipient}
          maxRecipients={MAX_RECIPIENTS}
          approvalRequired={catalogue.approvalRequired}
          approverLabel={catalogue.approverName || catalogue.approverEmail || t.gift.yourApprover}
          buyerEmail={access.email === GIFT_LINK_HOLDER ? null : access.email}
          t={t.gift}
          localeTag={tag}
        />
      </div>
    </div>
  );
}
