import { useTranslations } from "next-intl";
import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

/**
 * The bodies of every "we cannot find that" page, as server components.
 *
 * They are components rather than `not-found.tsx` boundaries on purpose.
 * `notFound()` is delivered to the browser as a thrown error and caught by
 * React's not-found *error boundary*, and an error boundary does not recover
 * during server rendering: React abandons the surrounding Suspense boundary and
 * asks the client to render it instead. The response is a document with an
 * empty `<body>` — no header, no footer, nothing at all until the JavaScript
 * loads, and nothing ever if it fails.
 *
 * So the pages below render these views directly instead of raising
 * `notFound()`, which puts the finished HTML in the response like every other
 * page, inside the store or portal chrome the layout has already resolved. The
 * routes pair them with `robots: noindex` metadata, which is how Next.js marks
 * a not-found page whose HTTP status cannot be a 404.
 */

/**
 * An address whose slug belongs to no store. There is no shop language to
 * translate into and no shop to link to, so this stays English and points back
 * at Parcelith.
 */
export function UnknownStoreView({ slug }: { slug: string }) {
  return (
    <FallbackPanel
      eyebrow="Parcelith"
      title="Shop not found"
      description={
        <>
          <p>
            No shop exists at{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              /s/{slug}
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

/** A portal link that has expired, or a slug that belongs to no gift catalogue. */
export function UnknownGiftPortalView({ slug }: { slug: string }) {
  return (
    <FallbackPanel
      eyebrow="Gift portal"
      title="Gift portal not found"
      description={
        <>
          <p>
            No gift portal exists at{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              /g/{slug}
            </code>
            . The link may have expired.
          </p>
        </>
      }
      actions={
        <Link href="/" className={buttonVariants()}>
          Go to Parcelith
        </Link>
      }
    />
  );
}

/** A workspace address that does not exist. The header is rendered by the route above this. */
export function WorkspaceNotFoundView() {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  return (
    <FallbackPanel
      eyebrow="404"
      title={t("notFoundTitle")}
      description={<p>{fallback("pageMissing")}</p>}
      actions={
        <>
          <Link href="/app" className={buttonVariants()}>
            {fallback("goToDashboard")}
          </Link>
          <Link href="/app/stores/new" className={buttonVariants({ variant: "outline" })}>
            {fallback("createStore")}
          </Link>
        </>
      }
    />
  );
}

/** A record that no longer exists inside a store's workspace. `base` is that store's overview. */
export function StoreWorkspaceNotFoundView({ base }: { base: string }) {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  return (
    <FallbackPanel
      eyebrow="404"
      title={t("notFoundTitle")}
      description={<p>{fallback("recordMissing")}</p>}
      actions={
        <>
          <Link href={base} className={buttonVariants()}>
            {fallback("backToStore")}
          </Link>
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            {fallback("goToDashboard")}
          </Link>
        </>
      }
    />
  );
}

/** A platform administration address that does not exist. The admin layout keeps its header and nav. */
export function AdminNotFoundView() {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  return (
    <FallbackPanel
      eyebrow="404"
      title={t("notFoundTitle")}
      description={<p>{fallback("pageMissing")}</p>}
      actions={
        <>
          <Link href="/admin" className={buttonVariants()}>
            {fallback("platformOverview")}
          </Link>
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            {fallback("agencyWorkspace")}
          </Link>
        </>
      }
    />
  );
}

/** The metadata every route that can render one of these views merges in. */
export const notFoundRobots = { robots: { index: false, follow: false } } as const;
