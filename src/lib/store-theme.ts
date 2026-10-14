import type { CSSProperties } from "react";
import { designVariables, resolveDesign, type ResolvedDesign, type StoreDesign } from "@/lib/store-design";
import type { ThemeKey } from "@/lib/types";

/**
 * A client storefront is the client's brand, not Parcelith's, so the store's
 * design tokens (`src/lib/store-design.ts`) are mapped onto the shadcn CSS
 * variables once, on the storefront's and the gift portal's `<html>` and on the
 * editor canvas, rather than overridden component by component. The
 * `--color-brand-*` scale is overridden too: the storefront was written against
 * `brand-*` utilities long before stores were themed, so remapping the scale is
 * what makes those existing usages read as the client's colour.
 */
export function storeThemeStyle(store: { theme: ThemeKey; design?: StoreDesign | null } | ResolvedDesign): CSSProperties {
  const design = "preset" in store ? store : resolveDesign(store);
  return designVariables(design) as CSSProperties;
}

/** The attributes the button-style and mode rules in `globals.css` key off. */
export function storeThemeAttributes(store: { theme: ThemeKey; design?: StoreDesign | null } | ResolvedDesign) {
  const design = "preset" in store ? store : resolveDesign(store);
  return { "data-buttons": design.buttonStyle, "data-sf-mode": design.mode } as const;
}
