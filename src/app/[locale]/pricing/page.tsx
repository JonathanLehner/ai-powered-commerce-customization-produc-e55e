import type { Metadata } from "next";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { PricingView } from "./view";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/pricing", "pricing");
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  return <PricingView locale={asLocale((await params).locale)} selfServe />;
}
