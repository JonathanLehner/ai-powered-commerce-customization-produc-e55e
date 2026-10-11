import VARIANTS from "../../scripts/image-variants.json";

const variants = VARIANTS as Record<string, Record<string, string>>;

/** Personalisation text colour on a garment, matching the composited preview. */
export function personalisationTextColour(colourHex: string | undefined): string {
  return colourHex === "#ffffff" ? "#111827" : "#f8fafc";
}

/** The product photo in the line's colour, preferring the print area's view. */
export function variantPhoto(
  product: {
    mockups: { url: string; view: string; colour: string }[];
    variants: { id: string; colour: string }[];
  } | null,
  variantId: string,
  view?: string,
): string | null {
  if (!product) return null;
  const colour = product.variants.find((v) => v.id === variantId)?.colour;
  const inColour = product.mockups.filter((m) => m.colour === colour);
  const gallery = inColour.length > 0 ? inColour : product.mockups;
  return (gallery.find((m) => m.view === view) ?? gallery[0])?.url ?? null;
}

/** The smallest prebuilt variant of a catalogue photo that still fills a thumbnail. */
export function thumbnailSource(url: string): string {
  return variants[url]?.["256"] ?? url;
}
