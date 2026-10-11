import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { shopperIntl } from "@/i18n/storefront";
import { THEMES, type Store } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * The not-found bodies of a store or portal that does resolve, in the shopper's
 * language. Kept apart from NotFoundViews because they read next-intl on the
 * server, and the workspace's client boundaries import that module.
 */

/** The way back for a mistyped or retired shopper URL, in the shopper's language. */
export async function StorefrontNotFoundView({ store, locale }: { store: Store; locale: string }) {
  const { t, base } = await shopperIntl(store, locale, `/s/${store.slug}`);
  const accent = THEMES[store.theme].accent;

  return (
    <FallbackPanel
      eyebrow={store.name}
      title={t("fallback.notFoundTitle")}
      description={<p>{t("fallback.notFoundBody")}</p>}
      actions={
        <>
          <Link
            href={`${base}/products`}
            className={cn(buttonVariants(), "text-white")}
            style={{ background: accent }}
          >
            {t("fallback.browseProducts")}
          </Link>
          <Link href={`${base}/cart`} className={buttonVariants({ variant: "outline" })}>
            {t("basket.title")}
          </Link>
          <Link href={`${base}/orders`} className={buttonVariants({ variant: "outline" })}>
            {t("chrome.orderStatus")}
          </Link>
        </>
      }
    />
  );
}

/**
 * A mistyped address inside a gift portal that does resolve. The portal runs in
 * the shopper's language, so this reads in it too; a catalogue whose store
 * could not be loaded falls back to English.
 */
export async function GiftPortalNotFoundView({
  catalogue,
  store,
  locale,
}: {
  catalogue: { slug: string; name: string };
  store: Store | null;
  locale: string;
}) {
  const { t, base } = await shopperIntl(store ?? { defaultLanguage: DEFAULT_LOCALE }, locale, `/g/${catalogue.slug}`);

  return (
    <FallbackPanel
      eyebrow={catalogue.name}
      title={t("gift.notFoundTitle")}
      description={<p>{t("gift.notFoundBody")}</p>}
      actions={
        <Link href={base} className={buttonVariants()}>
          {t("gift.backToCatalogue")}
        </Link>
      }
    />
  );
}
