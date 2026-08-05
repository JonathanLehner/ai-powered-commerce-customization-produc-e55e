"use client";

import { StorefrontNotFound } from "@/components/StorefrontFallback";

/**
 * Every `notFound()` raised inside a storefront — a product that has been taken
 * off sale, an order code that no longer exists, a mistyped path — lands here,
 * inside the store's own header and footer.
 */
export default function StorefrontNotFoundPage() {
  return <StorefrontNotFound />;
}
