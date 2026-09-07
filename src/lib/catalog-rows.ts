/**
 * Reading the print-area and variant tables of the shared catalog editor.
 *
 * Both tables are edited as rows in the browser and posted as JSON, because how
 * many rows there are is decided there. The rules for turning that payload into
 * records live here, away from the action, so they can be checked on their own:
 * `npm run catalog-rows-check`.
 */
import type { CatalogVariant, FileRequirements, MockupView, PrintArea } from "./types";
import { newId, parseMoney } from "./util";

/** What a parser returns: the rows it accepted, or the message the person sees. */
export type RowResult<T> = T | { error: string };

const VIEWS: MockupView[] = ["front", "back", "left", "right"];
const STOCK: CatalogVariant["availability"][] = ["in_stock", "low_stock", "out_of_stock"];

/** Where a newly added print area sits on the supplier photography until it is measured. */
const DEFAULT_RECT = { x: 0.32, y: 0.3, w: 0.36, h: 0.36 };

export const FILE_REQUIREMENTS: Record<"apparel" | "drinkware", FileRequirements> = {
  apparel: {
    formats: ["PNG", "SVG", "PDF"],
    maxFileMb: 25,
    minDpi: 150,
    transparentBackgroundRequired: true,
    maxPixels: 40_000_000,
  },
  drinkware: {
    formats: ["PNG", "JPG", "PDF"],
    maxFileMb: 15,
    minDpi: 300,
    transparentBackgroundRequired: false,
    maxPixels: 25_000_000,
  },
};

/**
 * The print-area and variant tables are edited as rows in the browser and posted
 * as JSON, because how many there are is not known in advance. Nothing in the
 * payload is trusted: an id is only honoured when it names a row this product
 * already has, so a removed row cannot be resurrected and a forged one cannot
 * reach a record belonging to another product.
 */
export function postedRows<T>(raw: FormDataEntryValue | null): T[] | null {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? ""));
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function measurement(value: unknown, min: number, max: number): number | null {
  const parsed = Number(text(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Math.round(parsed);
}

export function parsePrintAreas(
  raw: FormDataEntryValue | null,
  existing: PrintArea[],
): RowResult<{ areas: PrintArea[] }> {
  const posted = postedRows<Record<string, unknown>>(raw);
  if (!posted) return { error: "The print areas could not be read. Reload the page and try again." };
  if (posted.length === 0) return { error: "Add at least one print area — artwork has nowhere to go without one." };
  if (posted.length > 8) return { error: "A product carries at most eight print areas." };

  const areas: PrintArea[] = [];
  const used = new Set<string>();
  for (const row of posted) {
    const name = text(row.name);
    if (name.length < 2) return { error: "Give every print area a name, such as “Front chest”." };
    const view = VIEWS.find((v) => v === text(row.view));
    if (!view) return { error: `Choose which view “${name}” is printed on.` };
    const widthMm = measurement(row.widthMm, 10, 2000);
    const heightMm = measurement(row.heightMm, 10, 2000);
    if (widthMm === null || heightMm === null) {
      return { error: `“${name}” needs a width and a height between 10 and 2000 mm.` };
    }
    const minDpi = measurement(row.minDpi, 72, 1200);
    if (minDpi === null) return { error: `“${name}” needs a minimum DPI between 72 and 1200.` };

    const kept = existing.find((area) => area.id === text(row.id) && !used.has(area.id));
    if (kept) used.add(kept.id);
    areas.push({
      id: kept?.id ?? newId("pa"),
      name,
      view,
      widthMm,
      heightMm,
      minDpi,
      // An existing area keeps the placement it was measured against; a new one
      // starts centred and is refined against the supplier photography.
      rect: kept?.rect ?? DEFAULT_RECT,
    });
  }
  return { areas };
}

export function parseVariants(
  raw: FormDataEntryValue | null,
  existing: CatalogVariant[],
  currency: string,
): RowResult<{ variants: CatalogVariant[] }> {
  const posted = postedRows<Record<string, unknown>>(raw);
  if (!posted) return { error: "The variants could not be read. Reload the page and try again." };
  if (posted.length === 0) return { error: "Add at least one variant — a product with none cannot be ordered." };
  if (posted.length > 200) return { error: "A product carries at most 200 variants." };

  const variants: CatalogVariant[] = [];
  const skus = new Set<string>();
  const used = new Set<string>();
  for (const row of posted) {
    const sku = text(row.sku).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(sku)) {
      return { error: "Every variant needs a SKU of 2–40 letters, numbers, dots, dashes or underscores." };
    }
    if (skus.has(sku)) return { error: `SKU ${sku} is used by more than one variant.` };
    skus.add(sku);

    const colour = text(row.colour);
    const size = text(row.size);
    if (!colour && !size) return { error: `Give variant ${sku} at least one option value — a colour or a size.` };
    const hex = text(row.colourHex);
    const baseCost = parseMoney(text(row.baseCost), currency);
    if (baseCost === null || baseCost <= 0) return { error: `Enter the supplier's base cost for variant ${sku}.` };
    const availability = STOCK.find((s) => s === text(row.availability)) ?? "in_stock";

    const kept = existing.find((variant) => variant.id === text(row.id) && !used.has(variant.id));
    if (kept) used.add(kept.id);
    variants.push({
      id: kept?.id ?? newId("var"),
      name: [colour, size].filter(Boolean).join(" / "),
      colour,
      colourHex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : (kept?.colourHex ?? "#ffffff"),
      size,
      sku,
      baseCost,
      availability,
    });
  }
  return { variants };
}
