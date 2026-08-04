import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/data";
import { OrderLookupForm } from "./OrderLookupForm";

export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};

export default async function OrderLookupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Order status</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the order code from your confirmation and the email address on the order. The link in your
        confirmation opens the order directly.
      </p>
      <OrderLookupForm slug={store.slug} />
    </div>
  );
}
