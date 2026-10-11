// The shopper copy as the app reads it, for the self-check scripts: next-intl's
// own translator and formatter over messages/<locale>.json, so a check runs the
// same lookups and ICU formatting the storefront does.
import { readFileSync } from "node:fs";
import { createFormatter, createTranslator } from "next-intl";

export const read = (locale) =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

/** `t` for `storefront.<group>` in `locale`, as `getTranslations` would return it. */
export function shopperT(locale, group) {
  return createTranslator({
    locale,
    messages: read(locale),
    namespace: group ? `storefront.${group}` : "storefront",
  });
}

export function shopperFormat(locale) {
  return createFormatter({ locale, timeZone: "UTC" });
}

/** What `emailCopy()` hands the email templates. */
export function emailCopyFor(locale) {
  return { locale, t: shopperT(locale, "email"), format: shopperFormat(locale) };
}
