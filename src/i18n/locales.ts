/**
 * The languages Parcelith's own interface is offered in: the same nine the
 * storefronts support. Kept free of imports so the proxy's route table and the
 * check scripts can read it.
 */
export const LOCALES = ["en", "de", "fr", "es", "it", "nl", "pt", "ja", "sv"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Each language in its own name, for the switcher and the language preference. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pt: "Português",
  ja: "日本語",
  sv: "Svenska",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The pages with a translated copy at `/<locale>/…`. English stays at the root. */
export const MARKETING_PATHS = [
  "/",
  "/how-it-works",
  "/pricing",
  "/contact",
  "/legal/terms",
  "/legal/privacy",
] as const;

/** The address of a marketing page in a language: `/pricing`, `/de/pricing`, `/de`. */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
