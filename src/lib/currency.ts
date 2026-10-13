/**
 * Presentment currencies: the extra currencies a store shows prices and
 * charges in, beside its shop currency (`defaultCurrency`).
 *
 * Each one has an exchange rate, automatic (the latest market rate, kept on
 * the store as `fxRates`) or set by hand, and a rounding rule that turns a
 * converted product price into a price that looks deliberate: `.00`, `.90`,
 * `.95` or `.99` for currencies with cents, whole tens or hundreds for those
 * without. Rounding always goes up, as Shopify's does, and only applies to
 * product prices; shipping, discounts and gift cards convert at the rate.
 *
 * The storefront, the basket and the order that is charged all price through
 * here, so what a shopper is shown is what Stripe charges.
 *
 * Pure: the settings form previews with it and `npm run currency-check` covers it.
 */
import { FX_TO_USD, convert } from "./pricing";
import { currencyDecimals } from "./util";

export type RateMode = "auto" | "manual";

export type RoundingRule = "none" | "0.00" | "0.90" | "0.95" | "0.99" | "10" | "100";

export const ROUNDING_RULES: readonly RoundingRule[] = ["none", "0.00", "0.90", "0.95", "0.99", "10", "100"];

export interface CurrencyRateSetting {
  mode: RateMode;
  /** Units of this currency per one unit of the shop currency, when set by hand. */
  rate: number | null;
  rounding: RoundingRule;
}

/** Market rates as units of each currency per US dollar. */
export interface FxSnapshot {
  base: "USD";
  rates: Record<string, number>;
  fetchedAt: string;
}

/** The highest manual rate accepted; anything above is a typo. */
export const MAX_MANUAL_RATE = 1_000_000;

/** Automatic rates older than this are fetched again. */
export const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The rounding rules that make sense for a currency: endings for cents, whole steps without. */
export function roundingRulesFor(currency: string): RoundingRule[] {
  return currencyDecimals(currency) > 0 ? ["none", "0.00", "0.90", "0.95", "0.99"] : ["none", "10", "100"];
}

type StoreCurrencies = {
  defaultCurrency: string;
  currencies: string[];
  currencyRates?: Partial<Record<string, CurrencyRateSetting>>;
  fxRates?: FxSnapshot | null;
};

/** How a presentment currency is priced; automatic and unrounded unless the store said otherwise. */
export function currencySettings(store: Pick<StoreCurrencies, "currencyRates">, currency: string): CurrencyRateSetting {
  const saved = store.currencyRates?.[currency];
  const rounding = saved?.rounding && roundingRulesFor(currency).includes(saved.rounding) ? saved.rounding : "none";
  const rate = saved?.rate && Number.isFinite(saved.rate) && saved.rate > 0 ? saved.rate : null;
  return { mode: saved?.mode === "manual" && rate ? "manual" : "auto", rate, rounding };
}

/** US dollars per unit of `currency` at the latest market rate, or the built-in table's when there is none. */
function usdPerUnit(store: Pick<StoreCurrencies, "fxRates">, currency: string): number {
  const live = store.fxRates?.rates[currency.toUpperCase()];
  if (live && live > 0) return 1 / live;
  return FX_TO_USD[currency.toUpperCase()] ?? 1;
}

/** The automatic rate: units of `currency` per unit of the shop currency. */
export function automaticRate(store: Pick<StoreCurrencies, "defaultCurrency" | "fxRates">, currency: string): number {
  return usdPerUnit(store, store.defaultCurrency) / usdPerUnit(store, currency);
}

/** The rate in force: units of `currency` per unit of the shop currency. */
export function presentmentRate(store: StoreCurrencies, currency: string): number {
  if (currency === store.defaultCurrency) return 1;
  const setting = currencySettings(store, currency);
  return setting.mode === "manual" && setting.rate ? setting.rate : automaticRate(store, currency);
}

const tables = new WeakMap<object, Record<string, number>>();

/**
 * US dollars per unit of every currency, as this store converts: market rates,
 * with the store's own rates for its presentment currencies. Handed to
 * `convert()` wherever a storefront amount changes currency.
 */
export function storeFxTable(store: StoreCurrencies): Record<string, number> {
  const cached = tables.get(store);
  if (cached) return cached;
  const table: Record<string, number> = { ...FX_TO_USD };
  for (const [code, perUsd] of Object.entries(store.fxRates?.rates ?? {})) {
    if (perUsd > 0) table[code] = 1 / perUsd;
  }
  const shopUsd = usdPerUnit(store, store.defaultCurrency);
  table[store.defaultCurrency] = shopUsd;
  for (const code of store.currencies) {
    if (code !== store.defaultCurrency) table[code] = shopUsd / presentmentRate(store, code);
  }
  tables.set(store, table);
  return table;
}

/** Rounds a minor-unit amount up to the rule's next price point. */
export function applyRounding(minor: number, currency: string, rule: RoundingRule): number {
  if (rule === "none" || minor <= 0) return minor;
  const factor = 10 ** currencyDecimals(currency);
  if (rule === "10" || rule === "100") {
    const step = Number(rule) * factor;
    return Math.ceil(minor / step) * step;
  }
  if (rule === "0.00") return Math.ceil(minor / factor) * factor;
  const ending = Math.round(Number(rule) * factor);
  const candidate = Math.floor(minor / factor) * factor + ending;
  return candidate >= minor ? candidate : candidate + factor;
}

/** A product price in the shopper's currency: converted at the store's rate, then rounded by its rule. */
export function presentmentPrice(store: StoreCurrencies, minor: number, from: string, to: string): number {
  if (from === to) return minor;
  const converted = convert(minor, from, to, storeFxTable(store));
  return to === store.defaultCurrency ? converted : applyRounding(converted, to, currencySettings(store, to).rounding);
}

/** Any other amount (shipping, a fixed discount, a gift card) in another currency, at the store's rate. */
export function presentmentAmount(store: StoreCurrencies, minor: number, from: string, to: string): number {
  return convert(minor, from, to, storeFxTable(store));
}

/** An amount charged in a presentment currency, back in the shop currency at the rate used. */
export function toShopAmount(store: StoreCurrencies, minor: number, currency: string): number {
  return convert(minor, currency, store.defaultCurrency, storeFxTable(store));
}

/** Whether the automatic rates should be fetched again. */
export function fxStale(store: Pick<StoreCurrencies, "fxRates">, now = Date.now(), maxAge = FX_MAX_AGE_MS): boolean {
  const fetched = store.fxRates?.fetchedAt ? Date.parse(store.fxRates.fetchedAt) : NaN;
  return !Number.isFinite(fetched) || now - fetched > maxAge;
}

/** Whether any presentment currency of the store follows the market rate. */
export function usesAutomaticRates(store: StoreCurrencies): boolean {
  return store.currencies.some((code) => code !== store.defaultCurrency && currencySettings(store, code).mode === "auto");
}

/* -------------------------------------------------------------- countries */

const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", PR: "USD", EC: "USD", SV: "USD", PA: "USD", GU: "USD", VI: "USD",
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP",
  CA: "CAD", AU: "AUD", NZ: "NZD", JP: "JPY", SG: "SGD", CH: "CHF", LI: "CHF",
  SE: "SEK", AE: "AED", BR: "BRL", IN: "INR", MX: "MXN", ZA: "ZAR",
};

const EURO_COUNTRIES = [
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
  "AD", "MC", "SM", "VA", "ME", "XK",
];
for (const code of EURO_COUNTRIES) COUNTRY_CURRENCY[code] = "EUR";

/** The currency people in a country pay in, or null when it is not known. */
export function countryCurrency(country: string | null | undefined): string | null {
  return country ? (COUNTRY_CURRENCY[country.toUpperCase()] ?? null) : null;
}

/**
 * The currency a shopper sees first: the one they picked, else their
 * country's when the store sells in it, else the shop currency.
 */
export function shopperCurrency(input: {
  chosen: string | null | undefined;
  country: string | null | undefined;
  enabled: string[];
  fallback: string;
}): string {
  if (input.chosen && input.enabled.includes(input.chosen)) return input.chosen;
  const local = countryCurrency(input.country);
  if (local && input.enabled.includes(local)) return local;
  return input.fallback;
}
