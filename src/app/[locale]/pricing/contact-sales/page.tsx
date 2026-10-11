import type { Metadata } from "next";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { PricingView } from "../view";

/**
 * `/pricing` while plan billing is not configured: the proxy serves this
 * prerendered copy in its place, so both stay static.
 */
export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing/contact-sales">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/pricing", "pricing");
}

export default async function PricingContactSalesPage({ params }: PageProps<"/[locale]/pricing/contact-sales">) {
  return <PricingView locale={asLocale((await params).locale)} selfServe={false} />;
}
