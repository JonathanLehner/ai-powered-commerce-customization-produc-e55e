/**
 * A template as a storefront page tree: its sections, product page, header and
 * footer settings, site copy and design, with the copy written in the store's
 * default language and translated into its other languages. Pure, so the
 * demo storefront, the editor and the apply operation build the same tree.
 */
import { PRODUCT_PAGE_PROP, PRODUCT_BLOCK_DEFS, translatableBlockFields } from "../product-template";
import { LAYOUT_DEFAULTS } from "../storefront-layout";
import { SECTION_DEFS, treeFromSections, type CraftTree, type SectionType } from "../storefront-schema";
import { I18N_PROP, SITE_FIELDS, translatableSectionFields, type FieldTranslations } from "../translations";
import { SAMPLE_PROP, sampleKeys, sampleRecord } from "../sample-copy";
import type { StoreDesign } from "../store-design";
import type { ThemeKey } from "../types";
import { templateCopy } from "./index";
import type { StoreTemplate } from "./model";

/** The root prop a drafted design is kept under: the preset and tokens that go live on publish. */
export const DRAFT_DESIGN_PROP = "design";
/** The root prop naming the template the draft was last built from. */
export const TEMPLATE_PROP = "templateId";

export interface DraftDesign {
  theme: ThemeKey;
  design: StoreDesign;
}

const DAY = 86_400_000;

/** `@soon` as a date twelve days out, at 18:00 UTC, so countdowns in a template always have time left. */
function soon(now: number): string {
  const at = new Date(now + 12 * DAY);
  at.setUTCHours(18, 0, 0, 0);
  return at.toISOString();
}

/** A template's image token as a URL. Unknown tokens become empty, which hides the image. */
export function templateImage(template: StoreTemplate, value: string): string {
  if (!value.startsWith("@")) return value;
  const { assets } = template;
  if (value === "@hero") return assets.hero;
  if (value === "@lifestyle") return assets.lifestyle;
  if (value === "@banner") return assets.banner;
  const extra = /^@extra(\d)$/.exec(value);
  if (extra) return assets.extra?.[Number(extra[1]) - 1] ?? "";
  const product = /^@product(\d)$/.exec(value);
  return product ? (assets.products[Number(product[1]) - 1] ?? "") : "";
}

function resolveProps(template: StoreTemplate, props: Record<string, string | number | boolean>, now: number) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "string") out[key] = value;
    else if (value === "@soon") out[key] = soon(now);
    else out[key] = templateImage(template, value);
  }
  return out;
}

/** The copy of `keys` in `source`, plus their translations in `others`, from a template's copy tables. */
function localize(
  props: Record<string, unknown>,
  prefix: string,
  keys: string[],
  tables: Record<string, Record<string, string>>,
  source: string,
  others: string[],
): Record<string, unknown> {
  const out = { ...props };
  const translations: FieldTranslations = {};
  for (const key of keys) {
    const path = `${prefix}${key}`;
    const text = tables[source][path];
    if (text === undefined) continue;
    out[key] = text;
    for (const locale of others) {
      const value = tables[locale][path];
      if (value && value !== text) translations[locale] = { ...(translations[locale] ?? {}), [key]: { value } };
    }
  }
  if (Object.keys(translations).length > 0) out[I18N_PROP] = translations;
  return out;
}

export interface TemplateTreeOptions {
  /** The language the copy is written in: the store's default. */
  sourceLocale: string;
  /** Every language the copy is translated into, the source included or not. */
  locales: string[];
  /** The store's own name, written over the template's fictional brand in the copy. */
  brandName?: string;
  now?: number;
}

/** The template's tree, ready to be a store's draft or a demo page. */
export function templateTree(template: StoreTemplate, options: TemplateTreeOptions): CraftTree {
  const now = options.now ?? Date.now();
  const source = options.sourceLocale;
  const others = [...new Set(options.locales)].filter((l) => l !== source);
  const rename = (text: string) => (options.brandName ? text.split(template.brand.name).join(options.brandName) : text);
  const tables = Object.fromEntries(
    [source, ...others].map((locale) => [
      locale,
      Object.fromEntries(Object.entries(templateCopy(template, locale)).map(([key, text]) => [key, rename(text)])),
    ]),
  );

  // Shipping claims, deadlines, countdowns and testimonials are written for
  // the template's brand: each is flagged as sample copy, judged from the
  // English, with the value it is written in here.
  const flagSample = (props: Record<string, unknown>, keys: string[]) => {
    const sample = sampleRecord(props, keys);
    return sample ? { ...props, [SAMPLE_PROP]: sample } : props;
  };

  const sections = template.sections.map((section, i) => {
    const copyKeys = translatableSectionFields(section.type);
    const english = { ...SECTION_DEFS[section.type].defaults, ...section.props };
    const props = localize(
      { ...SECTION_DEFS[section.type].defaults, ...resolveProps(template, section.props, now) },
      `section:${i}:`,
      copyKeys,
      tables,
      source,
      others,
    );
    return { type: section.type as SectionType, props: flagSample(props, sampleKeys("section", section.type, english, copyKeys)) };
  });

  const blocks = template.productPage.map((block, i) => {
    const copyKeys = translatableBlockFields(block.type);
    const english = { ...PRODUCT_BLOCK_DEFS[block.type].defaults, ...(block.props ?? {}) };
    const props = localize(english, `block:${i}:`, copyKeys, tables, source, others);
    return {
      id: `b${template.id.replace(/[^a-z0-9]/g, "")}${i}`,
      type: block.type,
      props: flagSample(props, sampleKeys("block", block.type, english, copyKeys)),
    };
  });

  const siteKeys = SITE_FIELDS.map((f) => f.key as string);
  const emptySite = Object.fromEntries(siteKeys.map((key) => [key, ""]));
  const site = localize({ ...emptySite }, "site:", siteKeys, tables, source, others);
  const siteSample = sampleKeys("site", "site", { ...emptySite, ...template.site }, siteKeys);

  const root: Record<string, unknown> = {
    ...LAYOUT_DEFAULTS,
    ...template.layout,
    collectionColumns: template.collection.columns,
    collectionHeader: template.collection.header,
    ...site,
    [PRODUCT_PAGE_PROP]: blocks,
    [DRAFT_DESIGN_PROP]: { theme: template.theme, design: template.design } satisfies DraftDesign,
    [TEMPLATE_PROP]: template.id,
  };
  if (template.layout.announcementCountdown === "@soon") root.announcementCountdown = soon(now);
  const rootSample = sampleRecord(root, [...siteSample, ...(root.announcementCountdown ? ["announcementCountdown"] : [])]);
  if (rootSample) root[SAMPLE_PROP] = rootSample;
  return treeFromSections(sections, root);
}

/** The drafted design a page tree carries, or null when it carries none. */
export function draftDesign(tree: unknown): DraftDesign | null {
  if (!tree || typeof tree !== "object") return null;
  const value = (tree as Record<string, { props?: Record<string, unknown> }>).ROOT?.props?.[DRAFT_DESIGN_PROP];
  if (!value || typeof value !== "object") return null;
  const { theme, design } = value as Partial<DraftDesign>;
  if (theme !== "atelier" && theme !== "meridian" && theme !== "graphite" && theme !== "bloom") return null;
  return { theme, design: design && typeof design === "object" ? design : {} };
}

/** The template a page tree was built from, if any. */
export function treeTemplateId(tree: unknown): string | null {
  if (!tree || typeof tree !== "object") return null;
  const value = (tree as Record<string, { props?: Record<string, unknown> }>).ROOT?.props?.[TEMPLATE_PROP];
  return typeof value === "string" ? value : null;
}
