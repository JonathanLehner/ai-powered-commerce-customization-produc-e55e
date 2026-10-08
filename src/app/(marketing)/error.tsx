"use client";

import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";

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
          <Button type="button" onClick={unstable_retry}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to the homepage
          </Link>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : null}
    />
  );
}
