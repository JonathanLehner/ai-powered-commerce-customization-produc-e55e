/**
 * The product page as a template: an ordered list of blocks every product page
 * of the store is drawn from, edited in the storefront editor like the home
 * page and kept on the page tree's root node (`productPage`), so it is
 * drafted, versioned, previewed and published with it. Plain data, shared by
 * the product page, the editor and the Admin API.
 */
import { fieldKit, type FieldType, type SectionField } from "./storefront-schema";

const { opts, text, long, toggle, number, select, icon } = fieldKit;

export type ProductBlockType =
  | "ProductMain"
  | "DescriptionTabs"
  | "SizeGuide"
  | "ProductFeatures"
  | "ProductText"
  | "Reviews"
  | "RelatedProducts"
  | "RecentlyViewed";

export interface ProductBlockDef {
  type: ProductBlockType;
  name: string;
  description: string;
  /** At most one of each, except text and features. */
  single: boolean;
  defaults: Record<string, string | number | boolean>;
  fields: SectionField[];
}

export interface ProductBlock {
  id: string;
  type: ProductBlockType;
  props: Record<string, unknown>;
}

/** The root prop the template is kept under. */
export const PRODUCT_PAGE_PROP = "productPage";
export const PRODUCT_BLOCK_LIMIT = 16;

export const PRODUCT_BLOCK_DEFS: Record<ProductBlockType, ProductBlockDef> = {
  ProductMain: {
    type: "ProductMain",
    name: "Gallery and buy box",
    description: "Photos, price, options, personalisation and the add to basket button.",
    single: true,
    defaults: { galleryLayout: "thumbnails", gallerySide: "left", personalisation: true, showTags: true, stickyBuyBox: true, trustNote: "" },
    fields: [
      select("galleryLayout", "Gallery", opts(["thumbnails", "Large photo with thumbnails"], ["grid", "Two-column grid"], ["stacked", "Stacked photos"])),
      select("gallerySide", "Gallery position", opts(["left", "Left"], ["right", "Right"])),
      toggle("personalisation", "Show personalisation"),
      toggle("showTags", "Show tags"),
      toggle("stickyBuyBox", "Keep the buy box in view while scrolling"),
      text("trustNote", "Line under the button"),
    ],
  },
  DescriptionTabs: {
    type: "DescriptionTabs",
    name: "Description tabs",
    description: "The description, print and production details, and shipping, in tabs.",
    single: true,
    defaults: { style: "tabs", showDetails: true, showShipping: true, extraTitle: "", extraBody: "" },
    fields: [
      select("style", "Style", opts(["tabs", "Tabs"], ["accordion", "Accordion"])),
      toggle("showDetails", "Show print and production details"),
      toggle("showShipping", "Show shipping"),
      text("extraTitle", "Extra tab title"),
      long("extraBody", "Extra tab copy"),
    ],
  },
  SizeGuide: {
    type: "SizeGuide",
    name: "Size guide",
    description: "A measurement table that opens from the product page.",
    single: true,
    defaults: {
      title: "Size guide",
      intro: "Measurements are of the garment laid flat, in centimetres.",
      table: "Size | Chest | Length\nS | 51 | 71\nM | 54 | 74\nL | 57 | 76\nXL | 60 | 78\nXXL | 63 | 80",
    },
    fields: [
      text("title", "Title"),
      long("intro", "Introduction"),
      { ...long("table", "Table"), help: "One row per line, cells separated by |. The first row is the header." },
    ],
  },
  ProductFeatures: {
    type: "ProductFeatures",
    name: "Features",
    description: "Three short reasons to buy, with icons.",
    single: false,
    defaults: {
      feature1Icon: "sparkles",
      feature1Title: "Made to order",
      feature1Body: "Printed when you order it, so nothing goes to waste.",
      feature2Icon: "truck",
      feature2Title: "Tracked delivery",
      feature2Body: "Every parcel is tracked to your door.",
      feature3Icon: "lock",
      feature3Title: "Secure checkout",
      feature3Body: "Pay by card, Apple Pay or Google Pay.",
    },
    fields: [1, 2, 3].flatMap((n) => [
      { ...icon(`feature${n}Icon`, "Icon"), label: `Feature ${n}: Icon` },
      { ...text(`feature${n}Title`, "Title"), label: `Feature ${n}: Title` },
      { ...long(`feature${n}Body`, "Copy"), label: `Feature ${n}: Copy` },
    ]),
  },
  ProductText: {
    type: "ProductText",
    name: "Text",
    description: "A heading and paragraph shown on every product page.",
    single: false,
    defaults: { heading: "Made for you", body: "Every piece is printed to order and checked before it ships." },
    fields: [text("heading", "Heading"), long("body", "Copy")],
  },
  Reviews: {
    type: "Reviews",
    name: "Reviews",
    description: "The product's approved reviews and its rating.",
    single: true,
    defaults: {},
    fields: [],
  },
  RelatedProducts: {
    type: "RelatedProducts",
    name: "Related products",
    description: "Products from the same collections or with the same tags.",
    single: true,
    defaults: { title: "You may also like", limit: 8 },
    fields: [text("title", "Title"), number("limit", "Maximum products", 2, 12)],
  },
  RecentlyViewed: {
    type: "RecentlyViewed",
    name: "Recently viewed",
    description: "The products this shopper looked at last, kept on their device.",
    single: true,
    defaults: { title: "Recently viewed", limit: 6 },
    fields: [text("title", "Title"), number("limit", "Maximum products", 2, 12)],
  },
};

export const PRODUCT_BLOCK_ORDER: ProductBlockType[] = [
  "ProductMain",
  "DescriptionTabs",
  "SizeGuide",
  "ProductFeatures",
  "ProductText",
  "Reviews",
  "RelatedProducts",
  "RecentlyViewed",
];

export function isProductBlockType(value: unknown): value is ProductBlockType {
  return typeof value === "string" && value in PRODUCT_BLOCK_DEFS;
}

/** What a store's product page is before it is edited: the page as it always was, plus related and recently viewed. */
export const DEFAULT_PRODUCT_PAGE: ProductBlockType[] = ["ProductMain", "DescriptionTabs", "Reviews", "RelatedProducts", "RecentlyViewed"];

export function newBlockId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "b";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function defaultProductBlocks(): ProductBlock[] {
  return DEFAULT_PRODUCT_PAGE.map((type, index) => ({ id: `b${type.toLowerCase()}${index}`, type, props: { ...PRODUCT_BLOCK_DEFS[type].defaults } }));
}

/**
 * A page tree's product template, with each block's defaults under what was
 * saved. A tree with no template, or one whose template lost its gallery and
 * buy box, gets the default: a product page without them could not be bought from.
 */
export function productBlocks(tree: unknown): ProductBlock[] {
  const props =
    tree && typeof tree === "object" ? ((tree as Record<string, { props?: Record<string, unknown> }>).ROOT?.props ?? {}) : {};
  const saved = props[PRODUCT_PAGE_PROP];
  if (!Array.isArray(saved)) return defaultProductBlocks();
  const blocks = saved
    .filter((b): b is ProductBlock => b && typeof b === "object" && isProductBlockType(b.type) && typeof b.id === "string")
    .map((b) => ({ id: b.id, type: b.type, props: { ...PRODUCT_BLOCK_DEFS[b.type].defaults, ...(b.props ?? {}) } }));
  return blocks.some((b) => b.type === "ProductMain") ? blocks : defaultProductBlocks();
}

/** The copy fields of a block type, which are translated per language. */
export function translatableBlockFields(type: ProductBlockType): string[] {
  const copy: FieldType[] = ["text", "textarea"];
  return PRODUCT_BLOCK_DEFS[type].fields.filter((f) => copy.includes(f.type)).map((f) => f.key);
}
