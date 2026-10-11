/**
 * Names of languages, currencies and countries in the reader's language, from
 * the browser's and the server's own Intl data. Safe in client components.
 */

function displayName(locale: string, type: Intl.DisplayNamesType, code: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

/** "German" in English, "Deutsch" in German. */
export function languageName(locale: string, code: string, fallback = code): string {
  const name = displayName(locale, "language", code, fallback);
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** A storefront language option: "German · Deutsch", or just "Deutsch" when the two agree. */
export function languageOption(locale: string, code: string, endonym: string): string {
  const name = languageName(locale, code, endonym);
  return name === endonym ? name : `${name} · ${endonym}`;
}

/** "US dollar" in English, "US-Dollar" in German. */
export function currencyName(locale: string, code: string, fallback = code): string {
  const name = displayName(locale, "currency", code, fallback);
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** "Germany" in English, "Deutschland" in German. */
export function countryName(locale: string, code: string, fallback = code): string {
  return displayName(locale, "region", code, fallback);
}
