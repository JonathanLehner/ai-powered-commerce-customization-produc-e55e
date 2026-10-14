/**
 * The approved storefront section library. The same definitions drive the
 * Craft.js editor toolbox, the generated settings panel, the Admin API's field
 * checks and the server-side renderer that paints the published page.
 */

export type SectionType =
  | "HeroSection"
  | "ImageHero"
  | "Slideshow"
  | "PromoBanner"
  | "Countdown"
  | "ProductGrid"
  | "ProductCarousel"
  | "FeaturedProduct"
  | "CollectionTiles"
  | "ValueProps"
  | "MultiColumn"
  | "ImageWithText"
  | "Story"
  | "Stats"
  | "Gallery"
  | "VideoSection"
  | "LogoStrip"
  | "Testimonial"
  | "TestimonialCarousel"
  | "Faq"
  | "RichText"
  | "NewsletterSignup"
  | "Contact";

/**
 * - `image` and `video`: an https URL, uploaded in the editor or pasted.
 *   Every image field has two companions: `<key>Focal` ("x y", percentages of
 *   where the subject is, kept in frame when cropped) and `<key>Small` (a
 *   narrower copy for phones, made by the editor when it uploads).
 * - `link`: `products`, `cart`, `collection:<id>`, `product:<id>`, `#<anchor>`
 *   or an https URL.
 * - `product` and `collection`: one of the store's own, by id.
 * - `datetime`: an ISO 8601 date and time, or empty.
 * - `color`: `#rrggbb`, or empty for the theme's.
 * - `icon`: one of `ICONS`.
 */
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "url"
  | "toggle"
  | "image"
  | "video"
  | "focal"
  | "color"
  | "datetime"
  | "link"
  | "product"
  | "collection"
  | "icon";

export interface SectionField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  help?: string;
  min?: number;
  max?: number;
  /** Content fields come first in the editor; style fields sit under them. */
  group?: "content" | "style";
  /** Set by an image field on its focal point and small copy: edited with the image, not on their own. */
  companion?: boolean;
}

export type SectionCategory = "hero" | "products" | "content" | "media" | "social" | "conversion";

export interface SectionDef {
  type: SectionType;
  name: string;
  description: string;
  icon: string;
  category: SectionCategory;
  defaults: Record<string, string | number | boolean>;
  fields: SectionField[];
}

/** The icons a column, a value prop or a trust line can show. */
export const ICONS = [
  "sparkles",
  "truck",
  "shield",
  "leaf",
  "heart",
  "star",
  "gift",
  "recycle",
  "globe",
  "palette",
  "shirt",
  "coffee",
  "package",
  "clock",
  "award",
  "smile",
  "lock",
  "return",
  "ruler",
  "users",
] as const;

export type IconKey = (typeof ICONS)[number];

/* ------------------------------------------------------------- helpers */

const opts = (...values: [string, string][]) => values.map(([value, label]) => ({ value, label }));

const TONE_OPTIONS = opts(["accent", "Accent"], ["light", "Light"], ["dark", "Dark"]);
const ALIGN_OPTIONS = opts(["left", "Left"], ["center", "Centred"]);
const SIDE_OPTIONS = opts(["left", "Left"], ["right", "Right"]);
const RATIO_OPTIONS = opts(["square", "Square"], ["portrait", "Portrait"], ["landscape", "Landscape"]);

const text = (key: string, label: string): SectionField => ({ key, label, type: "text" });
const long = (key: string, label: string): SectionField => ({ key, label, type: "textarea" });
const link = (key: string, label: string): SectionField => ({ key, label, type: "link" });
const toggle = (key: string, label: string): SectionField => ({ key, label, type: "toggle" });
const number = (key: string, label: string, min: number, max: number): SectionField => ({ key, label, type: "number", min, max });
const select = (key: string, label: string, options: SectionField["options"]): SectionField => ({ key, label, type: "select", options });
const icon = (key: string, label: string): SectionField => ({ key, label, type: "icon" });

/** An image field with its focal point and phone-sized copy. */
function image(key: string, label: string, help?: string): SectionField[] {
  return [
    { key, label, type: "image", ...(help ? { help } : {}) },
    { key: `${key}Focal`, label: `${label} focal point`, type: "focal", companion: true },
    { key: `${key}Small`, label: `${label} for phones`, type: "url", companion: true },
  ];
}

/** Defaults for an image field and its companions. */
function imageDefaults(key: string, url = ""): Record<string, string> {
  return { [key]: url, [`${key}Focal`]: "50 50", [`${key}Small`]: "" };
}

/** `n` numbered copies of a group of fields: `slide1Headline`, `slide2Headline`, ... */
function repeat(prefix: string, label: string, count: number, make: (key: (name: string) => string, n: number) => SectionField[]) {
  const out: SectionField[] = [];
  for (let n = 1; n <= count; n += 1) {
    out.push(
      ...make((name) => `${prefix}${n}${name}`, n).map((field) =>
        field.companion ? field : { ...field, label: `${label} ${n}: ${field.label}` },
      ),
    );
  }
  return out;
}

/**
 * The style every section takes: what it sits on, how much room it has, its
 * alignment and how wide its content runs. `auto` keeps the section's own look.
 */
const STYLE_FIELDS: SectionField[] = [
  {
    key: "background",
    label: "Background",
    type: "select",
    group: "style",
    options: opts(
      ["auto", "Automatic"],
      ["surface", "Surface"],
      ["primary", "Primary colour"],
      ["secondary", "Secondary colour"],
      ["inverse", "Inverted"],
      ["custom", "Custom colour"],
      ["image", "Image"],
    ),
  },
  { key: "backgroundColor", label: "Background colour", type: "color", group: "style" },
  ...image("backgroundImage", "Background image").map((f) => ({ ...f, group: "style" as const })),
  {
    key: "spacing",
    label: "Spacing",
    type: "select",
    group: "style",
    options: opts(["none", "None"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"]),
  },
  { key: "align", label: "Alignment", type: "select", group: "style", options: ALIGN_OPTIONS },
  {
    key: "width",
    label: "Width",
    type: "select",
    group: "style",
    options: opts(["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full width"]),
  },
];

const STYLE_DEFAULTS = {
  background: "auto",
  backgroundColor: "",
  ...imageDefaults("backgroundImage"),
  spacing: "medium",
  align: "left",
  width: "normal",
};

/** Puts the style fields after a section's own, and their defaults under its own. */
function def(input: Omit<SectionDef, "fields" | "defaults"> & { fields: SectionField[]; defaults: SectionDef["defaults"] }): SectionDef {
  const own = new Set(input.fields.map((f) => f.key));
  return {
    ...input,
    fields: [...input.fields.map((f) => ({ group: "content" as const, ...f })), ...STYLE_FIELDS.filter((f) => !own.has(f.key))],
    defaults: { ...STYLE_DEFAULTS, ...input.defaults },
  };
}

/** The field builders, for the other block libraries (header and footer, product page). */
export const fieldKit = { opts, text, long, link, toggle, number, select, icon, image, imageDefaults };

/* ------------------------------------------------------------ sections */

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  HeroSection: def({
    type: "HeroSection",
    name: "Hero",
    description: "Opening statement with a call to action and an image beside it.",
    icon: "hero",
    category: "hero",
    defaults: {
      eyebrow: "New collection",
      headline: "Branded merchandise, made to order",
      body: "Printed on demand and shipped worldwide.",
      ctaLabel: "Shop the collection",
      ctaHref: "products",
      secondaryLabel: "",
      secondaryHref: "products",
      ...imageDefaults("imageUrl"),
      align: "left",
      tone: "light",
    },
    fields: [
      text("eyebrow", "Eyebrow"),
      text("headline", "Headline"),
      long("body", "Supporting copy"),
      text("ctaLabel", "Button label"),
      link("ctaHref", "Button target"),
      text("secondaryLabel", "Second button label"),
      link("secondaryHref", "Second button target"),
      ...image("imageUrl", "Image", "Leave empty for a text-only hero."),
      select("tone", "Tone", TONE_OPTIONS),
    ],
  }),
  ImageHero: def({
    type: "ImageHero",
    name: "Image or video hero",
    description: "Full-bleed photo or video with the headline over it.",
    icon: "hero",
    category: "hero",
    defaults: {
      eyebrow: "Just dropped",
      headline: "The new collection is here",
      body: "Limited runs, made to order.",
      ctaLabel: "Shop now",
      ctaHref: "products",
      secondaryLabel: "",
      secondaryHref: "products",
      ...imageDefaults("imageUrl"),
      videoUrl: "",
      height: "large",
      position: "bottom-left",
      overlay: 35,
      width: "full",
      spacing: "none",
    },
    fields: [
      text("eyebrow", "Eyebrow"),
      text("headline", "Headline"),
      long("body", "Supporting copy"),
      text("ctaLabel", "Button label"),
      link("ctaHref", "Button target"),
      text("secondaryLabel", "Second button label"),
      link("secondaryHref", "Second button target"),
      ...image("imageUrl", "Image"),
      { key: "videoUrl", label: "Background video", type: "video", help: "MP4 or WebM, muted and looped. The image shows until it plays." },
      select("height", "Height", opts(["medium", "Medium"], ["large", "Large"], ["screen", "Full screen"])),
      select(
        "position",
        "Text position",
        opts(["center", "Centre"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom centre"], ["left", "Left"]),
      ),
      number("overlay", "Image darkening (%)", 0, 80),
    ],
  }),
  Slideshow: def({
    type: "Slideshow",
    name: "Slideshow",
    description: "Rotating banners for drops, campaigns and collections.",
    icon: "slides",
    category: "hero",
    defaults: {
      autoplay: true,
      height: "large",
      overlay: 30,
      width: "full",
      spacing: "none",
      slide1Eyebrow: "Drop 01",
      slide1Headline: "The season's first drop",
      slide1Body: "Limited quantities. When it's gone, it's gone.",
      slide1CtaLabel: "Shop the drop",
      slide1CtaHref: "products",
      ...imageDefaults("slide1Image"),
      slide2Eyebrow: "Best sellers",
      slide2Headline: "The pieces everyone is wearing",
      slide2Body: "",
      slide2CtaLabel: "Shop best sellers",
      slide2CtaHref: "products",
      ...imageDefaults("slide2Image"),
      slide3Eyebrow: "",
      slide3Headline: "",
      slide3Body: "",
      slide3CtaLabel: "",
      slide3CtaHref: "products",
      ...imageDefaults("slide3Image"),
    },
    fields: [
      toggle("autoplay", "Advance automatically"),
      select("height", "Height", opts(["medium", "Medium"], ["large", "Large"], ["screen", "Full screen"])),
      number("overlay", "Image darkening (%)", 0, 80),
      ...repeat("slide", "Slide", 3, (k) => [
        text(k("Eyebrow"), "Eyebrow"),
        text(k("Headline"), "Headline"),
        long(k("Body"), "Copy"),
        text(k("CtaLabel"), "Button label"),
        link(k("CtaHref"), "Button target"),
        ...image(k("Image"), "Image"),
      ]),
    ],
  }),
  PromoBanner: def({
    type: "PromoBanner",
    name: "Promo banner",
    description: "A single-line announcement strip with an optional link.",
    icon: "banner",
    category: "conversion",
    defaults: {
      text: "Free shipping on orders over 75",
      ctaLabel: "See the range",
      ctaHref: "products",
      tone: "accent",
      scrolling: false,
      width: "full",
      spacing: "none",
      align: "center",
    },
    fields: [
      text("text", "Message"),
      text("ctaLabel", "Link label"),
      link("ctaHref", "Link target"),
      select("tone", "Tone", TONE_OPTIONS),
      toggle("scrolling", "Scroll the message across"),
    ],
  }),
  Countdown: def({
    type: "Countdown",
    name: "Countdown",
    description: "A drop or launch banner counting down to a date.",
    icon: "clock",
    category: "conversion",
    defaults: {
      eyebrow: "Next drop",
      heading: "The new collection lands soon",
      body: "Sign up or come back when the clock hits zero.",
      endsAt: "",
      endedText: "Out now",
      ctaLabel: "Shop now",
      ctaHref: "products",
      ...imageDefaults("imageUrl"),
      background: "inverse",
      align: "center",
    },
    fields: [
      text("eyebrow", "Eyebrow"),
      text("heading", "Heading"),
      long("body", "Copy"),
      { key: "endsAt", label: "Counts down to", type: "datetime" },
      text("endedText", "Shown once the time has passed"),
      text("ctaLabel", "Button label"),
      link("ctaHref", "Button target"),
      ...image("imageUrl", "Image"),
    ],
  }),
  ProductGrid: def({
    type: "ProductGrid",
    name: "Product grid",
    description: "Published products from this store's catalog.",
    icon: "products",
    category: "products",
    defaults: {
      title: "Featured products",
      subtitle: "Customisable apparel and drinkware, made to order.",
      source: "all",
      columns: 3,
      limit: 6,
      showPrice: true,
      showBadges: true,
      showSwatches: true,
      quickAdd: true,
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      { key: "source", label: "Source", type: "collection" },
      select("columns", "Columns", opts(["2", "2 across"], ["3", "3 across"], ["4", "4 across"])),
      number("limit", "Maximum products", 2, 12),
      toggle("showPrice", "Show prices"),
      toggle("showBadges", "Show badges"),
      toggle("showSwatches", "Show colour swatches"),
      toggle("quickAdd", "Quick add"),
    ],
  }),
  ProductCarousel: def({
    type: "ProductCarousel",
    name: "Product carousel",
    description: "A swipeable row of products, such as new arrivals or one collection.",
    icon: "carousel",
    category: "products",
    defaults: {
      title: "New arrivals",
      subtitle: "",
      ctaLabel: "Shop all",
      source: "all",
      limit: 10,
      layout: "top",
      showBadges: true,
      showSwatches: true,
      quickAdd: true,
      width: "wide",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      text("ctaLabel", "Link label"),
      { key: "source", label: "Source", type: "collection" },
      number("limit", "Maximum products", 3, 16),
      select("layout", "Heading position", opts(["top", "Above"], ["side", "Beside"])),
      toggle("showBadges", "Show badges"),
      toggle("showSwatches", "Show colour swatches"),
      toggle("quickAdd", "Quick add"),
    ],
  }),
  FeaturedProduct: def({
    type: "FeaturedProduct",
    name: "Featured product",
    description: "One product with its photos, options and an add to basket button.",
    icon: "product",
    category: "products",
    defaults: {
      product: "",
      eyebrow: "Featured",
      heading: "",
      body: "",
      imageSide: "left",
      background: "surface",
    },
    fields: [
      { key: "product", label: "Product", type: "product", help: "Leave empty for the newest product." },
      text("eyebrow", "Eyebrow"),
      text("heading", "Heading"),
      long("body", "Copy"),
      select("imageSide", "Image position", SIDE_OPTIONS),
    ],
  }),
  CollectionTiles: def({
    type: "CollectionTiles",
    name: "Collection tiles",
    description: "Shop by category: large photo tiles that open a collection.",
    icon: "tiles",
    category: "products",
    defaults: {
      title: "Shop by category",
      subtitle: "",
      ratio: "portrait",
      layout: "grid",
      ...Object.fromEntries(
        [1, 2, 3, 4].flatMap((n) => [[`tile${n}Collection`, ""], [`tile${n}Label`, ""], ...Object.entries(imageDefaults(`tile${n}Image`))]),
      ),
      width: "wide",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      select("ratio", "Tile shape", RATIO_OPTIONS),
      select("layout", "Layout", opts(["grid", "Grid"], ["carousel", "Carousel"])),
      ...repeat("tile", "Tile", 4, (k) => [
        { key: k("Collection"), label: "Collection", type: "collection", help: "Empty tiles show your collections in order." },
        text(k("Label"), "Label"),
        ...image(k("Image"), "Image"),
      ]),
    ],
  }),
  ValueProps: def({
    type: "ValueProps",
    name: "Value props",
    description: "Three short reasons to buy.",
    icon: "grid",
    category: "content",
    defaults: {
      title: "Why shop with us",
      itemOneIcon: "sparkles",
      itemOneTitle: "Printed on demand",
      itemOneBody: "Every item is made when you order it.",
      itemTwoIcon: "truck",
      itemTwoTitle: "Tracked worldwide",
      itemTwoBody: "DHL, FedEx and UPS tracking on every parcel, in over 190 countries.",
      itemThreeIcon: "award",
      itemThreeTitle: "Made to last",
      itemThreeBody: "Combed ring-spun cotton and dishwasher-safe ceramics.",
    },
    fields: [
      text("title", "Section title"),
      icon("itemOneIcon", "Item 1 icon"),
      text("itemOneTitle", "Item 1 title"),
      long("itemOneBody", "Item 1 copy"),
      icon("itemTwoIcon", "Item 2 icon"),
      text("itemTwoTitle", "Item 2 title"),
      long("itemTwoBody", "Item 2 copy"),
      icon("itemThreeIcon", "Item 3 icon"),
      text("itemThreeTitle", "Item 3 title"),
      long("itemThreeBody", "Item 3 copy"),
    ],
  }),
  MultiColumn: def({
    type: "MultiColumn",
    name: "Columns",
    description: "Two to four columns with an icon or photo each: features, perks, a mission.",
    icon: "columns",
    category: "content",
    defaults: {
      title: "Made with care",
      subtitle: "",
      columns: "3",
      media: "icon",
      ...Object.fromEntries(
        [1, 2, 3, 4].flatMap((n) => [
          [`column${n}Icon`, ["leaf", "truck", "heart", "shield"][n - 1]],
          [`column${n}Title`, n === 4 ? "" : ["Responsibly made", "Shipped worldwide", "Loved by fans"][n - 1]],
          [`column${n}Body`, n === 4 ? "" : ["Printed to order, so nothing is wasted.", "Tracked delivery to over 190 countries.", "Thousands of happy customers and counting."][n - 1]],
          ...Object.entries(imageDefaults(`column${n}Image`)),
        ]),
      ),
      align: "center",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      select("columns", "Columns", opts(["2", "2 across"], ["3", "3 across"], ["4", "4 across"])),
      select("media", "Show", opts(["icon", "Icons"], ["image", "Photos"], ["number", "Numbers"])),
      ...repeat("column", "Column", 4, (k) => [icon(k("Icon"), "Icon"), ...image(k("Image"), "Photo"), text(k("Title"), "Title"), long(k("Body"), "Copy")]),
    ],
  }),
  ImageWithText: def({
    type: "ImageWithText",
    name: "Image + text",
    description: "Story block pairing a photograph with a short piece of copy.",
    icon: "split",
    category: "content",
    defaults: {
      eyebrow: "",
      heading: "Your logo, printed properly",
      body: "Every design is checked for print quality before production.",
      ctaLabel: "",
      ctaHref: "products",
      ...imageDefaults("imageUrl"),
      imageSide: "left",
      background: "surface",
    },
    fields: [
      text("eyebrow", "Eyebrow"),
      text("heading", "Heading"),
      long("body", "Body copy"),
      text("ctaLabel", "Button label"),
      link("ctaHref", "Button target"),
      ...image("imageUrl", "Image"),
      select("imageSide", "Image position", SIDE_OPTIONS),
    ],
  }),
  Story: def({
    type: "Story",
    name: "Story",
    description: "About us or mission: a long read with photos, a key number and a sign-off.",
    icon: "story",
    category: "content",
    defaults: {
      eyebrow: "Our story",
      heading: "Started with one shirt and a lot of opinions",
      body: "We make the things we wanted to wear and couldn't find.\n\nEvery piece is printed to order by partners we visit, on blanks we have tested in the wash more times than we would like to admit.",
      ...imageDefaults("imageUrl"),
      ...imageDefaults("secondImageUrl"),
      statValue: "",
      statLabel: "",
      signature: "",
      ctaLabel: "",
      ctaHref: "products",
    },
    fields: [
      text("eyebrow", "Eyebrow"),
      text("heading", "Heading"),
      long("body", "Story"),
      ...image("imageUrl", "Main photo"),
      ...image("secondImageUrl", "Second photo"),
      text("statValue", "Key number"),
      text("statLabel", "Key number label"),
      text("signature", "Signed"),
      text("ctaLabel", "Button label"),
      link("ctaHref", "Button target"),
    ],
  }),
  Stats: def({
    type: "Stats",
    name: "Impact numbers",
    description: "Up to four big numbers: impact, community, orders shipped.",
    icon: "stats",
    category: "content",
    defaults: {
      title: "Our impact so far",
      subtitle: "",
      stat1Value: "120k",
      stat1Label: "Orders shipped",
      stat2Value: "190+",
      stat2Label: "Countries reached",
      stat3Value: "0",
      stat3Label: "Items made and never sold",
      stat4Value: "",
      stat4Label: "",
      background: "surface",
      align: "center",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      ...repeat("stat", "Number", 4, (k) => [text(k("Value"), "Value"), text(k("Label"), "Label")]),
    ],
  }),
  Gallery: def({
    type: "Gallery",
    name: "Gallery",
    description: "A lookbook of photos, each with an optional caption and link.",
    icon: "gallery",
    category: "media",
    defaults: {
      title: "Lookbook",
      subtitle: "",
      layout: "mosaic",
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [...Object.entries(imageDefaults(`image${n}`)), [`caption${n}`, ""], [`link${n}`, ""]])),
      width: "wide",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      select("layout", "Layout", opts(["mosaic", "Mosaic"], ["grid", "Grid"], ["carousel", "Carousel"])),
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
        ...image(`image${n}`, `Photo ${n}`),
        { ...text(`caption${n}`, "Caption"), label: `Photo ${n}: Caption` },
        { ...link(`link${n}`, "Link"), label: `Photo ${n}: Link` },
      ]),
    ],
  }),
  VideoSection: def({
    type: "VideoSection",
    name: "Video",
    description: "An uploaded video or a YouTube or Vimeo link, played on click.",
    icon: "video",
    category: "media",
    defaults: {
      title: "",
      body: "",
      videoUrl: "",
      ...imageDefaults("posterUrl"),
      autoplay: false,
      ratio: "16:9",
    },
    fields: [
      text("title", "Heading"),
      long("body", "Copy"),
      { key: "videoUrl", label: "Video", type: "video", help: "Upload an MP4, or paste a YouTube or Vimeo link." },
      ...image("posterUrl", "Cover image"),
      toggle("autoplay", "Play muted on loop (uploaded video only)"),
      select("ratio", "Shape", opts(["16:9", "Wide"], ["4:3", "Classic"], ["1:1", "Square"], ["9:16", "Vertical"])),
    ],
  }),
  LogoStrip: def({
    type: "LogoStrip",
    name: "Logo strip",
    description: "Partner, press or client logos in a row.",
    icon: "logos",
    category: "social",
    defaults: {
      title: "As seen in",
      monochrome: true,
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [...Object.entries(imageDefaults(`logo${n}`)), [`logo${n}Name`, ""]])),
      align: "center",
    },
    fields: [
      text("title", "Section title"),
      toggle("monochrome", "Show logos in one colour"),
      ...repeat("logo", "Logo", 6, (k, n) => [...image(`logo${n}`, "Image"), text(k("Name"), "Name (read aloud to screen readers)")]),
    ],
  }),
  Testimonial: def({
    type: "Testimonial",
    name: "Testimonial",
    description: "A customer quote with attribution.",
    icon: "quote",
    category: "social",
    defaults: {
      quote: "The team ordered 240 hoodies for onboarding week and every single one arrived on time.",
      author: "Dana Whitfield",
      role: "People Operations, Northwind",
      rating: 5,
      align: "center",
    },
    fields: [
      long("quote", "Quote"),
      text("author", "Author"),
      text("role", "Role / company"),
      number("rating", "Stars (0 hides them)", 0, 5),
    ],
  }),
  TestimonialCarousel: def({
    type: "TestimonialCarousel",
    name: "Testimonials carousel",
    description: "Several customer quotes to swipe through.",
    icon: "quotes",
    category: "social",
    defaults: {
      title: "What customers are saying",
      rating: 5,
      quote1: "Softest hoodie I own, and the print still looks new after months.",
      author1: "Sam R.",
      role1: "Verified buyer",
      quote2: "Ordered on Monday, wearing it to the show on Friday.",
      author2: "Priya K.",
      role2: "Verified buyer",
      quote3: "The mug survived the dishwasher, my kids and a house move.",
      author3: "Tom H.",
      role3: "Verified buyer",
      quote4: "",
      author4: "",
      role4: "",
      background: "surface",
    },
    fields: [
      text("title", "Section title"),
      number("rating", "Stars (0 hides them)", 0, 5),
      ...[1, 2, 3, 4].flatMap((n) => [
        { ...long(`quote${n}`, "Quote"), label: `Quote ${n}` },
        { ...text(`author${n}`, "Author"), label: `Quote ${n}: Author` },
        { ...text(`role${n}`, "Role"), label: `Quote ${n}: Role / company` },
      ]),
    ],
  }),
  Faq: def({
    type: "Faq",
    name: "FAQ",
    description: "Questions and answers that open one at a time.",
    icon: "faq",
    category: "content",
    defaults: {
      title: "Questions",
      subtitle: "",
      q1: "When will my order ship?",
      a1: "Everything is made to order. Most orders leave us within five business days, and you get tracking as soon as they do.",
      q2: "Can I return an item?",
      a2: "Personalised items are made just for you, so we can only replace them if they arrive damaged or misprinted. Other items can be returned within 30 days.",
      q3: "How do I care for my prints?",
      a3: "Wash inside out at 30°C and hang dry. Don't iron directly on the print.",
      q4: "",
      a4: "",
      q5: "",
      a5: "",
      q6: "",
      a6: "",
      width: "narrow",
    },
    fields: [
      text("title", "Section title"),
      long("subtitle", "Subtitle"),
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
        { ...text(`q${n}`, "Question"), label: `Question ${n}` },
        { ...long(`a${n}`, "Answer"), label: `Answer ${n}` },
      ]),
    ],
  }),
  RichText: def({
    type: "RichText",
    name: "Text block",
    description: "Headed paragraph for policies, sizing notes or campaign detail.",
    icon: "text",
    category: "content",
    defaults: {
      eyebrow: "",
      heading: "Sizing and care",
      body: "All apparel is unisex and true to size. Wash inside out at 30°C and hang dry to keep prints sharp. Mugs are dishwasher and microwave safe.",
      align: "left",
      width: "narrow",
    },
    fields: [text("eyebrow", "Eyebrow"), text("heading", "Heading"), long("body", "Body copy")],
  }),
  NewsletterSignup: def({
    type: "NewsletterSignup",
    name: "Email capture",
    description: "Invite shoppers to hear about restocks and new drops.",
    icon: "mail",
    category: "conversion",
    defaults: {
      heading: "Hear about new drops first",
      body: "One email per launch. Unsubscribe any time.",
      buttonLabel: "Notify me",
      ...imageDefaults("imageUrl"),
      background: "surface",
      align: "center",
      width: "narrow",
    },
    fields: [text("heading", "Heading"), long("body", "Body copy"), text("buttonLabel", "Button label"), ...image("imageUrl", "Image")],
  }),
  Contact: def({
    type: "Contact",
    name: "Contact and locations",
    description: "Address, opening hours, email and phone, with directions.",
    icon: "pin",
    category: "conversion",
    defaults: {
      title: "Visit or get in touch",
      body: "",
      address: "",
      hours: "",
      email: "",
      phone: "",
      mapUrl: "",
      ...imageDefaults("imageUrl"),
    },
    fields: [
      text("title", "Section title"),
      long("body", "Copy"),
      long("address", "Address"),
      long("hours", "Opening hours"),
      text("email", "Email"),
      text("phone", "Phone"),
      { key: "mapUrl", label: "Directions link", type: "url", help: "A Google Maps or Apple Maps link." },
      ...image("imageUrl", "Photo"),
    ],
  }),
};

/** The toolbox order: openers first, then products, content, media, proof and sign-ups. */
export const SECTION_ORDER: SectionType[] = [
  "ImageHero",
  "HeroSection",
  "Slideshow",
  "PromoBanner",
  "Countdown",
  "ProductCarousel",
  "ProductGrid",
  "FeaturedProduct",
  "CollectionTiles",
  "ValueProps",
  "MultiColumn",
  "ImageWithText",
  "Story",
  "Stats",
  "Faq",
  "RichText",
  "Gallery",
  "VideoSection",
  "LogoStrip",
  "Testimonial",
  "TestimonialCarousel",
  "NewsletterSignup",
  "Contact",
];

export const SECTION_CATEGORIES: SectionCategory[] = ["hero", "products", "content", "media", "social", "conversion"];

/** Whether a field is copy, which is translated per language. */
export function isCopyField(field: SectionField): boolean {
  return field.type === "text" || field.type === "textarea";
}

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
    // Sections saved before a field existed read its default.
    out.push({ id, type: name, props: { ...SECTION_DEFS[name].defaults, ...(node.props ?? {}) } });
  }
  return out;
}

let counter = 0;
function nodeId(): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `n${counter}${rand}`;
}

/** Builds a Craft.js compatible tree from a plain list of sections, with `rootProps` on the page. */
export function treeFromSections(
  sections: { type: SectionType; props?: Record<string, unknown> }[],
  rootProps: Record<string, unknown> = {},
): CraftTree {
  const tree: CraftTree = {
    ROOT: {
      type: { resolvedName: "PageCanvas" },
      isCanvas: true,
      props: rootProps,
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
