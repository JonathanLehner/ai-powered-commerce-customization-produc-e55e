"use client";

import VARIANTS from "../../scripts/image-variants.json";

/**
 * Resolves a `next/image` request to a prebuilt WebP variant.
 *
 * The deployment target has no runtime image processing, so the built-in
 * optimizer would hand every visitor the full-size original. Variants are
 * produced once by `scripts/generate-variants.mjs`; anything without one —
 * mockups rendered from a shopper's own artwork, for instance — falls back to
 * the source URL.
 */
const table = VARIANTS as Record<string, Record<string, string>>;

export default function platformImageLoader({ src, width }: { src: string; width: number }): string {
  const sizes = table[src];
  if (!sizes) return src;
  const available = Object.keys(sizes)
    .map(Number)
    .sort((a, b) => a - b);
  const match = available.find((candidate) => candidate >= width) ?? available.at(-1);
  return match === undefined ? src : sizes[String(match)];
}
