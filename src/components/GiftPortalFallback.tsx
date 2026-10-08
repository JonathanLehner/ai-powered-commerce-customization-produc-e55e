"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { FallbackPanel } from "@/components/ui";
import { fmt, type StorefrontCopy } from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * What a gift portal's not-found and error boundaries need to know about the
 * catalogue they are standing in.
 *
 * Boundary files are handed no params, so the layout — which has already
 * resolved the catalogue, its store and that store's language — passes it down
 * through context, exactly as the storefront does. No provider therefore means
 * the address belongs to no catalogue at all: there is no store language to
 * translate into, so that case stays in English and points back at Parcelith.
 */
export interface GiftPortalFallbackValue {
  slug: string;
  t: StorefrontCopy["gift"];
}

const GiftPortalFallbackContext = createContext<GiftPortalFallbackValue | null>(null);

export function GiftPortalFallbackProvider({
  value,
  children,
}: {
  value: GiftPortalFallbackValue;
  children: ReactNode;
}) {
  return (
    <GiftPortalFallbackContext.Provider value={value}>{children}</GiftPortalFallbackContext.Provider>
  );
}

/** The portal 404 backstop: the catalogue's chrome is above it, so this is only the body. */
export function GiftPortalNotFound() {
  const portal = useContext(GiftPortalFallbackContext);

  if (!portal) {
    return (
      <FallbackPanel
        eyebrow="Gift portal"
        title="We cannot find that page"
        description={
          <p>
            The link may have expired, or the gift catalogue may have been closed by the company
            that set it up. If someone sent you this link, ask them for a current one.
          </p>
        }
        actions={
          <Link href="/" className={buttonVariants()}>
            Go to Parcelith
          </Link>
        }
      />
    );
  }

  const { slug, t } = portal;
  return (
    <FallbackPanel
      eyebrow={t.eyebrow}
      title={t.notFoundTitle}
      description={<p>{t.notFoundBoundaryBody}</p>}
      actions={
        <Link href={`/g/${slug}`} className={buttonVariants()}>
          {t.backToCatalogue}
        </Link>
      }
    />
  );
}

/** The portal error page. `retry` re-renders the failed segment without a full reload. */
export function GiftPortalError({ digest, retry }: { digest?: string; retry: () => void }) {
  const portal = useContext(GiftPortalFallbackContext);

  if (!portal) {
    return (
      <FallbackPanel
        eyebrow="Gift portal"
        title="Something went wrong at our end"
        description={
          <p>
            This page could not be loaded. Nothing you have submitted has been lost — try again, and
            if it keeps happening come back in a few minutes.
          </p>
        }
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

  const { slug, t } = portal;
  return (
    <FallbackPanel
      eyebrow={t.eyebrow}
      title={t.errorTitle}
      description={<p>{t.errorBody}</p>}
      actions={
        <>
          <Button type="button" onClick={retry}>
            {t.errorRetry}
          </Button>
          <Link href={`/g/${slug}`} className={buttonVariants({ variant: "outline" })}>
            {t.backToCatalogue}
          </Link>
        </>
      }
      note={digest ? fmt(t.errorReference, { digest }) : null}
    />
  );
}
