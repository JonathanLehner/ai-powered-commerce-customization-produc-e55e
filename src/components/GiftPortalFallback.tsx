"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { FallbackPanel } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * What a gift portal's not-found and error boundaries need to know about the
 * catalogue they are standing in.
 *
 * Boundary files are handed no params, so the layout — which has already
 * resolved the catalogue and its store — passes it down through context,
 * exactly as the storefront does. The copy comes from the layout's next-intl
 * provider, in the shopper's language. No provider therefore means
 * the address belongs to no catalogue at all: there is no store language to
 * translate into, so that case stays in English and points back at Parcelith.
 */
export interface GiftPortalFallbackValue {
  /** The portal in the shopper's language: `/g/<slug>` or `/g/<slug>/de`. */
  base: string;
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
        title="Page not found"
        description={
          <p>
            The link may have expired. Ask the sender for a new one.
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

  return <PortalNotFound base={portal.base} />;
}

function PortalNotFound({ base }: GiftPortalFallbackValue) {
  const t = useTranslations("storefront.gift");
  return (
    <FallbackPanel
      eyebrow={t("eyebrow")}
      title={t("notFoundTitle")}
      description={<p>{t("notFoundBoundaryBody")}</p>}
      actions={
        <Link href={base} className={buttonVariants()}>
          {t("backToCatalogue")}
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
        title="Something went wrong"
        description={
          <p>
            This page could not be loaded. Please try again.
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

  return <PortalError base={portal.base} digest={digest} retry={retry} />;
}

function PortalError({
  base,
  digest,
  retry,
}: GiftPortalFallbackValue & { digest?: string; retry: () => void }) {
  const t = useTranslations("storefront.gift");
  return (
    <FallbackPanel
      eyebrow={t("eyebrow")}
      title={t("errorTitle")}
      description={<p>{t("errorBody")}</p>}
      actions={
        <>
          <Button type="button" onClick={retry}>
            {t("errorRetry")}
          </Button>
          <Link href={base} className={buttonVariants({ variant: "outline" })}>
            {t("backToCatalogue")}
          </Link>
        </>
      }
      note={digest ? t("errorReference", { digest }) : null}
    />
  );
}
