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
import { PRODUCT_BLOCK_DEFS, PRODUCT_PAGE_PROP, translatableBlockFields, type ProductBlockType } from "./product-template";
import { SECTION_DEFS, type SectionType } from "./storefront-schema";

/** One translated field. `machine` is set by "Translate missing" until a person saves it. */
export interface TranslatedText {
  value: string;
  machine?: boolean;
  /** The source text it translates; once the source reads differently, the translation is out of date. */
  from?: string;
  /** The source changed after it was translated. Set on translations saved without `from`. */
  stale?: boolean;
}

/** Translations per language, then per field key. */
export type FieldTranslations = Partial<Record<string, Record<string, TranslatedText>>>;

export type TranslationState = "source" | "translated" | "machine" | "stale" | "missing";

/** The stored translation of a field, or null when there is none. */
export function translationOf(
  translations: FieldTranslations | undefined | null,
  locale: string,
  key: string,
): TranslatedText | null {
  const entry = translations?.[locale]?.[key];
  return entry && typeof entry.value === "string" && entry.value.trim() !== "" ? entry : null;
}

/** Whether a translation no longer matches its source. */
export function isOutdated(entry: TranslatedText, source: string): boolean {
  return entry.stale === true || (entry.from !== undefined && entry.from !== source);
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
  if (entry) return isOutdated(entry, source) ? "stale" : entry.machine ? "machine" : "translated";
  // Nothing written in the source means nothing to translate.
  return source.trim() === "" ? "source" : "missing";
}

/** Sets or clears one translation of the source text `from`, returning a new object. */
export function withTranslation(
  translations: FieldTranslations | undefined | null,
  locale: string,
  key: string,
  value: string,
  machine = false,
  from?: string,
): FieldTranslations {
  const next: FieldTranslations = { ...(translations ?? {}) };
  const forLocale = { ...(next[locale] ?? {}) };
  if (value.trim() === "") delete forLocale[key];
  else forLocale[key] = { value, ...(machine ? { machine: true } : {}), ...(from !== undefined ? { from } : {}) };
  next[locale] = forLocale;
  return next;
}

/**
 * The translations after the source of `key` changed: every language's
 * translation that does not record its source is marked out of date. Those
 * that do are worked out from `from` and need no mark.
 */
export function withSourceChanged(translations: FieldTranslations | undefined | null, key: string): FieldTranslations | undefined {
  if (!translations) return undefined;
  const next: FieldTranslations = { ...translations };
  for (const [locale, fields] of Object.entries(translations)) {
    const entry = fields?.[key];
    if (entry && entry.from === undefined && !entry.stale) next[locale] = { ...fields, [key]: { ...entry, stale: true } };
  }
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

/** A product page block's props with its copy in `locale`, falling back to the source. */
export function localizeBlockProps(
  type: ProductBlockType,
  props: Record<string, unknown>,
  locale: string,
  defaultLocale: string,
): Record<string, unknown> {
  if (locale === defaultLocale) return props;
  const translations = props[I18N_PROP] as FieldTranslations | undefined;
  const out = { ...props };
  for (const key of translatableBlockFields(type)) {
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
  { key: "announcement2", type: "text" },
  { key: "announcement3", type: "text" },
  { key: "navShop", type: "text" },
  { key: "navOrders", type: "text" },
  { key: "footerNote", type: "textarea" },
  { key: "newsletterHeading", type: "text" },
  { key: "newsletterBody", type: "textarea" },
] as const;

/**
 * The store's title and description for search results and share previews.
 * Kept on the root node beside the site copy, so they are translated, drafted
 * and published the same way. Empty means the built-in default.
 */
export const SEO_FIELDS = [
  { key: "metaTitle", type: "text" },
  { key: "metaDescription", type: "textarea" },
] as const;

/** Every copy field on the root node. */
const ROOT_FIELDS = [...SITE_FIELDS, ...SEO_FIELDS];

export type SiteFieldKey = (typeof ROOT_FIELDS)[number]["key"];
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
  for (const { key } of ROOT_FIELDS) {
    out[key] = localized(String(props[key] ?? ""), translations, locale, defaultLocale, key);
  }
  return out;
}

/* ---------------------------------------------------------------- products */

interface TranslatableProduct {
  name: string;
  description: string;
  seoTitle?: string;
  seoDescription?: string;
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
    // Offered even with no source: a language can have its own search title.
    { key: "seoTitle", source: product.seoTitle ?? "" },
    { key: "seoDescription", source: product.seoDescription ?? "", long: true },
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
    seoTitle: localized(product.seoTitle ?? "", tr, locale, defaultLocale, "seoTitle"),
    seoDescription: localized(product.seoDescription ?? "", tr, locale, defaultLocale, "seoDescription"),
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

/** Calls `visit` with the props and copy fields of the site copy, each section and each product page block. */
function eachCopyHolder(tree: unknown, visit: (prefix: string, props: Record<string, unknown>, keys: string[]) => void) {
  if (!tree || typeof tree !== "object") return;
  const nodes = tree as Record<string, TreeNode>;
  visit("site:", nodes.ROOT?.props ?? {}, ROOT_FIELDS.map((f) => f.key));
  for (const id of nodes.ROOT?.nodes ?? []) {
    const type = nodes[id]?.type?.resolvedName;
    if (type && type in SECTION_DEFS) {
      visit(`section:${id}:`, nodes[id].props ?? {}, translatableSectionFields(type as SectionType));
    }
  }
  const blocks = nodes.ROOT?.props?.[PRODUCT_PAGE_PROP];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block && typeof block.id === "string" && block.type in PRODUCT_BLOCK_DEFS) {
      visit(`block:${block.id}:`, block.props ?? {}, translatableBlockFields(block.type));
    }
  }
}

/** Copy in a page tree with a source, by `state` of its translation in `locale`. */
function treeFieldsIn(tree: unknown, locale: string, state: "missing" | "stale"): Record<string, string> {
  const out: Record<string, string> = {};
  eachCopyHolder(tree, (prefix, props, keys) => {
    const translations = props[I18N_PROP] as FieldTranslations | undefined;
    for (const key of keys) {
      const source = String(props[key] ?? "");
      if (source.trim() === "") continue;
      const entry = translationOf(translations, locale, key);
      if (state === "missing" ? !entry : entry && isOutdated(entry, source)) out[`${prefix}${key}`] = source;
    }
  });
  return out;
}

/**
 * The copy in a page tree that has a source but no translation in `locale`,
 * keyed `section:<node id>:<field>`, `site:<field>` and, for the product page
 * template, `block:<block id>:<field>`.
 */
export function missingTreeFields(tree: unknown, locale: string): Record<string, string> {
  return treeFieldsIn(tree, locale, "missing");
}

/** The copy in a page tree whose translation in `locale` no longer matches its source, keyed as `missingTreeFields`. */
export function outdatedTreeFields(tree: unknown, locale: string): Record<string, string> {
  return treeFieldsIn(tree, locale, "stale");
}

/**
 * `after` with the translations of every copy field whose source differs from
 * `before` marked out of date, unless the same edit rewrote that translation.
 * Sections and blocks are matched by id. Used wherever a draft is saved, so an
 * edit in any language, by the editor or the API, leaves the other languages
 * showing what needs a new translation.
 */
export function markOutdatedTranslations<T extends Record<string, unknown>>(before: unknown, after: T): T {
  if (!before || typeof before !== "object") return after;
  const old = new Map<string, Record<string, unknown>>();
  eachCopyHolder(before, (prefix, props) => old.set(prefix, props));
  const changed = new Map<string, FieldTranslations | undefined>();
  eachCopyHolder(after, (prefix, props, keys) => {
    const previous = old.get(prefix);
    if (!previous) return;
    let translations = props[I18N_PROP] as FieldTranslations | undefined;
    const previousTranslations = previous[I18N_PROP] as FieldTranslations | undefined;
    for (const key of keys) {
      if (!translations || String(props[key] ?? "") === String(previous[key] ?? "")) continue;
      for (const [locale, fields] of Object.entries(translations)) {
        const entry = fields?.[key];
        // A translation this same edit wrote is the new one, not out of date.
        if (!entry || entry.from !== undefined || entry.stale) continue;
        if (JSON.stringify(entry) !== JSON.stringify(previousTranslations?.[locale]?.[key])) continue;
        translations = { ...translations, [locale]: { ...fields, [key]: { ...entry, stale: true } } };
      }
    }
    if (translations !== props[I18N_PROP]) changed.set(prefix, translations);
  });
  if (changed.size === 0) return after;
  const next: Record<string, unknown> = { ...after };
  for (const [prefix, translations] of changed) {
    const [kind, id] = prefix.split(":");
    if (kind === "site") {
      const root = next.ROOT as TreeNode;
      next.ROOT = { ...root, props: { ...(root.props ?? {}), [I18N_PROP]: translations } };
    } else if (kind === "section") {
      const node = next[id] as TreeNode;
      next[id] = { ...node, props: { ...(node.props ?? {}), [I18N_PROP]: translations } };
    }
  }
  const blockChanges = [...changed].filter(([prefix]) => prefix.startsWith("block:"));
  if (blockChanges.length > 0) {
    const current = next.ROOT as TreeNode;
    const blocks = current.props?.[PRODUCT_PAGE_PROP] as { id: string; props?: Record<string, unknown> }[];
    next.ROOT = {
      ...current,
      props: {
        ...(current.props ?? {}),
        [PRODUCT_PAGE_PROP]: blocks.map((block) => {
          const hit = changed.get(`block:${block.id}:`);
          return hit ? { ...block, props: { ...(block.props ?? {}), [I18N_PROP]: hit } } : block;
        }),
      },
    };
  }
  return next as T;
}

/**
 * The tree with `values` (keyed as `missingTreeFields` keys them) written in as
 * translations of the current source. A field whose translation is up to date
 * keeps it; a missing or out of date one is replaced.
 */
export function applyTreeTranslations(
  tree: Record<string, unknown>,
  locale: string,
  values: Record<string, string>,
  machine: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...tree };
  const upToDate = (translations: FieldTranslations | undefined, key: string, source: string) => {
    const entry = translationOf(translations, locale, key);
    return entry !== null && !isOutdated(entry, source);
  };
  for (const [path, value] of Object.entries(values)) {
    const parts = path.split(":");
    if (parts[0] === "block") {
      const root = next.ROOT as TreeNode | undefined;
      const blocks = root?.props?.[PRODUCT_PAGE_PROP];
      if (!root || !Array.isArray(blocks)) continue;
      const updated = blocks.map((block: { id: string; props?: Record<string, unknown> }) => {
        if (block?.id !== parts[1]) return block;
        const translations = block.props?.[I18N_PROP] as FieldTranslations | undefined;
        const source = String(block.props?.[parts[2]] ?? "");
        if (upToDate(translations, parts[2], source)) return block;
        return { ...block, props: { ...(block.props ?? {}), [I18N_PROP]: withTranslation(translations, locale, parts[2], value, machine, source) } };
      });
      next.ROOT = { ...root, props: { ...(root.props ?? {}), [PRODUCT_PAGE_PROP]: updated } };
      continue;
    }
    const [id, key] = parts[0] === "site" ? ["ROOT", parts[1]] : [parts[1], parts[2]];
    const node = next[id] as TreeNode | undefined;
    if (!node || !key) continue;
    const props = { ...(node.props ?? {}) };
    const translations = props[I18N_PROP] as FieldTranslations | undefined;
    const source = String(props[key] ?? "");
    if (upToDate(translations, key, source)) continue;
    props[I18N_PROP] = withTranslation(translations, locale, key, value, machine, source);
    next[id] = { ...node, props };
  }
  return next;
}

/** Product fields with a source and no up to date translation in `locale`. */
export function missingProductFields(
  product: Parameters<typeof productFields>[0],
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of productFields(product)) {
    const entry = translationOf(product.translations, locale, field.key);
    if (field.source.trim() !== "" && (!entry || isOutdated(entry, field.source))) {
      out[field.key] = field.source;
    }
  }
  return out;
}
