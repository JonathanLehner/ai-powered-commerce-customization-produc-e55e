/**
 * Store content in more than one language.
 *
 * What a store's people write (section copy, the site header and footer,
 * product names and descriptions, gift portal intros) is kept in the store's
 * default language as the source, with a translation per enabled language
 * beside it. A field with no translation falls back to the source, so a shopper
 * never sees an empty heading. Kept free of server imports: the editor, the
 * live pages and the check scripts all read it.
 */
import { SECTION_DEFS, type SectionType } from "./storefront-schema";

/** One translated field. `machine` is set by "Translate missing" until a person saves it. */
export interface TranslatedText {
  value: string;
  machine?: boolean;
}

/** Translations per language, then per field key. */
export type FieldTranslations = Partial<Record<string, Record<string, TranslatedText>>>;

export type TranslationState = "source" | "translated" | "machine" | "missing";

/** The stored translation of a field, or null when there is none. */
export function translationOf(
  translations: FieldTranslations | undefined | null,
  locale: string,
  key: string,
): TranslatedText | null {
  const entry = translations?.[locale]?.[key];
  return entry && typeof entry.value === "string" && entry.value.trim() !== "" ? entry : null;
}

/** The text a shopper reads: the translation when there is one, else the source. */
export function localized(
  source: string,
  translations: FieldTranslations | undefined | null,
  locale: string,
  defaultLocale: string,
  key: string,
): string {
  if (locale === defaultLocale) return source;
  return translationOf(translations, locale, key)?.value ?? source;
}

/** What the editor shows beside a field in a language. */
export function translationState(
  source: string,
  translations: FieldTranslations | undefined | null,
  locale: string,
  defaultLocale: string,
  key: string,
): TranslationState {
  if (locale === defaultLocale) return "source";
  const entry = translationOf(translations, locale, key);
  if (entry) return entry.machine ? "machine" : "translated";
  // Nothing written in the source means nothing to translate.
  return source.trim() === "" ? "source" : "missing";
}

/** Sets or clears one translation, returning a new object. */
export function withTranslation(
  translations: FieldTranslations | undefined | null,
  locale: string,
  key: string,
  value: string,
  machine = false,
): FieldTranslations {
  const next: FieldTranslations = { ...(translations ?? {}) };
  const forLocale = { ...(next[locale] ?? {}) };
  if (value.trim() === "") delete forLocale[key];
  else forLocale[key] = machine ? { value, machine: true } : { value };
  next[locale] = forLocale;
  return next;
}

/* ---------------------------------------------------------------- sections */

/** The prop a Craft node keeps its translations under. */
export const I18N_PROP = "i18n";

/** The copy fields of a section type: text and long text, never links, tones or numbers. */
export function translatableSectionFields(type: SectionType): string[] {
  return SECTION_DEFS[type].fields.filter((f) => f.type === "text" || f.type === "textarea").map((f) => f.key);
}

/** A section's props with its copy in `locale`, falling back to the source. */
export function localizeSectionProps(
  type: SectionType,
  props: Record<string, unknown>,
  locale: string,
  defaultLocale: string,
): Record<string, unknown> {
  if (locale === defaultLocale) return props;
  const translations = props[I18N_PROP] as FieldTranslations | undefined;
  const out = { ...props };
  for (const key of translatableSectionFields(type)) {
    out[key] = localized(String(props[key] ?? ""), translations, locale, defaultLocale, key);
  }
  return out;
}

/* ------------------------------------------------------- header and footer */

/**
 * The site-wide copy around the sections: the announcement bar, the header's
 * navigation labels and the footer note. Kept on the page's root node, so it
 * is drafted, versioned and published with the sections.
 */
export const SITE_FIELDS = [
  { key: "announcement", type: "text" },
  { key: "navShop", type: "text" },
  { key: "navOrders", type: "text" },
  { key: "footerNote", type: "textarea" },
] as const;

export type SiteFieldKey = (typeof SITE_FIELDS)[number]["key"];
export type SiteContent = Record<SiteFieldKey, string>;

function rootProps(tree: unknown): Record<string, unknown> {
  if (!tree || typeof tree !== "object") return {};
  const root = (tree as Record<string, { props?: Record<string, unknown> }>).ROOT;
  return root?.props ?? {};
}

/** The site copy of a page tree in `locale`. Empty strings mean "use the built-in label" or "hide". */
export function siteContent(tree: unknown, locale: string, defaultLocale: string): SiteContent {
  const props = rootProps(tree);
  const translations = props[I18N_PROP] as FieldTranslations | undefined;
  const out = {} as SiteContent;
  for (const { key } of SITE_FIELDS) {
    out[key] = localized(String(props[key] ?? ""), translations, locale, defaultLocale, key);
  }
  return out;
}

/* ---------------------------------------------------------------- products */

interface TranslatableProduct {
  name: string;
  description: string;
  shopperCustomization: { textLine: boolean; textLabel: string };
  tags?: string[];
  variants: { colour: string; name: string }[];
  mockups?: { colour?: string | null }[];
  translations?: FieldTranslations;
}

/** The key a colour's label is translated under. */
export function colourKey(colour: string): string {
  return `colour:${colour.replace(/\./g, "_")}`;
}

/** The key a tag's label is translated under. */
export function tagKey(tag: string): string {
  return `tag:${tag.replace(/\./g, "_")}`;
}

/** Every field of a product a shopper reads, with its source text. */
export function productFields(product: TranslatableProduct): { key: string; source: string; long?: boolean }[] {
  const fields: { key: string; source: string; long?: boolean }[] = [
    { key: "name", source: product.name },
    { key: "description", source: product.description, long: true },
  ];
  if (product.shopperCustomization.textLine && product.shopperCustomization.textLabel) {
    fields.push({ key: "textLabel", source: product.shopperCustomization.textLabel });
  }
  for (const colour of [...new Set(product.variants.map((v) => v.colour))]) {
    if (colour) fields.push({ key: colourKey(colour), source: colour });
  }
  for (const tag of product.tags ?? []) {
    if (tag) fields.push({ key: tagKey(tag), source: tag });
  }
  return fields;
}

/**
 * The product as a shopper reads it in `locale`. Colours are relabelled on the
 * variants and the mockups alike, because the product page matches one to the
 * other by colour.
 */
export function localizeProduct<P extends TranslatableProduct>(product: P, locale: string, defaultLocale: string): P {
  if (locale === defaultLocale || !product.translations?.[locale]) return product;
  const tr = product.translations;
  const colour = (c: string) => (c ? localized(c, tr, locale, defaultLocale, colourKey(c)) : c);
  return {
    ...product,
    name: localized(product.name, tr, locale, defaultLocale, "name"),
    description: localized(product.description, tr, locale, defaultLocale, "description"),
    shopperCustomization: {
      ...product.shopperCustomization,
      textLabel: localized(product.shopperCustomization.textLabel, tr, locale, defaultLocale, "textLabel"),
    },
    variants: product.variants.map((v) => ({
      ...v,
      colour: colour(v.colour),
      name: v.colour ? v.name.replace(v.colour, colour(v.colour)) : v.name,
    })),
    mockups: product.mockups?.map((m) => (m.colour ? { ...m, colour: colour(m.colour) } : m)),
    // The shop's tag filter reads and links the translated label, so it still matches.
    tags: product.tags?.map((tag) => localized(tag, tr, locale, defaultLocale, tagKey(tag))),
  };
}

/* -------------------------------------------------------------- gift portals */

/** A gift portal's intro in `locale`. */
export function localizedIntro(
  catalogue: { intro: string; translations?: FieldTranslations },
  locale: string,
  defaultLocale: string,
): string {
  return localized(catalogue.intro, catalogue.translations, locale, defaultLocale, "intro");
}

/* ---------------------------------------------------------- page trees */

type TreeNode = { type?: { resolvedName?: string }; props?: Record<string, unknown>; nodes?: string[] };

/**
 * The copy in a page tree that has a source but no translation in `locale`,
 * keyed `section:<node id>:<field>` and `site:<field>`.
 */
export function missingTreeFields(tree: unknown, locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tree || typeof tree !== "object") return out;
  const nodes = tree as Record<string, TreeNode>;
  const visit = (prefix: string, props: Record<string, unknown>, keys: string[]) => {
    const translations = props[I18N_PROP] as FieldTranslations | undefined;
    for (const key of keys) {
      const source = String(props[key] ?? "");
      if (source.trim() !== "" && !translationOf(translations, locale, key)) out[`${prefix}${key}`] = source;
    }
  };
  visit("site:", nodes.ROOT?.props ?? {}, SITE_FIELDS.map((f) => f.key));
  for (const id of nodes.ROOT?.nodes ?? []) {
    const type = nodes[id]?.type?.resolvedName;
    if (type && type in SECTION_DEFS) {
      visit(`section:${id}:`, nodes[id].props ?? {}, translatableSectionFields(type as SectionType));
    }
  }
  return out;
}

/**
 * The tree with `values` (keyed as `missingTreeFields` keys them) written in as
 * translations. A field that already has a translation keeps it.
 */
export function applyTreeTranslations(
  tree: Record<string, unknown>,
  locale: string,
  values: Record<string, string>,
  machine: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...tree };
  for (const [path, value] of Object.entries(values)) {
    const parts = path.split(":");
    const [id, key] = parts[0] === "site" ? ["ROOT", parts[1]] : [parts[1], parts[2]];
    const node = next[id] as TreeNode | undefined;
    if (!node || !key) continue;
    const props = { ...(node.props ?? {}) };
    const translations = props[I18N_PROP] as FieldTranslations | undefined;
    if (translationOf(translations, locale, key)) continue;
    props[I18N_PROP] = withTranslation(translations, locale, key, value, machine);
    next[id] = { ...node, props };
  }
  return next;
}

/** Product fields with a source and no translation in `locale`. */
export function missingProductFields(
  product: Parameters<typeof productFields>[0],
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of productFields(product)) {
    if (field.source.trim() !== "" && !translationOf(product.translations, locale, field.key)) {
      out[field.key] = field.source;
    }
  }
  return out;
}
