import { canvasColours, initialCanvasColour } from "./canvas-colour";
import type { CatalogProduct, StoreProduct } from "./types";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The picture on a product's Catalog card: its first approved mockup, else the
 * supplier's blank photo in the product's colour (front view first), marked
 * pending. A product with neither shows any mockup it has, still pending.
 */
export function catalogCover(
  product: Pick<StoreProduct, "name" | "description" | "mockups" | "variants">,
  catalog: Pick<CatalogProduct, "mockups" | "variants"> | null | undefined,
): { url: string; pending: boolean } | null {
  const approved = product.mockups.find((m) => m.approved);
  if (approved) return { url: approved.url, pending: false };

  const blanks = catalog?.mockups ?? [];
  if (catalog && blanks.length > 0) {
    const colour = initialCanvasColour(product, canvasColours(product, catalog));
    const front = (m: { view: string }) => m.view === "front";
    const inColour = blanks.filter((m) => same(m.colour, colour));
    const blank = inColour.find(front) ?? inColour[0] ?? blanks.find(front) ?? blanks[0];
    return { url: blank.url, pending: true };
  }

  const draft = product.mockups[0];
  return draft ? { url: draft.url, pending: true } : null;
}
