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
      title="Something went wrong"
      description={
        <p>
          This page could not be loaded. Please try again.
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
