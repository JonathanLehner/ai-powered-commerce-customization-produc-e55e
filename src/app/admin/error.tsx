"use client";

import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

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
          <button type="button" onClick={unstable_retry} className="btn-primary">
            Try again
          </button>
          <Link href="/admin" className="btn-secondary">
            Platform overview
          </Link>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
