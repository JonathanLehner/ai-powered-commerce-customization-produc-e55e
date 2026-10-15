/**
 * Sample copy: the parts of a template's copy that make promises written for
 * the template's fictional brand rather than for the store: shipping and
 * delivery claims, order deadlines and countdown dates, and customer
 * testimonials. Applying a template records each such field's value under its
 * node's `sample` prop. The editor flags a field while it still holds that
 * value, and the publish check lists the ones left. Pure, so the editor, the
 * template builder and `npm run sample-copy-check` share it.
 */
import { PRODUCT_BLOCK_DEFS, PRODUCT_PAGE_PROP } from "./product-template";
import { SECTION_DEFS, type SectionType } from "./storefront-schema";

/** The prop a node keeps its sample fields under: field key to the value the template wrote. */
export const SAMPLE_PROP = "sample";

export type SampleFields = Record<string, string>;

/** Shipping and delivery words, in the shopper languages. */
export const SHIPPING_WORDS =
  /ship|deliver|postage|dispatch|arriv|courier|versand|liefer|livraison|livré|envío|envio|entrega|spedizion|consegn|frete|verzend|bezorg|frakt|leverans|送料|配送|お届け/i;

/** Order deadlines and dated events: a year, or an order cut-off. */
const DEADLINE_WORDS = /\b20\d\d\b|deadline|cut-?off|orders? (?:close|closes|closing)|order by|last orders?/i;

const COUNTDOWN_FIELDS = ["endsAt"];

/** Section types whose every quote, author and role is sample copy. */
const TESTIMONIALS: SectionType[] = ["Testimonial", "TestimonialCarousel"];

/** Whether a piece of a template's English copy is a claim that has to be checked before it goes live. */
export function isSampleClaim(text: string): boolean {
  return SHIPPING_WORDS.test(text) || DEADLINE_WORDS.test(text);
}

/** `feature2Title` and `feature2Body` belong together: a flagged title flags its body. */
function siblings(key: string, keys: string[]): string[] {
  const match = /^([a-z]+\d)[A-Z]/.exec(key);
  return match ? keys.filter((k) => k.startsWith(match[1])) : [key];
}

/**
 * The fields of a section (`kind: "section"`), a product page block or the
 * root's site copy that are sample copy, judged from the template's English
 * values in `props`.
 */
export function sampleKeys(
  kind: "section" | "block" | "site",
  type: string,
  props: Record<string, unknown>,
  copyKeys: string[],
): string[] {
  const out = new Set<string>();
  if (kind === "section" && type === "Countdown") {
    for (const key of [...COUNTDOWN_FIELDS, ...copyKeys]) out.add(key);
  }
  if (kind === "section" && TESTIMONIALS.includes(type as SectionType)) {
    for (const key of copyKeys) if (key !== "title") out.add(key);
  }
  for (const key of COUNTDOWN_FIELDS) if (typeof props[key] === "string" && props[key]) out.add(key);
  for (const key of copyKeys) {
    const value = props[key];
    if (typeof value === "string" && isSampleClaim(value)) for (const k of siblings(key, copyKeys)) out.add(k);
  }
  return [...out].filter((key) => typeof props[key] === "string" && String(props[key]).trim() !== "");
}

/** The sample record for `keys`, with the values the tree holds for them. */
export function sampleRecord(props: Record<string, unknown>, keys: string[]): SampleFields | undefined {
  if (keys.length === 0) return undefined;
  return Object.fromEntries(keys.map((key) => [key, String(props[key] ?? "")]));
}

function recordOf(props: Record<string, unknown>): SampleFields {
  const value = props[SAMPLE_PROP];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SampleFields) : {};
}

/** Whether a field still holds the sample value a template wrote. */
export function isSampleField(props: Record<string, unknown>, key: string): boolean {
  const sample = recordOf(props);
  return key in sample && String(props[key] ?? "") === sample[key];
}

/** The sample record without `key`, once the field has been edited or reviewed; undefined when nothing is left. */
export function withoutSample(props: Record<string, unknown>, key: string): SampleFields | undefined {
  const rest = { ...recordOf(props) };
  delete rest[key];
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** The fields of a node that still hold sample values. */
export function sampleFieldsOf(props: Record<string, unknown>): string[] {
  return Object.keys(recordOf(props)).filter((key) => isSampleField(props, key));
}

export interface SampleField {
  /** `section:<node id>:<field>`, `block:<block id>:<field>` or `site:<field>`, as translation keys are. */
  key: string;
  area: "section" | "block" | "site";
  /** The section or block type, or "site". */
  type: string;
  field: string;
  value: string;
}

type TreeNode = { type?: { resolvedName?: string }; props?: Record<string, unknown>; nodes?: string[]; hidden?: boolean };

/**
 * Every field of a page tree that still holds sample copy: the visible
 * sections top to bottom, the product page blocks, then the site copy and the
 * announcement countdown.
 */
export function sampleTreeFields(tree: unknown): SampleField[] {
  if (!tree || typeof tree !== "object") return [];
  const nodes = tree as Record<string, TreeNode>;
  const out: SampleField[] = [];
  for (const id of nodes.ROOT?.nodes ?? []) {
    const node = nodes[id];
    const type = node?.type?.resolvedName;
    if (!node || node.hidden || !type || !(type in SECTION_DEFS)) continue;
    const props = node.props ?? {};
    for (const field of sampleFieldsOf(props)) {
      out.push({ key: `section:${id}:${field}`, area: "section", type, field, value: String(props[field] ?? "") });
    }
  }
  const root = nodes.ROOT?.props ?? {};
  const blocks = root[PRODUCT_PAGE_PROP];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block.id !== "string" || !(block.type in PRODUCT_BLOCK_DEFS)) continue;
    const props = (block.props ?? {}) as Record<string, unknown>;
    for (const field of sampleFieldsOf(props)) {
      out.push({ key: `block:${block.id}:${field}`, area: "block", type: block.type, field, value: String(props[field] ?? "") });
    }
  }
  for (const field of sampleFieldsOf(root)) {
    out.push({ key: `site:${field}`, area: "site", type: "site", field, value: String(root[field] ?? "") });
  }
  return out;
}

