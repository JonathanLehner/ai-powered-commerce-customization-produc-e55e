/**
 * The store's shipping time, kept on the page tree's root node beside the
 * announcement bar. The announcement bar and every product page read it from
 * here, so the storefront makes one promise about when an order ships.
 */
export const SHIP_DAYS_PROP = "shipDays";

export const MAX_SHIP_DAYS = 60;

/** The business days an order ships within, or null when the store has not set one. */
export function shipDays(tree: unknown): number | null {
  if (!tree || typeof tree !== "object") return null;
  const root = (tree as Record<string, { props?: Record<string, unknown> }>).ROOT;
  const value = Number(root?.props?.[SHIP_DAYS_PROP]);
  return Number.isInteger(value) && value >= 1 && value <= MAX_SHIP_DAYS ? value : null;
}
