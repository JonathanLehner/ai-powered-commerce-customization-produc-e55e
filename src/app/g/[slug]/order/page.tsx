import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Callout } from "@/components/ui";
import { getGiftCatalogueBySlug, getStore, listPublishedProducts } from "@/lib/data";
import { readGiftAccess, GIFT_LINK_HOLDER } from "@/lib/gift-access";
import { giftProductOptions, MAX_RECIPIENTS } from "@/lib/gifting";
import { convert } from "@/lib/pricing";
import { sizesFor } from "@/lib/gift-recipients";
import { BulkOrderForm } from "./BulkOrderForm";

export const metadata: Metadata = {
  title: "Bulk gift order",
  robots: { index: false, follow: false },
};

export default async function BulkOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  if (!catalogue) notFound();
  const store = await getStore(catalogue.storeId);
  if (!store) notFound();

  const access = await readGiftAccess(catalogue);
  if (!access || catalogue.status !== "active" || store.status !== "active") redirect(`/g/${slug}`);

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
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link href={`/g/${slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← {catalogue.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Bulk gift order</h1>
      <p className="mt-2 max-w-2xl text-sm text-inksoft">
        Add everyone you are sending to, with the address the parcel should reach and the size they wear. Check
        the list as often as you like — nothing is created until you send it
        {catalogue.approvalRequired ? " for approval" : ""}.
      </p>

      {!store.stripe.connected || !store.stripe.chargesEnabled ? (
        <div className="mt-6">
          <Callout tone="amber" title="Payment is not switched on for this store yet">
            You can still build and send a campaign for approval. It cannot be paid for until{" "}
            {store.clientName} finishes connecting their payment account.
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
          approverLabel={catalogue.approverName || catalogue.approverEmail || "your approver"}
          buyerEmail={access.email === GIFT_LINK_HOLDER ? null : access.email}
        />
      </div>
    </div>
  );
}
