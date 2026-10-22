/**
 * How section edits read in the activity feeds and the audit export: section
 * types by the name the editor shows ("FAQ", "Product grid") and fields by
 * their editor label, so "q1, a1, q2, a2" reads as "2 questions and answers".
 * Pure, so `npm run audit-check` runs it directly.
 */
import { languageName } from "../i18n/display";
import { SECTION_DEFS, type SectionDef } from "./storefront-schema";
import type { AuditLog } from "./types";

function sectionDef(type: string): SectionDef | undefined {
  return Object.hasOwn(SECTION_DEFS, type) ? SECTION_DEFS[type as keyof typeof SECTION_DEFS] : undefined;
}

/** "Faq" -> "FAQ", "ProductGrid" -> "Product grid". */
export function sectionTypeName(type: string): string {
  return sectionDef(type)?.name ?? type;
}

/** "Section title" -> "title", "Button label" -> "button label", "CTA" stays. */
function lowerFirst(label: string): string {
  const text = label.replace(/^Section (?=\S)/, "");
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
}

/** A field's editor label; an image's focal point and phone copy read as the image. */
function fieldLabel(def: SectionDef | undefined, key: string): string {
  const fields = def?.fields ?? [];
  const field =
    fields.find((f) => f.key === key && !f.companion) ??
    fields.find((f) => !f.companion && (key === `${f.key}Focal` || key === `${f.key}Small`));
  return field ? lowerFirst(field.label) : humanizeKey(key);
}

function plural(noun: string): string {
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

function joinList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

interface FieldGroup {
  noun: string;
  numbers: number[];
}

/**
 * The changed fields as one phrase: "the title, subtitle and 3 questions and
 * answers". Numbered fields of the same kind are counted, and kinds changed for
 * the same items are named together.
 */
export function sectionFieldsPhrase(type: string | undefined, keys: string[]): string {
  const def = type ? sectionDef(type) : undefined;
  const order = (key: string) => {
    const at = def?.fields.findIndex((f) => f.key === key) ?? -1;
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const groups: FieldGroup[] = [];
  for (const key of [...keys].sort((a, b) => order(a) - order(b))) {
    const label = fieldLabel(def, key);
    const numbered = label.match(/^(.+?) (\d+)(?:: (.+))?$/);
    const noun = numbered ? (numbered[3] ? `${numbered[1]} ${lowerFirst(numbered[3])}` : numbered[1]) : label;
    const group = groups.find((g) => g.noun === noun && (numbered ? g.numbers.length > 0 : g.numbers.length === 0));
    if (group) {
      if (numbered && !group.numbers.includes(Number(numbered[2]))) group.numbers.push(Number(numbered[2]));
    } else {
      groups.push({ noun, numbers: numbered ? [Number(numbered[2])] : [] });
    }
  }

  const phrases: { nouns: string[]; numbers: number[] }[] = [];
  for (const group of groups) {
    const last = phrases.at(-1);
    const same = (a: number[], b: number[]) => a.length === b.length && a.every((n) => b.includes(n));
    if (last && group.numbers.length > 1 && same(last.numbers, group.numbers)) last.nouns.push(group.noun);
    else phrases.push({ nouns: [group.noun], numbers: group.numbers });
  }
  const words = phrases.map(({ nouns, numbers }) => {
    if (numbers.length === 0) return nouns[0];
    if (numbers.length === 1) {
      const [main, ...rest] = nouns[0].split(" ");
      return [main, numbers[0], ...rest].join(" ");
    }
    return `${numbers.length} ${joinList(nouns.map((noun) => plural(noun)))}`;
  });
  return phrases[0]?.numbers.length === 0 ? `the ${joinList(words)}` : joinList(words);
}

/** "Added a FAQ section to the storefront draft". */
export function sectionAddedSummary(type: string): string {
  const name = sectionTypeName(type);
  return `Added ${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} section to the storefront draft`;
}

/** "Changed the title and 3 questions and answers of the FAQ section in French". */
export function sectionChangedSummary(type: string | undefined, keys: string[], locale?: string, labelsFrom = type): string {
  const section = type ? `the ${sectionTypeName(type)} section` : "a storefront section";
  return `Changed ${sectionFieldsPhrase(labelsFrom, keys)} of ${section}${locale ? ` in ${languageName("en", locale)}` : ""}`;
}

const LEGACY_ADDED = /^Added an? (\w+) section to the storefront draft$/;
const LEGACY_CHANGED = /^Changed (\w+(?:, \w+)*) of a storefront draft section(?: in ([a-z]{2,3}(?:-[A-Za-z0-9]+)?))?$/;

/**
 * Entries written before section edits were worded this way named raw types
 * and field keys. They are reworded when read, so the feeds and the export say
 * the same as new entries do.
 */
export function readableStorefrontEntry(entry: AuditLog): AuditLog {
  if (entry.action !== "storefront.draft_edited") return entry;
  const added = entry.summary.match(LEGACY_ADDED);
  if (added && sectionDef(added[1])) return { ...entry, summary: sectionAddedSummary(added[1]) };
  const changed = entry.summary.match(LEGACY_CHANGED);
  if (!changed) return entry;
  const keys = changed[1].split(", ");
  // The type was not recorded: name it only when one section type has every field.
  const types = Object.keys(SECTION_DEFS).filter((type) => keys.every((key) => sectionDef(type)!.fields.some((f) => f.key === key)));
  const named = types.filter((type) => {
    const own = sectionDef(type)!.fields.filter((f) => f.group !== "style");
    return keys.every((key) => own.some((f) => f.key === key));
  });
  const type = named.length === 1 ? named[0] : undefined;
  return { ...entry, summary: sectionChangedSummary(type, keys, changed[2], type ?? types[0]) };
}
