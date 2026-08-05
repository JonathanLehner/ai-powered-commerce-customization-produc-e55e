"use client";

import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

/** An unexpected failure on the public site. */
export default function MarketingError({
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
          This page could not be loaded. It is not something you did — try again, and if it keeps
          happening come back in a few minutes.
        </p>
      }
      actions={
        <>
          <button type="button" onClick={unstable_retry} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Back to the homepage
          </Link>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
