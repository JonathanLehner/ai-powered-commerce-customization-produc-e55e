import VARIANTS from "../../scripts/image-variants.json";

const variants = VARIANTS as Record<string, Record<string, string>>;

/** Personalisation text colour on a garment, matching the composited preview. */
export function personalisationTextColour(colourHex: string | undefined): string {
  return colourHex === "#ffffff" ? "#111827" : "#f8fafc";
}

/**
 * Places on a garment or mug a text field's label might name. Words in one
 * group describe the same place, so "chest" agrees with a "Front" print area.
 */
const LOCATIONS: string[][] = [
  ["front", "chest", "breast"],
  ["back", "nape"],
  ["sleeve", "sleeves", "arm"],
  ["left"],
  ["right"],
  ["pocket"],
  ["hood"],
  ["collar", "neck"],
];

/**
 * The location word in a personalisation label that the print area's name
 * does not cover, e.g. "sleeve" for "Name on the sleeve" printed on "Front
 * chest". Null when the label names no place or the same place as the area.
 */
export function labelLocationConflict(label: string, areaName: string): string | null {
  const words = (value: string) => value.toLowerCase().match(/\p{L}+/gu) ?? [];
  const area = new Set(words(areaName));
  for (const word of words(label)) {
    const group = LOCATIONS.find((g) => g.includes(word));
    if (group && !group.some((w) => area.has(w))) return word;
  }
  return null;
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
