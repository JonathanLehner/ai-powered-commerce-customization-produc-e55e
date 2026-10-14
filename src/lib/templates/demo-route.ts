import { isLocale, LOCALES, type Locale } from "@/i18n/locales";
import { demoCollections, demoProducts } from "./demo";
import { getTemplate, TEMPLATES } from "./index";

/** Every template in every language: the demo pages are all prerendered. */
export function demoParams() {
  return TEMPLATES.flatMap((t) => LOCALES.map((lang) => ({ template: t.id, lang })));
}

/** The template, language, address and catalog a demo page is drawn from; null for an address that names none. */
export function demoFor(params: { template: string; lang: string }, count?: number) {
  const template = getTemplate(params.template);
  if (!template || !isLocale(params.lang)) return null;
  const locale: Locale = params.lang;
  const base = `/demo/${template.id}/${locale}`;
  const products = demoProducts(template, locale, count);
  const collections = demoCollections(template, products);
  return { template, locale, base, products, collections, brand: { name: template.brand.name, logoUrl: null } };
}
