/**
 * A template's demo store: its fictional brand's products and collections as
 * storefront cards, priced and labelled in the shopper's language. Nothing is
 * read from the database, so the demo pages are prerendered.
 */
import type { StorefrontCollection, StorefrontProductCard } from "@/components/storefront/kit";
import type { Locale } from "@/i18n/locales";
import { slugify } from "../util";
import { templateCopy } from "./index";
import type { BlankColour, StoreTemplate } from "./model";

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
};

const APPAREL_SIZES = ["S", "M", "L", "XL", "2XL"];

export interface DemoProduct {
  card: StorefrontProductCard;
  description: string;
  colour: { name: string; hex: string };
  sizes: string[];
  personalise: boolean;
  images: string[];
}

/** Minor units in USD as a price in the language's demo currency. */
export function demoPrice(minor: number, locale: Locale): string {
  const { code, rate, step } = CURRENCY[locale];
  const major = code === "JPY" ? Math.round((minor * rate) / step) * step : Math.round((minor / 100) * rate);
  return new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(major);
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
    const mug = item.starter === "mug" || item.starter === "blackMug";
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
      sizes: mug ? [] : APPAREL_SIZES,
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
