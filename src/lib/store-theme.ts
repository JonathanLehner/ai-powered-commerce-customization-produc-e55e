/**
 * A store theme, expressed as the design tokens in `globals.css`.
 *
 * The Tailwind theme is declared `inline`, so `bg-primary`, `text-ink`,
 * `border-line`, `.btn-primary` and every shadcn primitive compile to
 * `var(--token)`. Writing these properties onto one wrapper element therefore
 * re-tints an entire storefront — header, sections, product grid, basket,
 * checkout — to the client's brand without a single per-component override.
 */
import type { CSSProperties } from "react";
import { THEMES, type ThemeKey } from "./types";

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `amount` of 0 keeps `from`, 1 returns `to`. */
function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** Perceived brightness, 0–1, used to decide whether text on a fill is white. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const WHITE = "#ffffff";

/** Legible text on a solid fill of `hex`. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.62 ? "#15202e" : WHITE;
}

/**
 * The CSS custom properties for a store theme.
 *
 * The accent becomes the 500 step of the brand ramp and the rest of the ramp is
 * mixed from it, so a tint such as `bg-brand-50` stays a tint of the client's
 * colour rather than of Parcelith's teal.
 */
export function storeThemeVars(key: ThemeKey): CSSProperties {
  const theme = THEMES[key];
  const accent = theme.accent;
  const ink = theme.ink;
  const deep = mix(accent, "#000000", 0.45);

  return {
    "--brand-50": mix(accent, WHITE, 0.94),
    "--brand-100": mix(accent, WHITE, 0.86),
    "--brand-200": mix(accent, WHITE, 0.72),
    "--brand-300": mix(accent, WHITE, 0.52),
    "--brand-400": mix(accent, WHITE, 0.26),
    "--brand-500": accent,
    "--brand-600": mix(accent, "#000000", 0.14),
    "--brand-700": mix(accent, "#000000", 0.3),
    "--brand-800": deep,
    "--brand-900": mix(accent, "#000000", 0.58),

    "--ink": ink,
    "--inksoft": mix(ink, WHITE, 0.3),
    "--muted-fg": mix(ink, WHITE, 0.52),
    "--line": mix(ink, WHITE, 0.88),
    "--canvas": theme.surface,

    "--primary": mix(accent, "#000000", 0.08),
    "--primary-foreground": readableOn(accent),
    "--secondary": theme.surface,
    "--secondary-foreground": ink,
    "--accent": mix(accent, WHITE, 0.92),
    "--accent-foreground": mix(accent, "#000000", 0.34),
    "--ring": accent,
    "--radius": theme.radius,

    "--font-body": `var(${theme.fontVar}), ui-sans-serif, system-ui, sans-serif`,
    "--font-display": `var(${theme.displayFontVar}), ${theme.displayFallback}`,
  } as CSSProperties;
}
