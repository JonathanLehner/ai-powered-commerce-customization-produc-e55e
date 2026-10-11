"use client";

import { StorefrontError } from "@/components/StorefrontFallback";

/** Anything that fails mid-shop: the shopper keeps the store chrome and a retry. */
export default function StorefrontErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <StorefrontError digest={error.digest} retry={unstable_retry} />;
}
