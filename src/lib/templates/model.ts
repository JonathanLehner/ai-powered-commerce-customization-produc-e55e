/**
 * Store templates: a complete starting point for a merch store. A template
 * carries design tokens, header and footer settings, home page sections, a
 * product page, a collection layout, sample copy for a fictional brand, its
 * own imagery and a starter selection of shared-catalog products.
 *
 * Templates are plain data kept with the code, like the section library they
 * are built from, so the marketing gallery can be prerendered and every
 * environment offers the same set. Applying one writes to a store's draft
 * only; see `src/lib/templates/apply.ts`.
 */
import type { StoreDesign } from "../store-design";
import type { SectionType } from "../storefront-schema";
import type { ProductBlockType } from "../product-template";
import type { ThemeKey } from "../types";

/** The ten template categories. */
export const TEMPLATE_CATEGORIES = [
  "company",
  "tech",
  "creators",
  "music",
  "sports",
  "events",
  "food",
  "nonprofit",
  "education",
  "artists",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STYLES = ["minimal", "bold", "playful", "editorial", "retro", "luxury", "technical", "dark"] as const;
export type TemplateStyle = (typeof TEMPLATE_STYLES)[number];

/** The shared-catalog blanks a template can suggest. Ids are the same in every environment. */
export const STARTER_CATALOG = {
  tee: "cat_tee_heavy",
  organicTee: "cat_tee_organic",
  hoodie: "cat_hoodie_premium",
  ecoHoodie: "cat_hoodie_eco",
  mug: "cat_mug_classic",
  blackMug: "cat_mug_matte",
  enamelMug: "cat_mug_enamel",
  tote: "cat_tote_canvas",
  cap: "cat_cap_twill",
  beanie: "cat_beanie_cuffed",
  poster: "cat_poster_matte",
  sticker: "cat_sticker_diecut",
  scarf: "cat_scarf_knit",
  jersey: "cat_jersey_sport",
} as const;
export type StarterKey = keyof typeof STARTER_CATALOG;

/** The blank a starter is photographed as: the two tees share photographs, as do the two hoodies. */
export type BlankFamily = Exclude<StarterKey, "organicTee" | "ecoHoodie">;

export function blankFamily(starter: StarterKey): BlankFamily {
  return starter === "organicTee" ? "tee" : starter === "ecoHoodie" ? "hoodie" : starter;
}

/** The colour of the blank a product is shown in, matching the blank photographs. */
export type BlankColour = "White" | "Black" | "Navy" | "Heather grey" | "Natural" | "Red" | "Forest green";

/** Blanks sold in one size. Posters come in paper sizes; garments in S to 2XL. */
export const ONE_SIZE: readonly BlankFamily[] = ["mug", "blackMug", "enamelMug", "tote", "cap", "beanie", "sticker", "scarf"];

/**
 * Where the artwork sits inside the print area, as fractions of it: the most
 * width and height it may take, the x of its centre, and its top edge (or
 * centred when `top` is null).
 */
export interface ArtworkPlacement {
  width: number;
  height: number;
  x: number;
  top: number | null;
}

/**
 * How a starter's artwork is placed: a full chest print on tees, a crest on
 * the wearer's left chest for kit shirts and `left-chest` products, a patch on
 * caps and beanies, edge to edge on posters.
 */
export function artworkPlacement(family: BlankFamily, placement?: TemplateProduct["placement"]): ArtworkPlacement {
  if (placement === "left-chest" || family === "jersey") return { width: 0.3, height: 0.3, x: 0.78, top: 0.06 };
  if (family === "poster") return { width: 1, height: 1, x: 0.5, top: 0 };
  if (family === "tee") return { width: 0.86, height: 0.8, x: 0.5, top: 0.08 };
  if (family === "hoodie") return { width: 0.86, height: 0.8, x: 0.5, top: null };
  return { width: 0.9, height: 0.8, x: 0.5, top: null };
}

/** A product in the starter selection, and in the template's demo store. */
export interface TemplateProduct {
  starter: StarterKey;
  colour: BlankColour;
  name: string;
  description: string;
  /** In the demo store's currency (USD), minor units. */
  price: number;
  tags?: string[];
  /** Offers a name and number, or a text line, on the product page. */
  personalise?: boolean;
  /** Shown with a "New" badge in the demo. */
  isNew?: boolean;
  /** A small print on the wearer's left chest instead of the full front. */
  placement?: "left-chest";
}

/** How the artwork printed on the template's products is drawn. */
export interface TemplateArtwork {
  /** The main line, usually the brand name. */
  word: string;
  /** A short second line under it, or empty. */
  sub: string;
  /** A CSS font-family the artwork is set in; loaded from Google Fonts when the art is drawn. */
  font: string;
  weight: number;
  /** Ink on white and light blanks, and on black and navy ones. */
  inkLight: string;
  inkDark: string;
  accent: string;
  /** A small mark drawn above the word. */
  mark:
    | "none"
    | "circle"
    | "bracket"
    | "star"
    | "bolt"
    | "crest"
    | "wave"
    | "dot"
    | "slash"
    | "sun"
    | "cup"
    | "leaf"
    | "heart"
    | "laurel"
    | "ticket"
    | "brush"
    | "grid";
  uppercase: boolean;
  tracking: number;
}

/**
 * A section in a template. Image props may hold a token instead of a URL:
 * `@hero`, `@lifestyle`, `@banner`, `@extra1` to `@extra4` or `@product1` to `@product8`, resolved
 * against the template's generated assets. `endsAt: "@soon"` becomes a date
 * twelve days out.
 */
export interface TemplateSection {
  type: SectionType;
  props: Record<string, string | number | boolean>;
}

export interface TemplateBlock {
  type: ProductBlockType;
  props?: Record<string, string | number | boolean>;
}

export interface TemplateDef {
  id: string;
  category: TemplateCategory;
  name: string;
  /** One sentence for the gallery, in English; translated with the rest of the copy. */
  description: string;
  styles: TemplateStyle[];
  /** The fictional brand the template's copy and imagery are written for. */
  brand: { name: string; tagline: string };
  theme: ThemeKey;
  design: StoreDesign;
  /** Header and footer settings (see `LAYOUT_FIELDS`). */
  layout: Record<string, string | boolean>;
  /** Announcement, navigation labels, footer note and newsletter copy (see `SITE_FIELDS`). */
  site: Record<string, string>;
  /** How the shop and collection pages lay out their products. */
  collection: { columns: "2" | "3" | "4"; header: "simple" | "banner" };
  sections: TemplateSection[];
  productPage: TemplateBlock[];
  products: TemplateProduct[];
  artwork: TemplateArtwork;
  /** Prompts for the original images generated for the template, plus up to four extra photographs. */
  imagery: { hero: string; lifestyle: string; banner: string; extra?: string[] };
}

/** What the asset script generated for a template: images, product shots and previews. */
export interface TemplateAssets {
  hero: string;
  lifestyle: string;
  banner: string;
  /** One per `imagery.extra` prompt, in order. */
  extra?: string[];
  /** One mockup per product, in the order of `TemplateDef.products`. */
  products: string[];
  /**
   * The artwork as a print-resolution PNG, per ink: on light blanks and on dark
   * ones, plus the full-sheet design posters are printed with.
   */
  artwork?: Partial<Record<"light" | "dark" | "poster", TemplatePrintFile>>;
  /**
   * Dark templates only: the blank photographs re-lit on a backdrop in the
   * theme's colours, keyed `family:colour:view`, that the product shots were
   * composited on.
   */
  backdrops?: Record<string, string>;
  previews?: { thumbnail: string; desktop: string; mobile: string };
}

export interface TemplatePrintFile {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/** The template as the gallery, the API and the editor read it. */
export interface StoreTemplate extends TemplateDef {
  assets: TemplateAssets;
}

/** The public summary of a template, as `listTemplates` returns it. */
export interface TemplateSummary {
  id: string;
  category: TemplateCategory;
  name: string;
  description: string;
  styles: TemplateStyle[];
  brand: string;
  thumbnail: string;
  previews: { desktop: string; mobile: string };
  colors: { primary: string; background: string; text: string };
  fonts: { heading: string; body: string };
}
