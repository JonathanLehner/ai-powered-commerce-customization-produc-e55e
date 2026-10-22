import { canvasColours, initialCanvasColour } from "./canvas-colour";
import type { CatalogProduct, StoreProduct } from "./types";

/**
 * The picture a catalog card opens with: the first approved mockup, front view
 * first. Until one is approved, the supplier's blank photo of the base product
 * in the colour the product sells, so a tee still reads as a tee; `pending`
 * marks that stand-in. Null when there is neither.
 */
export function catalogCover(
  product: Pick<StoreProduct, "name" | "description" | "mockups" | "variants">,
  catalog: Pick<CatalogProduct, "mockups" | "variants"> | null | undefined,
): { url: string; colour: string; pending: boolean } | null {
  const approved = product.mockups.filter((m) => m.approved);
  const mockup = approved.find((m) => m.view === "front") ?? approved[0];
  if (mockup) return { url: mockup.url, colour: mockup.colour, pending: false };

  if (!catalog || catalog.mockups.length === 0) return null;
  const colour = initialCanvasColour(product, canvasColours(product, catalog));
  const base =
    catalog.mockups.find((m) => m.view === "front" && m.colour === colour) ??
    catalog.mockups.find((m) => m.colour === colour) ??
    catalog.mockups.find((m) => m.view === "front") ??
    catalog.mockups[0];
  return { url: base.url, colour: base.colour, pending: true };
}
