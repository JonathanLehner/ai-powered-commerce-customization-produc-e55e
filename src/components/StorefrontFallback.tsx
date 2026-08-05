"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { fmt, type StorefrontCopy } from "@/lib/i18n";
import { createContext, useContext, type ReactNode } from "react";

/**
 * What a storefront's not-found and error boundaries need to know about the shop
 * they are standing in.
 *
 * Boundary files are handed no params, so the layout — which has already
 * resolved the store, its theme and its language — passes it down through
 * context instead. No provider therefore means exactly one thing: the address
 * does not belong to a store at all, and the shopper is told that rather than
 * being offered links into a shop that does not exist.
 */
export interface StorefrontFallbackValue {
  slug: string;
  storeName: string;
  /** The store theme's accent, used for the primary action as elsewhere on the storefront. */
  accent: string;
  basketLabel: string;
  orderStatusLabel: string;
  t: StorefrontCopy["fallback"];
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
      title="This shop is not available at this address"
      description={
        <>
          <p>
            Nothing is published at{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              {pathname}
            </code>
            . The shop may have been renamed, moved to a different address, or closed by the
            business that ran it.
          </p>
          <p className="mt-3">
            Parcelith hosts shops like this one. If you were sent this link, ask the business for
            its current address.
          </p>
        </>
      }
      actions={
        <>
          <Link href="/" className="btn-primary">
            Go to Parcelith
          </Link>
          <Link href="/how-it-works" className="btn-secondary">
            How Parcelith works
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

  const { slug, storeName, accent, basketLabel, orderStatusLabel, t } = store;
  return (
    <FallbackPanel
      eyebrow={storeName}
      title={t.notFoundTitle}
      description={<p>{fmt(t.notFoundBody, { store: storeName })}</p>}
      actions={
        <>
          <Link href={`/s/${slug}/products`} className="btn text-white" style={{ background: accent }}>
            {t.browseProducts}
          </Link>
          <Link href={`/s/${slug}/cart`} className="btn-secondary">
            {basketLabel}
          </Link>
          <Link href={`/s/${slug}/orders`} className="btn-secondary">
            {orderStatusLabel}
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
        title="Something went wrong at our end"
        description={<p>This page could not be loaded. Try again, or come back in a few minutes.</p>}
        actions={
          <>
            <button type="button" onClick={retry} className="btn-primary">
              Try again
            </button>
            <Link href="/" className="btn-secondary">
              Go to Parcelith
            </Link>
          </>
        }
        note={digest ? `Reference ${digest}` : null}
      />
    );
  }

  const { slug, storeName, accent, t } = store;
  return (
    <FallbackPanel
      eyebrow={storeName}
      title={t.errorTitle}
      description={<p>{t.errorBody}</p>}
      actions={
        <>
          <button type="button" onClick={retry} className="btn text-white" style={{ background: accent }}>
            {t.errorRetry}
          </button>
          <Link href={`/s/${slug}`} className="btn-secondary">
            {fmt(t.errorHome, { store: storeName })}
          </Link>
        </>
      }
      note={digest ? fmt(t.errorReference, { digest }) : null}
    />
  );
}
