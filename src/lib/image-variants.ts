import VARIANTS from "../../scripts/image-variants.json";

/**
 * The prebuilt WebP widths of the platform's own images (see
 * `scripts/generate-variants.mjs`), as a `srcset`, for the places that draw an
 * `<img>` themselves. Undefined for an image without variants.
 */
const table = VARIANTS as Record<string, Record<string, string>>;

export function srcSetFor(src: string): string | undefined {
  const sizes = table[src];
  if (!sizes) return undefined;
  return Object.entries(sizes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([width, url]) => `${url} ${width}w`)
    .join(", ");
}
