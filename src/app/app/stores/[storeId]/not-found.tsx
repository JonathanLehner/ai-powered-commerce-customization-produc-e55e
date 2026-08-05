"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { storeBasePath } from "@/lib/util";

/**
 * A product, order or campaign that no longer exists inside a store. The store
 * layout above keeps the app header and the store's own navigation, so this is
 * only the body — plus the way back into the store the visitor was already in.
 */
export default function StoreWorkspaceNotFound() {
  const base = storeBasePath(usePathname());

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
