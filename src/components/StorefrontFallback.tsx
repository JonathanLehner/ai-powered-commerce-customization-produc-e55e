"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { createContext, useContext, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What a storefront's not-found and error boundaries need to know about the shop
 * they are standing in.
 *
 * Boundary files are handed no params, so the layout — which has already
 * resolved the store and its theme — passes it down through context instead.
 * The copy comes from the layout's next-intl provider, in the shopper's language. No provider therefore means exactly one thing: the address
 * does not belong to a store at all, and the shopper is told that rather than
 * being offered links into a shop that does not exist.
 */
export interface StorefrontFallbackValue {
  /** The storefront in the shopper's language: `/s/<slug>` or `/s/<slug>/de`. */
  base: string;
  storeName: string;
  /** The store theme's accent, used for the primary action as elsewhere on the storefront. */
  accent: string;
}

const StorefrontFallbackContext = createContext<StorefrontFallbackValue | null>(null);

export function StorefrontFallbackProvider({
  value,
  children,
}: {
  value: StorefrontFallbackValue;
  children: ReactNode;
}) {
  return (
    <StorefrontFallbackContext.Provider value={value}>{children}</StorefrontFallbackContext.Provider>
  );
}

/** Shown for an address that is not a store: there is no shop language to use, so this stays English. */
function NoSuchStore() {
  const pathname = usePathname();
  return (
    <FallbackPanel
      eyebrow="Parcelith"
      title="Shop not found"
      description={
        <>
          <p>
            No shop exists at{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              {pathname}
            </code>
            .
          </p>
        </>
      }
      actions={
        <>
          <Link href="/" className={buttonVariants()}>
            Go to Parcelith
          </Link>
        </>
      }
    />
  );
}

/** The storefront 404: the store's own chrome is above it, so this is only the body. */
export function StorefrontNotFound() {
  const store = useContext(StorefrontFallbackContext);
  if (!store) return <NoSuchStore />;
  return <StoreNotFound {...store} />;
}

function StoreNotFound({ base, storeName, accent }: StorefrontFallbackValue) {
  const t = useTranslations("storefront");
  return (
    <FallbackPanel
      eyebrow={storeName}
      title={t("fallback.notFoundTitle")}
      description={<p>{t("fallback.notFoundBody")}</p>}
      actions={
        <>
          <Link href={`${base}/products`} className={cn(buttonVariants(), "text-white")} style={{ background: accent }}>
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

/** The storefront error page. `retry` re-renders the failed segment without a full reload. */
export function StorefrontError({ digest, retry }: { digest?: string; retry: () => void }) {
  const store = useContext(StorefrontFallbackContext);

  if (!store) {
    return (
      <FallbackPanel
        eyebrow="Parcelith"
        title="Something went wrong"
        description={<p>This page could not be loaded. Please try again.</p>}
        actions={
          <>
            <Button type="button" onClick={retry}>
              Try again
            </Button>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Go to Parcelith
            </Link>
          </>
        }
        note={digest ? `Reference ${digest}` : null}
      />
    );
  }

  return <StoreError {...store} digest={digest} retry={retry} />;
}

function StoreError({
  base,
  storeName,
  accent,
  digest,
  retry,
}: StorefrontFallbackValue & { digest?: string; retry: () => void }) {
  const t = useTranslations("storefront.fallback");
  return (
    <FallbackPanel
      eyebrow={storeName}
      title={t("errorTitle")}
      description={<p>{t("errorBody")}</p>}
      actions={
        <>
          <Button type="button" onClick={retry} className="text-white" style={{ background: accent }}>
            {t("errorRetry")}
          </Button>
          <Link href={base} className={buttonVariants({ variant: "outline" })}>
            {t("errorHome", { store: storeName })}
          </Link>
        </>
      }
      note={digest ? t("errorReference", { digest }) : null}
    />
  );
}
