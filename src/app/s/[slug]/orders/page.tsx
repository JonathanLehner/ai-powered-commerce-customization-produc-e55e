import type { Metadata } from "next";
import { UnknownStoreView } from "@/components/NotFoundViews";
import { getStoreBySlug } from "@/lib/data";
import { storefrontLocale } from "@/lib/i18n";
import { OrderLookupForm } from "./OrderLookupForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return {
    title: store ? storefrontLocale(store).t.order.title : "Order status",
    robots: { index: false, follow: false },
  };
}

export default async function OrderLookupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;
  const { t } = storefrontLocale(store);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.order.title}</h1>
      <p className="mt-2 text-sm text-muted">{t.order.lookupIntro}</p>
      <OrderLookupForm slug={store.slug} t={t.order} />
    </div>
  );
}
