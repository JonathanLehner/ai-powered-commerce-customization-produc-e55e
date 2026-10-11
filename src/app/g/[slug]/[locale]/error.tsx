"use client";

import { GiftPortalError } from "@/components/GiftPortalFallback";

/** A failure part-way through a gifting flow keeps the portal chrome and offers a retry. */
export default function GiftPortalErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <GiftPortalError digest={error.digest} retry={unstable_retry} />;
}
