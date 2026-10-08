"use client";

import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { Button } from "@/components/ui/button";

/** A failure inside platform administration. */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
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
            <Link href="/admin">Platform overview</Link>
          </Button>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
