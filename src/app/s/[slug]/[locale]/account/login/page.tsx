import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getShopperAccount } from "@/lib/accounts";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storefrontBySlug } from "@/lib/storefront-data";
import { SignInForm } from "../AccountForms";

type Params = Promise<{ slug: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const active = shopperLocale(store, locale);
  const t = await shopperTranslator(store, active);
  return shopperPageMetadata(store, active, "/account/login", { title: t("account.signInTitle"), robots: { index: false, follow: false } });
}

/** Signing in to the store with a link sent by email. */
export default async function AccountLoginPage({ params }: { params: Params }) {
  const { slug, locale: requested } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const { t, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  if (await getShopperAccount()) redirect(`${base}/account`);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{t("account.signInTitle")}</h1>
      <p className="mt-2 text-sm text-inksoft">{t("account.signInBody")}</p>
      <div className="mt-8">
        <SignInForm storeId={store.id} />
      </div>
    </div>
  );
}
