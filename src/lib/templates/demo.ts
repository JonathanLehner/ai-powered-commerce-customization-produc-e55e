/**
 * A template's demo store: its fictional brand's products and collections as
 * storefront cards, priced and labelled in the shopper's language. Nothing is
 * read from the database, so the demo pages are prerendered.
 */
import type { StorefrontCollection, StorefrontProductCard } from "@/components/storefront/kit";
import type { Locale } from "@/i18n/locales";
import { convert } from "../pricing";
import { slugify } from "../util";
import { templateCopy } from "./index";
import { blankFamily, ONE_SIZE, type BlankColour, type StoreTemplate } from "./model";

/** The demo's currency per language, and how a USD demo price converts into it. */
const CURRENCY: Record<Locale, { code: string; rate: number; step: number }> = {
  en: { code: "USD", rate: 1, step: 1 },
  de: { code: "EUR", rate: 1, step: 1 },
  fr: { code: "EUR", rate: 1, step: 1 },
  es: { code: "EUR", rate: 1, step: 1 },
  it: { code: "EUR", rate: 1, step: 1 },
  nl: { code: "EUR", rate: 1, step: 1 },
  pt: { code: "EUR", rate: 1, step: 1 },
  ja: { code: "JPY", rate: 1.5, step: 100 },
  sv: { code: "SEK", rate: 11, step: 10 },
};

const COLOURS: Record<BlankColour, { hex: string; names: Record<Locale, string> }> = {
  White: {
    hex: "#ffffff",
    names: { en: "White", de: "Weiß", fr: "Blanc", es: "Blanco", it: "Bianco", nl: "Wit", pt: "Branco", ja: "ホワイト", sv: "Vit" },
  },
  Black: {
    hex: "#111111",
    names: { en: "Black", de: "Schwarz", fr: "Noir", es: "Negro", it: "Nero", nl: "Zwart", pt: "Preto", ja: "ブラック", sv: "Svart" },
  },
  Navy: {
    hex: "#1e2a4a",
    names: { en: "Navy", de: "Marineblau", fr: "Bleu marine", es: "Azul marino", it: "Blu navy", nl: "Marineblauw", pt: "Azul-marinho", ja: "ネイビー", sv: "Marinblå" },
  },
  "Heather grey": {
    hex: "#a3a3a3",
    names: { en: "Heather grey", de: "Grau meliert", fr: "Gris chiné", es: "Gris jaspeado", it: "Grigio melange", nl: "Gemêleerd grijs", pt: "Cinza mesclado", ja: "ヘザーグレー", sv: "Gråmelerad" },
  },
  Natural: {
    hex: "#e8dcc4",
    names: { en: "Natural", de: "Natur", fr: "Naturel", es: "Natural", it: "Naturale", nl: "Naturel", pt: "Natural", ja: "ナチュラル", sv: "Natur" },
  },
  Red: {
    hex: "#c8102e",
    names: { en: "Red", de: "Rot", fr: "Rouge", es: "Rojo", it: "Rosso", nl: "Rood", pt: "Vermelho", ja: "レッド", sv: "Röd" },
  },
  "Forest green": {
    hex: "#1f4d32",
    names: { en: "Forest green", de: "Waldgrün", fr: "Vert forêt", es: "Verde bosque", it: "Verde bosco", nl: "Bosgroen", pt: "Verde floresta", ja: "フォレストグリーン", sv: "Skogsgrön" },
  },
};

const APPAREL_SIZES = ["S", "M", "L", "XL", "2XL"];
const POSTER_SIZES = ["A3", "A2"];

export interface DemoProduct {
  card: StorefrontProductCard;
  description: string;
  colour: { name: string; hex: string };
  sizes: string[];
  personalise: boolean;
  images: string[];
}

/** Minor units in USD as whole units of the language's demo currency. */
function demoMajor(minor: number, locale: Locale): number {
  const { code, rate, step } = CURRENCY[locale];
  return code === "JPY" ? Math.round((minor * rate) / step) * step : Math.round((minor / 100) * rate);
}

/** Minor units in USD as a price in the language's demo currency. */
export function demoPrice(minor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY[locale].code, maximumFractionDigits: 0 }).format(
    demoMajor(minor, locale),
  );
}

/**
 * A demo price as a store price in `currency`, minor units: the demo's own
 * figure when the store sells in the currency the demo shows for its
 * language, else converted and rounded to a whole unit.
 */
export function starterPrice(minor: number, currency: string, locale: Locale): number {
  const code = currency.toUpperCase();
  const decimals = code === "JPY" ? 0 : 2;
  if (CURRENCY[locale].code === code) return demoMajor(minor, locale) * 10 ** decimals;
  const converted = convert(minor, "USD", code);
  const step = code === "JPY" ? 100 : 10 ** decimals;
  return Math.max(step, Math.round(converted / step) * step);
}

/** Black, navy, red and green blanks carry the light-ink artwork. */
export function isDarkBlank(colour: BlankColour): boolean {
  return colour === "Black" || colour === "Navy" || colour === "Red" || colour === "Forest green";
}

/**
 * Which of the blank's two views the template's product shot shows: the
 * second product on the same blank and colour is photographed from the back,
 * so no two cards look alike.
 */
export function starterView(template: StoreTemplate, index: number): 0 | 1 {
  const item = template.products[index];
  const before = template.products
    .slice(0, index)
    .filter((p) => blankFamily(p.starter) === blankFamily(item.starter) && p.colour === item.colour).length;
  return before === 0 ? 0 : 1;
}

/**
 * The template's products, `count` of them: fewer than the template has shows
 * the first few, more repeats the range under numbered names so a page can be
 * looked at with a full catalog.
 */
export function demoProducts(template: StoreTemplate, locale: Locale, count = template.products.length): DemoProduct[] {
  const copy = templateCopy(template, locale);
  const out: DemoProduct[] = [];
  for (let n = 0; n < count; n += 1) {
    const i = n % template.products.length;
    const round = Math.floor(n / template.products.length);
    const item = template.products[i];
    const name = `${copy[`product:${i}:name`] ?? item.name}${round > 0 ? ` ${round + 1}` : ""}`;
    const colour = { name: COLOURS[item.colour].names[locale], hex: COLOURS[item.colour].hex };
    const family = blankFamily(item.starter);
    const image = template.assets.products[i] ?? "";
    const badges: StorefrontProductCard["badges"] = [];
    if (item.isNew && round === 0) badges.push("new");
    if (item.personalise) badges.push("custom");
    out.push({
      card: {
        id: `demo-${template.id}-${n}`,
        name,
        slug: slugify(name) || `product-${n + 1}`,
        price: demoPrice(item.price, locale),
        imageUrl: image || null,
        secondImageUrl: null,
        tagline: copy[`product:${i}:description`] ?? item.description,
        badges,
        swatches: [colour],
        quickAdd: null,
        tags: (item.tags ?? []).map((tag) => copy[`tag:${tag}`] ?? tag),
      },
      description: copy[`product:${i}:description`] ?? item.description,
      colour,
      sizes: family === "poster" ? POSTER_SIZES : ONE_SIZE.includes(family) ? [] : APPAREL_SIZES,
      personalise: Boolean(item.personalise),
      images: [image, template.assets.lifestyle].filter(Boolean),
    });
  }
  return out;
}

/** One collection per tag, in the order the tags first appear, pictured with the template's banner. */
export function demoCollections(template: StoreTemplate, products: DemoProduct[]): StorefrontCollection[] {
  const byTag = new Map<string, string[]>();
  for (const product of products) {
    for (const tag of product.card.tags ?? []) byTag.set(tag, [...(byTag.get(tag) ?? []), product.card.id]);
  }
  const images = [template.assets.banner, template.assets.lifestyle, template.assets.hero];
  return [...byTag].map(([name, productIds], i) => ({
    id: `col-${slugify(name) || i}`,
    handle: slugify(name) || `collection-${i + 1}`,
    name,
    productIds,
    imageUrl: images[i % images.length] || null,
  }));
}
