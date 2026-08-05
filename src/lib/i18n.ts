/**
 * Storefront localisation.
 *
 * A store's `defaultLanguage` decides three things on its storefront: the `lang`
 * attribute of the page, the locale money and dates are formatted for, and which
 * dictionary the built-in shopper-facing copy is read from. A language is only
 * offered in the workspace if all three exist for it — `LANGUAGE_OPTIONS` is
 * derived from this table, so the dropdown can never list a language that does
 * nothing.
 *
 * Everything here is safe in client components: dictionary values are plain
 * strings with `{placeholders}`, so a group can be passed to a client component
 * as a prop and interpolated there with `fmt`.
 */
import { de } from "./copy/de";
import { en, type StorefrontCopy } from "./copy/en";
import { es } from "./copy/es";
import { fr } from "./copy/fr";
import { it } from "./copy/it";
import { ja } from "./copy/ja";
import { nl } from "./copy/nl";
import { pt } from "./copy/pt";
import { sv } from "./copy/sv";
import { formatDate, formatDateTime, formatMoney } from "./util";

export type { StorefrontCopy };

/**
 * The languages a storefront can be run in. `tag` is the BCP-47 locale the page
 * is marked with and that `Intl` formats against — English is `en-GB` because
 * the built-in copy is written in British English ("colour", "basket").
 */
export const LANGUAGES = [
  { code: "en", tag: "en-GB", label: "English", endonym: "English" },
  { code: "de", tag: "de-DE", label: "German", endonym: "Deutsch" },
  { code: "fr", tag: "fr-FR", label: "French", endonym: "Français" },
  { code: "es", tag: "es-ES", label: "Spanish", endonym: "Español" },
  { code: "it", tag: "it-IT", label: "Italian", endonym: "Italiano" },
  { code: "nl", tag: "nl-NL", label: "Dutch", endonym: "Nederlands" },
  { code: "pt", tag: "pt-PT", label: "Portuguese", endonym: "Português" },
  { code: "ja", tag: "ja-JP", label: "Japanese", endonym: "日本語" },
  { code: "sv", tag: "sv-SE", label: "Swedish", endonym: "Svenska" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

const DICTIONARIES: Record<LanguageCode, StorefrontCopy> = { en, de, fr, es, it, nl, pt, ja, sv };

/** The workspace dropdowns read this, so they list exactly what is supported. */
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  code: l.code,
  label: l.label,
  endonym: l.endonym,
}));

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && value in DICTIONARIES;
}

/** Falls back to English so a store saved before a language was retired still renders. */
export function resolveLanguage(value: string | null | undefined): LanguageCode {
  return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

export function localeTag(language: string | null | undefined): string {
  const code = resolveLanguage(language);
  return LANGUAGES.find((l) => l.code === code)!.tag;
}

export function languageLabel(language: string | null | undefined): string {
  const code = resolveLanguage(language);
  return LANGUAGES.find((l) => l.code === code)!.label;
}

export function copyFor(language: string | null | undefined): StorefrontCopy {
  return DICTIONARIES[resolveLanguage(language)];
}

/** Fills `{placeholders}`. An unknown placeholder is left alone rather than blanked. */
export function fmt(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * Splits a template around one placeholder, for the few strings that wrap a
 * React node — the Stripe account id, for instance. Both halves keep their
 * language's word order, which an English-shaped "before {x} after" pair would
 * not.
 */
export function fmtAround(
  template: string,
  placeholder: string,
  values: Record<string, string | number> = {},
): [string, string] {
  const token = `{${placeholder}}`;
  const index = template.indexOf(token);
  if (index === -1) return [fmt(template, values), ""];
  return [
    fmt(template.slice(0, index), values),
    fmt(template.slice(index + token.length), values),
  ];
}

/* ------------------------------------------------------- localised formatting */

export function localeMoney(minor: number, currency: string, language: string): string {
  return formatMoney(minor, currency, localeTag(language));
}

export function localeDate(iso: string, language: string): string {
  return formatDate(iso, localeTag(language));
}

export function localeDateTime(iso: string, language: string): string {
  return formatDateTime(iso, localeTag(language));
}

/** Joins a list with the language's own conjunction: "a, b and c". */
export function joinList(parts: string[], conjunction: string): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${conjunction} ${parts[parts.length - 1]}`;
}

/* ---------------------------------------------------------- per-request bundle */

export interface StorefrontLocale {
  language: LanguageCode;
  /** BCP-47 tag for the `lang` attribute and `Intl`. */
  tag: string;
  t: StorefrontCopy;
  money: (minor: number, currency: string) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}

/** One call per storefront render; pass `t` subtrees down to client components. */
export function storefrontLocale(store: { defaultLanguage: string }): StorefrontLocale {
  const language = resolveLanguage(store.defaultLanguage);
  const tag = localeTag(language);
  return {
    language,
    tag,
    t: DICTIONARIES[language],
    money: (minor, currency) => formatMoney(minor, currency, tag),
    date: (iso) => formatDate(iso, tag),
    dateTime: (iso) => formatDateTime(iso, tag),
  };
}
