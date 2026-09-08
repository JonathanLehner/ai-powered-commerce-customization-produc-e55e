import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { THEMES, type Store } from "@/lib/types";

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

/** The way back for a mistyped or retired shopper URL, in the store's own language. */
export function StorefrontNotFoundView({ store }: { store: Store }) {
  const { t } = storefrontLocale(store);
  const accent = THEMES[store.theme].accent;

  return (
    <FallbackPanel
      eyebrow={store.name}
      title={t.fallback.notFoundTitle}
      description={<p>{fmt(t.fallback.notFoundBody, { store: store.name })}</p>}
      actions={
        <>
          <Link
            href={`/s/${store.slug}/products`}
            className="btn text-white"
            style={{ background: accent }}
          >
            {t.fallback.browseProducts}
          </Link>
          <Link href={`/s/${store.slug}/cart`} className="btn-secondary">
            {t.basket.title}
          </Link>
          <Link href={`/s/${store.slug}/orders`} className="btn-secondary">
            {t.chrome.orderStatus}
          </Link>
        </>
      }
    />
  );
}

/**
 * An address whose slug belongs to no store. There is no shop language to
 * translate into and no shop to link to, so this stays English and points back
 * at Parcelith.
 */
export function UnknownStoreView({ slug }: { slug: string }) {
  return (
    <FallbackPanel
      eyebrow="Parcelith"
      title="This shop is not available at this address"
      description={
        <>
          <p>
            We do not recognise the shop address{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              /s/{slug}
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

/**
 * A mistyped address inside a gift portal that does resolve. The portal is a
 * buyer-and-approver workflow rather than shopper-facing retail, so — like the
 * rest of the portal — it stays in English.
 */
export function GiftPortalNotFoundView({
  catalogue,
}: {
  catalogue: { slug: string; name: string };
}) {
  return (
    <FallbackPanel
      eyebrow={catalogue.name}
      title="We cannot find that page"
      description={
        <p>
          The address may be mistyped, or the campaign or product it pointed at may have been closed
          since the link was sent. The catalogue itself is still open.
        </p>
      }
      actions={
        <Link href={`/g/${catalogue.slug}`} className="btn-primary">
          Back to the catalogue
        </Link>
      }
    />
  );
}

/** A portal link that has expired, or a slug that belongs to no gift catalogue. */
export function UnknownGiftPortalView({ slug }: { slug: string }) {
  return (
    <FallbackPanel
      eyebrow="Gift portal"
      title="This gift portal is not available at this address"
      description={
        <>
          <p>
            We do not recognise the portal address{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">
              /g/{slug}
            </code>
            . The link may have expired, or the gift catalogue may have been closed by the company
            that set it up.
          </p>
          <p className="mt-3">If someone sent you this link, ask them for a current one.</p>
        </>
      }
      actions={
        <Link href="/" className="btn-primary">
          Go to Parcelith
        </Link>
      }
    />
  );
}

/** A workspace address that does not exist. The header is rendered by the route above this. */
export function WorkspaceNotFoundView() {
  return (
    <FallbackPanel
      eyebrow="404"
      title="We cannot find that page"
      description={
        <p>
          The address may be mistyped, or the store, product or order it pointed at may have been
          removed. Everything you have access to is on the dashboard.
        </p>
      }
      actions={
        <>
          <Link href="/app" className="btn-primary">
            Go to the dashboard
          </Link>
          <Link href="/app/stores/new" className="btn-secondary">
            Create a client store
          </Link>
        </>
      }
    />
  );
}

/** A record that no longer exists inside a store's workspace. `base` is that store's overview. */
export function StoreWorkspaceNotFoundView({ base }: { base: string }) {
  return (
    <FallbackPanel
      eyebrow="404"
      title="We cannot find that page"
      description={
        <p>
          The record may have been deleted, or the address may be mistyped. The store overview lists
          everything that is still there.
        </p>
      }
      actions={
        <>
          <Link href={base} className="btn-primary">
            Back to the store
          </Link>
          <Link href="/app" className="btn-secondary">
            Go to the dashboard
          </Link>
        </>
      }
    />
  );
}

/** A platform administration address that does not exist. The admin layout keeps its header and nav. */
export function AdminNotFoundView() {
  return (
    <FallbackPanel
      eyebrow="404"
      title="We cannot find that page"
      description={
        <p>
          The address may be mistyped, or the supplier, catalog item or agency it pointed at may
          have been removed.
        </p>
      }
      actions={
        <>
          <Link href="/admin" className="btn-primary">
            Platform overview
          </Link>
          <Link href="/app" className="btn-secondary">
            Agency workspace
          </Link>
        </>
      }
    />
  );
}

/** The metadata every route that can render one of these views merges in. */
export const notFoundRobots = { robots: { index: false, follow: false } } as const;
