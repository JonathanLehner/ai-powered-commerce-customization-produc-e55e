/**
 * The approved storefront section library. The same definitions drive the
 * Craft.js editor toolbox, the generated settings panel, and the server-side
 * renderer that paints the published page.
 */

export type SectionType =
  | "HeroSection"
  | "ValueProps"
  | "ProductGrid"
  | "PromoBanner"
  | "ImageWithText"
  | "RichText"
  | "Testimonial"
  | "NewsletterSignup";

export type FieldType = "text" | "textarea" | "select" | "number" | "url" | "toggle";

export interface SectionField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  help?: string;
  min?: number;
  max?: number;
}

export interface SectionDef {
  type: SectionType;
  name: string;
  description: string;
  icon: string;
  defaults: Record<string, string | number | boolean>;
  fields: SectionField[];
}

const TONE_OPTIONS = [
  { value: "accent", label: "Accent" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  HeroSection: {
    type: "HeroSection",
    name: "Hero",
    description: "Full-width opening statement with a call to action and hero image.",
    icon: "hero",
    defaults: {
      eyebrow: "New collection",
      headline: "Merch your customers actually keep",
      body: "Designed, printed and shipped on demand — no minimums, no warehouse.",
      ctaLabel: "Shop the collection",
      ctaHref: "products",
      imageUrl: "",
      align: "left",
      tone: "light",
    },
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text" },
      { key: "headline", label: "Headline", type: "text" },
      { key: "body", label: "Supporting copy", type: "textarea" },
      { key: "ctaLabel", label: "Button label", type: "text" },
      {
        key: "ctaHref",
        label: "Button target",
        type: "select",
        options: [
          { value: "products", label: "All products" },
          { value: "cart", label: "Cart" },
        ],
      },
      { key: "imageUrl", label: "Image URL", type: "url", help: "Leave empty to use the store logo lockup." },
      {
        key: "align",
        label: "Alignment",
        type: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centred" },
        ],
      },
      { key: "tone", label: "Tone", type: "select", options: TONE_OPTIONS },
    ],
  },
  ValueProps: {
    type: "ValueProps",
    name: "Value props",
    description: "Three short reasons to buy — sizing, printing and delivery promises.",
    icon: "grid",
    defaults: {
      title: "Why shop with us",
      itemOneTitle: "Printed on demand",
      itemOneBody: "Every item is made after you order, so nothing is wasted.",
      itemTwoTitle: "Tracked worldwide",
      itemTwoBody: "DHL, FedEx and UPS tracking on every parcel, in over 190 countries.",
      itemThreeTitle: "Made to last",
      itemThreeBody: "Combed ring-spun cotton and dishwasher-safe ceramics.",
    },
    fields: [
      { key: "title", label: "Section title", type: "text" },
      { key: "itemOneTitle", label: "Item 1 title", type: "text" },
      { key: "itemOneBody", label: "Item 1 copy", type: "textarea" },
      { key: "itemTwoTitle", label: "Item 2 title", type: "text" },
      { key: "itemTwoBody", label: "Item 2 copy", type: "textarea" },
      { key: "itemThreeTitle", label: "Item 3 title", type: "text" },
      { key: "itemThreeBody", label: "Item 3 copy", type: "textarea" },
    ],
  },
  ProductGrid: {
    type: "ProductGrid",
    name: "Product grid",
    description: "Published products from this store's catalog.",
    icon: "products",
    defaults: {
      title: "Featured products",
      subtitle: "Customisable apparel and drinkware, made to order.",
      columns: 3,
      limit: 6,
      showPrice: true,
    },
    fields: [
      { key: "title", label: "Section title", type: "text" },
      { key: "subtitle", label: "Subtitle", type: "textarea" },
      {
        key: "columns",
        label: "Columns",
        type: "select",
        options: [
          { value: "2", label: "2 across" },
          { value: "3", label: "3 across" },
          { value: "4", label: "4 across" },
        ],
      },
      { key: "limit", label: "Maximum products", type: "number", min: 2, max: 12 },
      { key: "showPrice", label: "Show prices", type: "toggle" },
    ],
  },
  PromoBanner: {
    type: "PromoBanner",
    name: "Promo banner",
    description: "A single-line announcement strip with an optional link.",
    icon: "banner",
    defaults: {
      text: "Free shipping on orders over 75",
      ctaLabel: "See the range",
      ctaHref: "products",
      tone: "accent",
    },
    fields: [
      { key: "text", label: "Message", type: "text" },
      { key: "ctaLabel", label: "Link label", type: "text" },
      {
        key: "ctaHref",
        label: "Link target",
        type: "select",
        options: [
          { value: "products", label: "All products" },
          { value: "cart", label: "Cart" },
        ],
      },
      { key: "tone", label: "Tone", type: "select", options: TONE_OPTIONS },
    ],
  },
  ImageWithText: {
    type: "ImageWithText",
    name: "Image + text",
    description: "Story block pairing a photograph with a short piece of copy.",
    icon: "split",
    defaults: {
      heading: "Your logo, printed properly",
      body: "We pre-flight every design against the supplier's print area, resolution and colour requirements before anything reaches production.",
      imageUrl: "",
      imageSide: "left",
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body copy", type: "textarea" },
      { key: "imageUrl", label: "Image URL", type: "url" },
      {
        key: "imageSide",
        label: "Image position",
        type: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
    ],
  },
  RichText: {
    type: "RichText",
    name: "Text block",
    description: "Headed paragraph for policies, sizing notes or campaign detail.",
    icon: "text",
    defaults: {
      heading: "Sizing and care",
      body: "All apparel is unisex and true to size. Wash inside out at 30°C and hang dry to keep prints sharp. Mugs are dishwasher and microwave safe.",
      align: "left",
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body copy", type: "textarea" },
      {
        key: "align",
        label: "Alignment",
        type: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centred" },
        ],
      },
    ],
  },
  Testimonial: {
    type: "Testimonial",
    name: "Testimonial",
    description: "A customer quote with attribution.",
    icon: "quote",
    defaults: {
      quote: "The team ordered 240 hoodies for onboarding week and every single one arrived on time.",
      author: "Dana Whitfield",
      role: "People Operations, Northwind",
    },
    fields: [
      { key: "quote", label: "Quote", type: "textarea" },
      { key: "author", label: "Author", type: "text" },
      { key: "role", label: "Role / company", type: "text" },
    ],
  },
  NewsletterSignup: {
    type: "NewsletterSignup",
    name: "Email capture",
    description: "Invite shoppers to hear about restocks and new drops.",
    icon: "mail",
    defaults: {
      heading: "Hear about new drops first",
      body: "One email per launch. No spam, unsubscribe any time.",
      buttonLabel: "Notify me",
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body copy", type: "textarea" },
      { key: "buttonLabel", label: "Button label", type: "text" },
    ],
  },
};

export const SECTION_ORDER: SectionType[] = [
  "HeroSection",
  "PromoBanner",
  "ValueProps",
  "ProductGrid",
  "ImageWithText",
  "Testimonial",
  "RichText",
  "NewsletterSignup",
];

export interface CraftNode {
  type: { resolvedName: string };
  props: Record<string, unknown>;
  nodes?: string[];
  isCanvas?: boolean;
  parent?: string | null;
  displayName?: string;
  custom?: Record<string, unknown>;
  hidden?: boolean;
  linkedNodes?: Record<string, string>;
}

export type CraftTree = Record<string, CraftNode>;

/** Flattens a Craft.js serialised tree into the ordered list of page sections. */
export function sectionsFromTree(tree: unknown): { id: string; type: SectionType; props: Record<string, unknown> }[] {
  if (!tree || typeof tree !== "object") return [];
  const nodes = tree as CraftTree;
  const root = nodes.ROOT;
  if (!root || !Array.isArray(root.nodes)) return [];
  const out: { id: string; type: SectionType; props: Record<string, unknown> }[] = [];
  for (const id of root.nodes) {
    const node = nodes[id];
    if (!node) continue;
    const name = node.type?.resolvedName as SectionType | undefined;
    if (!name || !(name in SECTION_DEFS)) continue;
    out.push({ id, type: name, props: node.props ?? {} });
  }
  return out;
}

let counter = 0;
function nodeId(): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `n${counter}${rand}`;
}

/** Builds a Craft.js compatible tree from a plain list of sections. */
export function treeFromSections(
  sections: { type: SectionType; props?: Record<string, unknown> }[],
): CraftTree {
  const tree: CraftTree = {
    ROOT: {
      type: { resolvedName: "PageCanvas" },
      isCanvas: true,
      props: {},
      displayName: "Page",
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
    },
  };
  const ids: string[] = [];
  for (const section of sections) {
    const id = nodeId();
    ids.push(id);
    tree[id] = {
      type: { resolvedName: section.type },
      isCanvas: false,
      props: { ...SECTION_DEFS[section.type].defaults, ...(section.props ?? {}) },
      displayName: SECTION_DEFS[section.type].name,
      custom: {},
      parent: "ROOT",
      hidden: false,
      nodes: [],
      linkedNodes: {},
    };
  }
  tree.ROOT.nodes = ids;
  return tree;
}
