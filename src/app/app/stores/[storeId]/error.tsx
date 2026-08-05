"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { storeBasePath } from "@/lib/util";

/** A failure part-way through working on a store, with the store chrome kept. */
export default function StoreWorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const base = storeBasePath(usePathname());

  return (
    <FallbackPanel
      eyebrow="Error"
      title="Something went wrong at our end"
      description={
        <p>
          This page could not be loaded. Nothing you had already saved is affected — try again, and
          if it keeps happening come back in a few minutes.
        </p>
      }
      actions={
        <>
          <button type="button" onClick={unstable_retry} className="btn-primary">
            Try again
          </button>
          <Link href={base} className="btn-secondary">
            Back to the store
          </Link>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
