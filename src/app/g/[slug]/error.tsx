"use client";

import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

/** A failure part-way through a gifting flow keeps the portal chrome and offers a retry. */
export default function GiftPortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
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
          <button type="button" onClick={unstable_retry} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Go to Parcelith
          </Link>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
