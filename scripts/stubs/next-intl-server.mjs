// Stand-in for "next-intl/server" in check scripts that run store operations
// outside a Next request: the same messages files, read for the locale asked.
import { readFileSync } from "node:fs";
import { createFormatter, createTranslator } from "next-intl";

const loaded = new Map();
function messages(locale) {
  if (!loaded.has(locale)) {
    loaded.set(locale, JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")));
  }
  return loaded.get(locale);
}

function options(input) {
  return typeof input === "string" ? { locale: "en", namespace: input } : { locale: "en", ...input };
}

export async function getTranslations(input = {}) {
  const { locale, namespace } = options(input);
  return createTranslator({ locale, messages: messages(locale), namespace });
}
export async function getFormatter(input = {}) {
  return createFormatter({ locale: options(input).locale });
}
export async function getMessages(input = {}) {
  return messages(options(input).locale);
}
export async function getLocale() {
  return "en";
}
export function setRequestLocale() {}
export function getRequestConfig(fn) {
  return fn;
}
