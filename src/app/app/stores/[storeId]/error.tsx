"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { Button } from "@/components/ui/button";
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
          <Button type="button" onClick={unstable_retry}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href={base}>Back to the store</Link>
          </Button>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
