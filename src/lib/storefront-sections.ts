/**
 * Section-by-section edits of a storefront page tree, for the Admin API and
 * its MCP tools: list, add, update, move, duplicate and remove one section at
 * a time, with every field checked against `SECTION_DEFS`. Each edit returns a
 * new tree and leaves the one it was given alone. Kept free of server imports,
 * so the check scripts run it directly.
 */
import { SECTION_DEFS, SECTION_ORDER, treeFromSections, type CraftTree, type SectionField, type SectionType } from "./storefront-schema";
import { I18N_PROP, translatableSectionFields, withTranslation, type FieldTranslations } from "./translations";

export const SECTION_LIMIT = 40;
const TEXT_LIMIT = 300;
const LONG_TEXT_LIMIT = 4000;
const URL_LIMIT = 2000;

export type FieldValue = string | number | boolean;

/** One problem with the input, named by the input path it is about (`fields.headline`). */
export interface SectionIssue {
  field: string;
  message: string;
}

/** An edit that cannot be made, with every problem found so a caller can fix them in one go. */
export class SectionEditError extends Error {
  readonly issues: SectionIssue[];
  readonly kind: "invalid" | "not_found";

  constructor(issues: SectionIssue[], kind: "invalid" | "not_found" = "invalid") {
    super(issues.map((issue) => `\`${issue.field}\`: ${issue.message}`).join(" "));
    this.name = "SectionEditError";
    this.issues = issues;
    this.kind = kind;
  }
}

export interface SectionView {
  id: string;
  type: SectionType;
  name: string;
  /** 0 is the top of the page. */
  position: number;
  /** Every field of the type, in the default language. */
  fields: Record<string, FieldValue>;
  /** Copy per language other than the default, per field. */
  translations: Record<string, Record<string, string>>;
}

/** What each section type is and the fields it takes, for a caller choosing one. */
export function sectionTypes() {
  return SECTION_ORDER.map((type) => {
    const def = SECTION_DEFS[type];
    return {
      type,
      name: def.name,
      description: def.description,
      fields: def.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        translatable: field.type === "text" || field.type === "textarea",
        ...(field.options
          ? {
              options:
                field.key === "source"
                  ? [...field.options.map((o) => o.value), "<collection id>"]
                  : field.options.map((o) => o.value),
            }
          : {}),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.help ? { help: field.help } : {}),
        default: def.defaults[field.key],
      })),
    };
  });
}

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && value in SECTION_DEFS;
}

/** A page with no sections. */
export function emptyTree(): CraftTree {
  return treeFromSections([]);
}

function rootIds(tree: CraftTree): string[] {
  return Array.isArray(tree.ROOT?.nodes) ? tree.ROOT.nodes : [];
}

function sectionIds(tree: CraftTree): string[] {
  return rootIds(tree).filter((id) => isSectionType(tree[id]?.type?.resolvedName));
}

function translationsOf(props: Record<string, unknown>): Record<string, Record<string, string>> {
  const stored = (props[I18N_PROP] ?? {}) as FieldTranslations;
  const out: Record<string, Record<string, string>> = {};
  for (const [locale, fields] of Object.entries(stored)) {
    const values = Object.fromEntries(
      Object.entries(fields ?? {})
        .filter(([, entry]) => typeof entry?.value === "string" && entry.value.trim() !== "")
        .map(([key, entry]) => [key, entry.value]),
    );
    if (Object.keys(values).length > 0) out[locale] = values;
  }
  return out;
}

/** The page's sections, top to bottom, with stable ids. */
export function listSections(tree: CraftTree): SectionView[] {
  return sectionIds(tree).map((id, position) => {
    const node = tree[id];
    const type = node.type.resolvedName as SectionType;
    const def = SECTION_DEFS[type];
    const props = node.props ?? {};
    const fields = Object.fromEntries(
      def.fields.map((field) => [field.key, (props[field.key] ?? def.defaults[field.key]) as FieldValue]),
    );
    return { id, type, name: def.name, position, fields, translations: translationsOf(props) };
  });
}

function findSection(tree: CraftTree, sectionId: string): SectionType {
  const type = tree[sectionId]?.type?.resolvedName;
  if (!sectionIds(tree).includes(sectionId) || !isSectionType(type)) {
    throw new SectionEditError([{ field: "sectionId", message: "No section with this id on the draft. Call listStorefrontSections for the ids." }], "not_found");
  }
  return type;
}

function newSectionId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "s";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/* ---------------------------------------------------------------- fields */

export interface FieldRules {
  /** The store's collection ids, which a Product grid's `source` may name. */
  collectionIds: string[];
}

function checkField(type: SectionType, field: SectionField, value: unknown, rules: FieldRules): { value: FieldValue } | { message: string } {
  switch (field.type) {
    case "text":
    case "textarea": {
      if (typeof value !== "string") return { message: "Must be a string." };
      const limit = field.type === "text" ? TEXT_LIMIT : LONG_TEXT_LIMIT;
      if (value.length > limit) return { message: `At most ${limit} characters; this is ${value.length}.` };
      return { value };
    }
    case "toggle":
      if (typeof value !== "boolean") return { message: "Must be true or false." };
      return { value };
    case "number": {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number !== "number" || !Number.isInteger(number)) return { message: "Must be a whole number." };
      if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
        return { message: `Must be from ${field.min ?? "any"} to ${field.max ?? "any"}.` };
      }
      return { value: number };
    }
    case "url": {
      if (typeof value !== "string") return { message: "Must be a string: a URL, or empty." };
      const trimmed = value.trim();
      if (trimmed.length > URL_LIMIT) return { message: `At most ${URL_LIMIT} characters.` };
      if (trimmed !== "" && !/^https:\/\/\S+$/i.test(trimmed)) {
        return { message: "Use an https:// URL, such as one returned by uploadStorefrontImage, or an empty string." };
      }
      return { value: trimmed };
    }
    case "select": {
      if (typeof value !== "string" && typeof value !== "number") return { message: "Must be one of the options." };
      const text = String(value);
      const allowed = (field.options ?? []).map((o) => o.value);
      if (type === "ProductGrid" && field.key === "source") allowed.push(...rules.collectionIds);
      if (!allowed.includes(text)) {
        const extra = field.key === "source" ? " (a collection id from listCollections)" : "";
        return { message: `Must be one of: ${allowed.join(", ")}${extra}.` };
      }
      return { value: text };
    }
  }
}

/**
 * Checks a set of field values for a section type. Unknown keys and every
 * value that breaks its field's rule are reported together, each under
 * `fields.<key>`.
 */
export function checkFields(type: SectionType, values: Record<string, unknown>, rules: FieldRules): Record<string, FieldValue> {
  const def = SECTION_DEFS[type];
  const issues: SectionIssue[] = [];
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = def.fields.find((f) => f.key === key);
    if (!field) {
      issues.push({ field: `fields.${key}`, message: `${type} has no such field. Its fields are: ${def.fields.map((f) => f.key).join(", ")}.` });
      continue;
    }
    const checked = checkField(type, field, value, rules);
    if ("message" in checked) issues.push({ field: `fields.${key}`, message: checked.message });
    else out[key] = checked.value;
  }
  if (issues.length > 0) throw new SectionEditError(issues);
  return out;
}

/* ----------------------------------------------------------------- edits */

function clone(tree: CraftTree): CraftTree {
  return structuredClone(tree);
}

function withOrder(tree: CraftTree, ids: string[]): CraftTree {
  // Anything on the root that is not a section keeps its place after them.
  const others = rootIds(tree).filter((id) => tree[id] && !ids.includes(id) && !isSectionType(tree[id].type?.resolvedName));
  tree.ROOT.nodes = [...ids, ...others];
  return tree;
}

function checkPosition(position: number | undefined, max: number, field = "position"): number {
  if (position === undefined) return max;
  if (!Number.isInteger(position) || position < 0 || position > max) {
    throw new SectionEditError([{ field, message: `Must be a whole number from 0 to ${max}.` }]);
  }
  return position;
}

/** Adds a section of `type` at `position` (the end when left out), with its defaults under `fields`. */
export function addSection(
  tree: CraftTree,
  input: { type: SectionType; fields?: Record<string, unknown>; position?: number },
  rules: FieldRules,
): { tree: CraftTree; id: string } {
  const ids = sectionIds(tree);
  if (ids.length >= SECTION_LIMIT) {
    throw new SectionEditError([{ field: "type", message: `A page holds at most ${SECTION_LIMIT} sections. Remove one first.` }]);
  }
  const position = checkPosition(input.position, ids.length);
  const fields = checkFields(input.type, input.fields ?? {}, rules);
  const def = SECTION_DEFS[input.type];
  const next = clone(tree);
  const id = newSectionId();
  next[id] = {
    type: { resolvedName: input.type },
    isCanvas: false,
    props: { ...def.defaults, ...fields },
    displayName: def.name,
    custom: {},
    parent: "ROOT",
    hidden: false,
    nodes: [],
    linkedNodes: {},
  };
  ids.splice(position, 0, id);
  return { tree: withOrder(next, ids), id };
}

/**
 * Changes some fields of a section; the rest keep their value. With a
 * `locale` other than the default, the values are that language's copy of the
 * text fields, and an empty string clears a translation.
 */
export function updateSection(
  tree: CraftTree,
  input: { sectionId: string; fields: Record<string, unknown>; locale?: string; defaultLocale: string },
  rules: FieldRules,
): CraftTree {
  const type = findSection(tree, input.sectionId);
  if (Object.keys(input.fields).length === 0) {
    throw new SectionEditError([{ field: "fields", message: "Name at least one field to change." }]);
  }
  const fields = checkFields(type, input.fields, rules);
  const next = clone(tree);
  const node = next[input.sectionId];
  node.props = { ...(node.props ?? {}) };

  if (!input.locale || input.locale === input.defaultLocale) {
    Object.assign(node.props, fields);
    return next;
  }

  const translatable = translatableSectionFields(type);
  const wrong = Object.keys(fields).filter((key) => !translatable.includes(key));
  if (wrong.length > 0) {
    throw new SectionEditError(
      wrong.map((key) => ({
        field: `fields.${key}`,
        message: `Only text fields are translated (${translatable.join(", ")}). Change this one without a locale.`,
      })),
    );
  }
  let translations = node.props[I18N_PROP] as FieldTranslations | undefined;
  for (const [key, value] of Object.entries(fields)) {
    translations = withTranslation(translations, input.locale, key, String(value));
  }
  node.props[I18N_PROP] = translations;
  return next;
}

/** Moves a section to `position`, 0 being the top. */
export function moveSection(tree: CraftTree, input: { sectionId: string; position: number }): CraftTree {
  findSection(tree, input.sectionId);
  const ids = sectionIds(tree).filter((id) => id !== input.sectionId);
  const position = checkPosition(input.position, ids.length);
  ids.splice(position, 0, input.sectionId);
  return withOrder(clone(tree), ids);
}

/** Copies a section, translations included, to just below it. */
export function duplicateSection(tree: CraftTree, input: { sectionId: string }): { tree: CraftTree; id: string } {
  findSection(tree, input.sectionId);
  const ids = sectionIds(tree);
  if (ids.length >= SECTION_LIMIT) {
    throw new SectionEditError([{ field: "sectionId", message: `A page holds at most ${SECTION_LIMIT} sections. Remove one first.` }]);
  }
  const next = clone(tree);
  const id = newSectionId();
  next[id] = structuredClone(next[input.sectionId]);
  ids.splice(ids.indexOf(input.sectionId) + 1, 0, id);
  return { tree: withOrder(next, ids), id };
}

/** Takes a section off the page. */
export function removeSection(tree: CraftTree, input: { sectionId: string }): CraftTree {
  findSection(tree, input.sectionId);
  const next = clone(tree);
  delete next[input.sectionId];
  return withOrder(next, sectionIds(tree).filter((id) => id !== input.sectionId));
}
