/**
 * The template library: every template with its generated assets, and the
 * copy of each in the nine shopper languages. Plain data, so the marketing
 * gallery, the editor, the Admin API and the check scripts read the same set.
 */
import { isLocale, type Locale } from "@/i18n/locales";
import { PRODUCT_BLOCK_DEFS, translatableBlockFields } from "../product-template";
import { resolveDesign, FONTS } from "../store-design";
import { SECTION_DEFS } from "../storefront-schema";
import { translatableSectionFields } from "../translations";
import ASSETS from "./assets.json";
import I18N from "./i18n.json";
import { COMPANY_TEMPLATES } from "./data/company";
import { CREATOR_TEMPLATES } from "./data/creators";
import { MUSIC_TEMPLATES } from "./data/music";
import { SPORTS_TEMPLATES } from "./data/sports";
import { TECH_TEMPLATES } from "./data/tech";
import { EVENT_TEMPLATES } from "./data/events";
import { FOOD_TEMPLATES } from "./data/food";
import { NONPROFIT_TEMPLATES } from "./data/nonprofit";
import { EDUCATION_TEMPLATES } from "./data/education";
import { ARTIST_TEMPLATES } from "./data/artists";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_STYLES,
  type StoreTemplate,
  type TemplateAssets,
  type TemplateCategory,
  type TemplateDef,
  type TemplateStyle,
  type TemplateSummary,
} from "./model";

export * from "./model";

const EMPTY_ASSETS: TemplateAssets = { hero: "", lifestyle: "", banner: "", products: [] };
const assets = ASSETS as Record<string, TemplateAssets>;
const translations = I18N as Record<string, Partial<Record<string, Record<string, string>>>>;

export const TEMPLATE_DEFS: TemplateDef[] = [
  ...COMPANY_TEMPLATES,
  ...TECH_TEMPLATES,
  ...CREATOR_TEMPLATES,
  ...MUSIC_TEMPLATES,
  ...SPORTS_TEMPLATES,
  ...EVENT_TEMPLATES,
  ...FOOD_TEMPLATES,
  ...NONPROFIT_TEMPLATES,
  ...EDUCATION_TEMPLATES,
  ...ARTIST_TEMPLATES,
];

export const TEMPLATES: StoreTemplate[] = TEMPLATE_DEFS.map((def) => ({ ...def, assets: assets[def.id] ?? EMPTY_ASSETS }));

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

export function getTemplate(id: string): StoreTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return typeof value === "string" && (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

export function isTemplateStyle(value: unknown): value is TemplateStyle {
  return typeof value === "string" && (TEMPLATE_STYLES as readonly string[]).includes(value);
}

/** Templates in gallery order, optionally narrowed to a category and a style. */
export function listTemplates(filter: { category?: TemplateCategory; style?: TemplateStyle } = {}): StoreTemplate[] {
  return TEMPLATES.filter(
    (t) => (!filter.category || t.category === filter.category) && (!filter.style || t.styles.includes(filter.style)),
  );
}

/* ------------------------------------------------------------------- copy */

/**
 * Every piece of shopper-facing copy in a template, in English, keyed the way
 * its translations are kept: `description`, `tagline`, `site:<field>`,
 * `section:<index>:<field>`, `block:<index>:<field>`, `product:<index>:name`,
 * `product:<index>:description` and `tag:<tag>`. Section and block defaults
 * the template does not override are included, so nothing stays in English.
 */
export function templateSourceCopy(def: TemplateDef): Record<string, string> {
  const out: Record<string, string> = { description: def.description, tagline: def.brand.tagline };
  for (const [key, value] of Object.entries(def.site)) if (value.trim()) out[`site:${key}`] = value;
  def.sections.forEach((section, i) => {
    const props = { ...SECTION_DEFS[section.type].defaults, ...section.props };
    for (const key of translatableSectionFields(section.type)) {
      const value = props[key];
      if (typeof value === "string" && value.trim()) out[`section:${i}:${key}`] = value;
    }
  });
  def.productPage.forEach((block, i) => {
    const props = { ...PRODUCT_BLOCK_DEFS[block.type].defaults, ...(block.props ?? {}) };
    for (const key of translatableBlockFields(block.type)) {
      const value = props[key];
      if (typeof value === "string" && value.trim()) out[`block:${i}:${key}`] = value;
    }
  });
  def.products.forEach((product, i) => {
    out[`product:${i}:name`] = product.name;
    out[`product:${i}:description`] = product.description;
    for (const tag of product.tags ?? []) out[`tag:${tag}`] = tag;
  });
  return out;
}

/** The template's copy in `locale`, falling back to English for anything not translated. */
export function templateCopy(def: TemplateDef, locale: string): Record<string, string> {
  const source = templateSourceCopy(def);
  if (locale === "en" || !isLocale(locale)) return source;
  const own = translations[def.id]?.[locale] ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) out[key] = own[key]?.trim() ? own[key] : value;
  return out;
}

/** Whether every piece of a template's copy has a translation in `locale`. */
export function templateTranslated(def: TemplateDef, locale: Locale): boolean {
  if (locale === "en") return true;
  const own = translations[def.id]?.[locale] ?? {};
  return Object.keys(templateSourceCopy(def)).every((key) => Boolean(own[key]?.trim()));
}

/* ---------------------------------------------------------------- summary */

export function templateSummary(template: StoreTemplate, locale: string = "en"): TemplateSummary {
  const design = resolveDesign({ theme: template.theme, design: template.design });
  const copy = templateCopy(template, locale);
  return {
    id: template.id,
    category: template.category,
    name: template.name,
    description: copy.description,
    styles: template.styles,
    brand: template.brand.name,
    thumbnail: template.assets.previews?.thumbnail ?? template.assets.hero,
    previews: { desktop: template.assets.previews?.desktop ?? "", mobile: template.assets.previews?.mobile ?? "" },
    colors: { primary: design.colors.primary, background: design.colors.background, text: design.colors.text },
    fonts: { heading: FONTS[design.headingFont].name, body: FONTS[design.bodyFont].name },
  };
}
