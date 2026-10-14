/**
 * A store's design tokens: brand colours, type, corners, buttons, density,
 * light or dark, and how product photos are cropped.
 *
 * The four presets in `THEMES` are starting points; a store keeps its preset
 * key and stores only what it changed on top of it, so a store saved before
 * tokens existed looks exactly as it did. Everything here is plain data and
 * arithmetic, so the storefront, the editor canvas, the API and the check
 * scripts all resolve a store's look the same way.
 */
import { THEMES, type ThemeKey } from "./types";

/* ------------------------------------------------------------------ fonts */

export type FontCategory = "sans" | "serif" | "display" | "mono";

export interface FontDef {
  name: string;
  category: FontCategory;
  /** The CSS variable `src/lib/store-fonts.ts` sets on the document, or null for a system stack. */
  variable: string | null;
  fallback: string;
}

const SANS = "ui-sans-serif, system-ui, sans-serif";
const SERIF = "ui-serif, Georgia, serif";

/**
 * The curated set. Web fonts are self-hosted by next/font and only downloaded
 * by a shopper's browser when the store uses them; the system stacks cost
 * nothing at all and are what the four presets started with.
 */
export const FONTS = {
  geist: { name: "Geist", category: "sans", variable: "--font-geist-sans", fallback: SANS },
  system: { name: "Helvetica", category: "sans", variable: null, fallback: `"Helvetica Neue", Helvetica, Arial, ${SANS}` },
  rounded: { name: "Avenir", category: "sans", variable: null, fallback: `"Avenir Next", Avenir, "Trebuchet MS", ui-rounded, ${SANS}` },
  oldstyle: { name: "Iowan Old Style", category: "serif", variable: null, fallback: `"Iowan Old Style", "Palatino Linotype", ${SERIF}` },
  inter: { name: "Inter", category: "sans", variable: "--font-sf-inter", fallback: SANS },
  "dm-sans": { name: "DM Sans", category: "sans", variable: "--font-sf-dm-sans", fallback: SANS },
  manrope: { name: "Manrope", category: "sans", variable: "--font-sf-manrope", fallback: SANS },
  "work-sans": { name: "Work Sans", category: "sans", variable: "--font-sf-work-sans", fallback: SANS },
  "plus-jakarta": { name: "Plus Jakarta Sans", category: "sans", variable: "--font-sf-plus-jakarta", fallback: SANS },
  outfit: { name: "Outfit", category: "sans", variable: "--font-sf-outfit", fallback: SANS },
  "space-grotesk": { name: "Space Grotesk", category: "sans", variable: "--font-sf-space-grotesk", fallback: SANS },
  archivo: { name: "Archivo", category: "sans", variable: "--font-sf-archivo", fallback: SANS },
  sora: { name: "Sora", category: "sans", variable: "--font-sf-sora", fallback: SANS },
  nunito: { name: "Nunito", category: "sans", variable: "--font-sf-nunito", fallback: SANS },
  bricolage: { name: "Bricolage Grotesque", category: "sans", variable: "--font-sf-bricolage", fallback: SANS },
  "bebas-neue": { name: "Bebas Neue", category: "display", variable: "--font-sf-bebas-neue", fallback: `Impact, ${SANS}` },
  anton: { name: "Anton", category: "display", variable: "--font-sf-anton", fallback: `Impact, ${SANS}` },
  oswald: { name: "Oswald", category: "display", variable: "--font-sf-oswald", fallback: `"Arial Narrow", ${SANS}` },
  syne: { name: "Syne", category: "display", variable: "--font-sf-syne", fallback: SANS },
  fraunces: { name: "Fraunces", category: "serif", variable: "--font-sf-fraunces", fallback: SERIF },
  playfair: { name: "Playfair Display", category: "serif", variable: "--font-sf-playfair", fallback: SERIF },
  "dm-serif": { name: "DM Serif Display", category: "serif", variable: "--font-sf-dm-serif", fallback: SERIF },
  cormorant: { name: "Cormorant Garamond", category: "serif", variable: "--font-sf-cormorant", fallback: SERIF },
  lora: { name: "Lora", category: "serif", variable: "--font-sf-lora", fallback: SERIF },
  "instrument-serif": { name: "Instrument Serif", category: "serif", variable: "--font-sf-instrument-serif", fallback: SERIF },
  "space-mono": { name: "Space Mono", category: "mono", variable: "--font-sf-space-mono", fallback: "ui-monospace, monospace" },
} as const satisfies Record<string, FontDef>;

export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

/** Display faces read badly in paragraphs, so they are offered for headings only. */
export const BODY_FONT_KEYS = FONT_KEYS.filter((key) => FONTS[key].category !== "display");

export function fontStack(key: FontKey): string {
  const font: FontDef = FONTS[key];
  return font.variable ? `var(${font.variable}), ${font.fallback}` : font.fallback;
}

/** Heading and body pairs that are known to work, offered as one click in the editor. */
export const FONT_PAIRINGS: { key: string; heading: FontKey; body: FontKey }[] = [
  { key: "editorial", heading: "fraunces", body: "inter" },
  { key: "streetwear", heading: "bebas-neue", body: "dm-sans" },
  { key: "fanclub", heading: "anton", body: "work-sans" },
  { key: "studio", heading: "space-grotesk", body: "inter" },
  { key: "boutique", heading: "playfair", body: "manrope" },
  { key: "roastery", heading: "oswald", body: "archivo" },
  { key: "gallery", heading: "instrument-serif", body: "plus-jakarta" },
  { key: "playful", heading: "bricolage", body: "nunito" },
  { key: "classic", heading: "cormorant", body: "lora" },
  { key: "tech", heading: "syne", body: "space-mono" },
];

/* --------------------------------------------------------------- settings */

export const RADII = ["none", "small", "medium", "large"] as const;
export const BUTTON_STYLES = ["solid", "outline", "pill"] as const;
export const DENSITIES = ["compact", "comfortable", "airy"] as const;
export const MODES = ["light", "dark"] as const;
export const PRODUCT_IMAGES = ["square", "portrait", "landscape"] as const;
export const COLOUR_KEYS = ["primary", "secondary", "background", "surface", "text"] as const;

export type Radius = (typeof RADII)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type Density = (typeof DENSITIES)[number];
export type Mode = (typeof MODES)[number];
export type ProductImage = (typeof PRODUCT_IMAGES)[number];
export type ColourKey = (typeof COLOUR_KEYS)[number];
export type DesignColours = Record<ColourKey, string>;

/** What a store changed on top of its preset. Every key is optional. */
export interface StoreDesign {
  colors?: Partial<DesignColours>;
  headingFont?: FontKey;
  bodyFont?: FontKey;
  radius?: Radius;
  buttonStyle?: ButtonStyle;
  density?: Density;
  mode?: Mode;
  productImage?: ProductImage;
}

export interface ResolvedDesign {
  preset: ThemeKey;
  colors: DesignColours;
  headingFont: FontKey;
  bodyFont: FontKey;
  radius: Radius;
  buttonStyle: ButtonStyle;
  density: Density;
  mode: Mode;
  productImage: ProductImage;
}

/** Each preset as a full set of tokens, matching how the storefront looked before tokens. */
export const PRESET_DESIGNS: Record<ThemeKey, Omit<ResolvedDesign, "preset">> = {
  atelier: {
    colors: { primary: THEMES.atelier.accent, secondary: "#e7f3f1", background: "#ffffff", surface: THEMES.atelier.surface, text: THEMES.atelier.ink },
    headingFont: "oldstyle",
    bodyFont: "oldstyle",
    radius: "medium",
    buttonStyle: "solid",
    density: "airy",
    mode: "light",
    productImage: "portrait",
  },
  meridian: {
    colors: { primary: THEMES.meridian.accent, secondary: "#fde68a", background: "#ffffff", surface: THEMES.meridian.surface, text: THEMES.meridian.ink },
    headingFont: "geist",
    bodyFont: "geist",
    radius: "medium",
    buttonStyle: "solid",
    density: "comfortable",
    mode: "light",
    productImage: "portrait",
  },
  graphite: {
    colors: { primary: THEMES.graphite.accent, secondary: "#e2e8f0", background: "#ffffff", surface: THEMES.graphite.surface, text: THEMES.graphite.ink },
    headingFont: "system",
    bodyFont: "system",
    radius: "small",
    buttonStyle: "solid",
    density: "comfortable",
    mode: "light",
    productImage: "portrait",
  },
  bloom: {
    colors: { primary: THEMES.bloom.accent, secondary: "#fde4ec", background: "#ffffff", surface: THEMES.bloom.surface, text: THEMES.bloom.ink },
    headingFont: "rounded",
    bodyFont: "rounded",
    radius: "large",
    buttonStyle: "pill",
    density: "comfortable",
    mode: "light",
    productImage: "portrait",
  },
};

/** The neutral background, surface and text a dark storefront starts from when the store has not picked its own. */
const DARK_NEUTRALS = { background: "#101113", surface: "#1b1c20", text: "#f4f4f5" };

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A store's full set of tokens: its preset with what it changed on top. */
export function resolveDesign(store: { theme: ThemeKey; design?: StoreDesign | null }): ResolvedDesign {
  const preset = store.theme in PRESET_DESIGNS ? store.theme : "atelier";
  const base = PRESET_DESIGNS[preset];
  const own = store.design ?? {};
  const mode = pick(own.mode, MODES, base.mode);
  // A dark storefront swaps the preset's light neutrals for dark ones, unless
  // the store chose its own.
  const neutrals = mode === "dark" && base.mode === "light" ? DARK_NEUTRALS : {};
  const colors = { ...base.colors, ...neutrals } as DesignColours;
  for (const key of COLOUR_KEYS) {
    const value = own.colors?.[key];
    if (isHexColour(value)) colors[key] = value.toLowerCase();
  }
  return {
    preset,
    colors,
    headingFont: pick(own.headingFont, FONT_KEYS, base.headingFont),
    bodyFont: pick(own.bodyFont, BODY_FONT_KEYS, base.bodyFont),
    radius: pick(own.radius, RADII, base.radius),
    buttonStyle: pick(own.buttonStyle, BUTTON_STYLES, base.buttonStyle),
    density: pick(own.density, DENSITIES, base.density),
    mode,
    productImage: pick(own.productImage, PRODUCT_IMAGES, base.productImage),
  };
}

/**
 * Keeps only valid keys, and only what differs from the preset, so a store
 * that changes its preset later is not pinned to the old preset's values.
 */
export function cleanDesign(theme: ThemeKey, input: StoreDesign): StoreDesign {
  const base = resolveDesign({ theme, design: { mode: input.mode } });
  const preset = PRESET_DESIGNS[theme];
  const out: StoreDesign = {};
  const colors: Partial<DesignColours> = {};
  for (const key of COLOUR_KEYS) {
    const value = input.colors?.[key];
    if (isHexColour(value) && value.toLowerCase() !== base.colors[key]) colors[key] = value.toLowerCase();
  }
  if (Object.keys(colors).length > 0) out.colors = colors;
  if (input.headingFont && FONT_KEYS.includes(input.headingFont) && input.headingFont !== preset.headingFont) out.headingFont = input.headingFont;
  if (input.bodyFont && BODY_FONT_KEYS.includes(input.bodyFont) && input.bodyFont !== preset.bodyFont) out.bodyFont = input.bodyFont;
  if (input.radius && RADII.includes(input.radius) && input.radius !== preset.radius) out.radius = input.radius;
  if (input.buttonStyle && BUTTON_STYLES.includes(input.buttonStyle) && input.buttonStyle !== preset.buttonStyle) out.buttonStyle = input.buttonStyle;
  if (input.density && DENSITIES.includes(input.density) && input.density !== preset.density) out.density = input.density;
  if (input.mode && MODES.includes(input.mode) && input.mode !== preset.mode) out.mode = input.mode;
  if (input.productImage && PRODUCT_IMAGES.includes(input.productImage) && input.productImage !== preset.productImage) {
    out.productImage = input.productImage;
  }
  return out;
}

/* --------------------------------------------------------------- contrast */

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear blend of two colours: 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, amount: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as Rgb);
}

function luminance(colour: string): number {
  const [r, g, b] = rgb(colour).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const INK = "#0b0b0c";
const PAPER = "#ffffff";

/** White or near-black, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(PAPER, background) >= contrastRatio(INK, background) ? PAPER : INK;
}

/**
 * `colour`, moved towards black or white just far enough to reach `ratio`
 * against every one of `backgrounds`. A colour that already passes is kept.
 */
export function ensureContrast(colour: string, backgrounds: string[], ratio = 4.5): string {
  const passes = (c: string) => backgrounds.every((bg) => contrastRatio(c, bg) >= ratio);
  if (passes(colour)) return colour;
  const target = readableOn(backgrounds[0]);
  for (let step = 1; step <= 20; step += 1) {
    const next = mix(colour, target, step / 20);
    if (passes(next)) return next;
  }
  return target;
}

/** How each pair a shopper reads holds up, for the editor's and the API's warnings. */
export function contrastReport(design: ResolvedDesign) {
  const { colors } = design;
  const text = ensureContrast(colors.text, [colors.background, colors.surface], 4.5);
  return {
    text: { ratio: round(contrastRatio(colors.text, colors.background)), adjusted: text !== colors.text },
    primary: {
      ratio: round(contrastRatio(colors.primary, colors.background)),
      adjusted: ensureContrast(colors.primary, [colors.background], 4.5) !== colors.primary,
    },
    surface: { ratio: round(contrastRatio(colors.text, colors.surface)), adjusted: text !== colors.text },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------ CSS output */

const RADIUS_VALUES: Record<Radius, string> = { none: "0rem", small: "0.25rem", medium: "0.5rem", large: "0.875rem" };
const SECTION_SPACE: Record<Density, string> = {
  compact: "clamp(2rem, 4vw, 3rem)",
  comfortable: "clamp(3rem, 6vw, 4.5rem)",
  airy: "clamp(4rem, 8vw, 6.5rem)",
};
const IMAGE_RATIOS: Record<ProductImage, string> = { square: "1 / 1", portrait: "4 / 5", landscape: "4 / 3" };

/** The ratio product photos are cropped to, as CSS `aspect-ratio`. */
export function productImageRatio(design: ResolvedDesign): string {
  return IMAGE_RATIOS[design.productImage];
}

/**
 * The tokens as the CSS variables the storefront is written against: the
 * shadcn ones every component reads, plus a few storefront ones (`--sf-*`).
 * Text colours are checked against the colours they sit on and nudged until
 * they reach 4.5:1, so a store cannot pick its way into unreadable copy.
 */
export function designVariables(design: ResolvedDesign): Record<string, string> {
  const { background, surface, text, primary, secondary } = design.colors;
  const ink = ensureContrast(text, [background, surface], 4.5);
  const soft = ensureContrast(mix(ink, background, 0.22), [background, surface], 4.5);
  const quiet = ensureContrast(mix(ink, background, 0.4), [background, surface], 4.5);
  const primaryText = ensureContrast(primary, [background], 4.5);
  const dark = design.mode === "dark";
  const lighter = (pct: number) => `color-mix(in oklab, ${primary} ${pct}%, ${dark ? background : "white"})`;
  const darker = (pct: number) => `color-mix(in oklab, ${primary} ${pct}%, ${dark ? "white" : "black"})`;

  return {
    colorScheme: design.mode,
    "--font-sans": fontStack(design.bodyFont),
    "--font-heading-face": fontStack(design.headingFont),
    "--radius": RADIUS_VALUES[design.radius],

    "--background": background,
    "--card": background,
    "--popover": background,
    "--foreground": ink,
    "--card-foreground": ink,
    "--popover-foreground": ink,
    "--foreground-soft": soft,

    "--primary": primary,
    "--primary-foreground": readableOn(primary),
    "--ring": primaryText,

    "--secondary": secondary,
    "--secondary-foreground": readableOn(secondary),
    "--muted": surface,
    "--muted-foreground": quiet,
    "--accent": surface,
    "--accent-foreground": ink,

    // A hairline tinted by the text colour rather than a neutral grey: it is the
    // quietest place a theme can show up, and it shows up everywhere.
    "--border": mix(ink, background, 0.86),
    "--input": mix(ink, background, 0.8),

    "--color-brand-50": lighter(6),
    "--color-brand-100": lighter(13),
    "--color-brand-200": lighter(25),
    "--color-brand-300": lighter(44),
    "--color-brand-400": lighter(68),
    "--color-brand-500": lighter(88),
    "--color-brand-600": primary,
    "--color-brand-700": darker(86),
    "--color-brand-800": darker(70),
    "--color-brand-900": darker(56),

    "--sf-primary-text": primaryText,
    "--sf-surface-foreground": ensureContrast(ink, [surface], 4.5),
    "--sf-section-y": SECTION_SPACE[design.density],
    "--sf-product-ratio": IMAGE_RATIOS[design.productImage],
  };
}
