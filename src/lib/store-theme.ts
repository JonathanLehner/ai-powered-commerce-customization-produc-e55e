import type { CSSProperties } from "react";
import { THEMES, type ThemeKey } from "@/lib/types";

/**
 * A client storefront is the client's brand, not Parcelith's, so the theme a
 * store picked in guided setup is mapped onto the shadcn CSS variables once —
 * on the storefront's and the gift portal's `<html>` — rather than overridden
 * component by component.
 *
 * Everything below `--primary` is derived from the three theme values with
 * `color-mix()`, which keeps a Card's hairline, a muted panel and a Badge in
 * the same family as the accent without a second set of hand-picked hexes. The
 * `--color-brand-*` scale is overridden too: the storefront was written against
 * `brand-*` utilities long before stores were themed, so remapping the scale is
 * what makes those existing usages read as the client's colour.
 */
export function storeThemeStyle(theme: ThemeKey): CSSProperties {
  const { accent, surface, ink, font } = THEMES[theme];
  const lighter = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, white)`;
  const darker = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, black)`;

  return {
    "--font-sans": font,

    "--foreground": ink,
    "--card-foreground": ink,
    "--popover-foreground": ink,
    "--foreground-soft": `color-mix(in oklab, ${ink} 72%, white)`,

    "--primary": accent,
    "--primary-foreground": "#ffffff",
    "--ring": accent,

    "--secondary": surface,
    "--secondary-foreground": ink,
    "--muted": surface,
    "--muted-foreground": `color-mix(in oklab, ${ink} 55%, white)`,
    "--accent": surface,
    "--accent-foreground": ink,

    // A hairline tinted by the brand rather than a neutral grey: it is the
    // quietest place a theme can show up, and it shows up everywhere.
    "--border": `color-mix(in oklab, ${ink} 14%, white)`,
    "--input": `color-mix(in oklab, ${ink} 18%, white)`,

    "--color-brand-50": lighter(6),
    "--color-brand-100": lighter(13),
    "--color-brand-200": lighter(25),
    "--color-brand-300": lighter(44),
    "--color-brand-400": lighter(68),
    "--color-brand-500": lighter(88),
    "--color-brand-600": accent,
    "--color-brand-700": darker(86),
    "--color-brand-800": darker(70),
    "--color-brand-900": darker(56),
  } as CSSProperties;
}
