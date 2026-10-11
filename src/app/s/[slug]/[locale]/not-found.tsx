"use client";

import { StorefrontNotFound } from "@/components/StorefrontFallback";

/**
 * The storefront's not-found boundary.
 *
 * Storefront routes render their own not-found body instead of raising
 * `notFound()`, because a boundary is a React error boundary and error
 * boundaries do not recover during server rendering: the response would be a
 * document with an empty `<body>`. This stays as the backstop for anything that
 * still raises one, and reads the store from the layout's context.
 */
export default function StorefrontNotFoundPage() {
  return <StorefrontNotFound />;
}
