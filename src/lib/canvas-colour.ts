import type { CatalogProduct, StoreProduct } from "./types";

/** The colours the product sells, once each, in variant order. */
export function canvasColours(
  product: Pick<StoreProduct, "variants">,
  catalog: Pick<CatalogProduct, "variants">,
) {
  const enabled = product.variants.filter((v) => v.enabled);
  const source = enabled.length > 0 ? enabled : catalog.variants;
  const seen = new Map<string, string>();
  for (const v of source) if (v.colour && !seen.has(v.colour)) seen.set(v.colour, v.colourHex);
  return [...seen].map(([name, hex]) => ({ name, hex }));
}

/**
 * The colour the canvas opens on: the one the current mockups were made in,
 * else one the product's name or description names ("Black tee …"), else the
 * first variant's.
 */
export function initialCanvasColour(
  product: Pick<StoreProduct, "name" | "description" | "mockups">,
  options: { name: string }[],
) {
  const names = options.map((o) => o.name);
  const fromMockups = product.mockups.find((m) => names.includes(m.colour))?.colour;
  if (fromMockups) return fromMockups;
  const text = `${product.name} ${product.description}`.toLowerCase();
  const named = names.find((name) =>
    new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
  );
  return named ?? names[0] ?? "";
}
