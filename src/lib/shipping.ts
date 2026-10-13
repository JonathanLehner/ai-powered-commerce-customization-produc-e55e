import { isCountryCode, regionForCountry } from "./countries";
import { FX_TO_USD, convert, orderTaxRows, taxRowsFor, type TaxRow } from "./pricing";
import type {
  Order,
  ShippingRate,
  ShippingRateKind,
  ShippingRateTier,
  ShippingZone,
  Store,
  StoreTaxSettings,
} from "./types";

/**
 * Shipping zones, their rates and the tax a checkout charges, as plain
 * functions with no server imports. The basket, the checkout page, the
 * shopper's checkout form, the order that gets charged, the Admin API and
 * `npm run shipping-check` all work the numbers out here, so what the shopper
 * is shown is what they pay.
 */

export const RATE_KINDS = ["flat", "weight", "subtotal", "free_over"] as const satisfies readonly ShippingRateKind[];

/** Stripe Checkout offers at most five shipping options, so a zone carries at most five rates. */
export const MAX_RATES_PER_ZONE = 5;
export const MAX_TIERS = 10;
export const MAX_ZONES = 50;
export const MAX_DELIVERY_DAYS = 90;
export const MAX_TAX_RATE = 50;
/** 1,000 kg in grams, and a ceiling on any money amount in minor units. */
export const MAX_WEIGHT_GRAMS = 1_000_000;
export const MAX_AMOUNT = 100_000_000;

/* ------------------------------------------------------------------ zones */

/** The zone that ships to a country, or null when none does. */
export function zoneFor<Z extends Pick<ShippingZone, "countries">>(zones: Z[], country: string): Z | null {
  const code = country.toUpperCase();
  return zones.find((zone) => zone.countries.includes(code)) ?? null;
}

/** Every country the store ships to, each once, sorted by code. */
export function shippingCountries(zones: Pick<ShippingZone, "countries">[]): string[] {
  return [...new Set(zones.flatMap((zone) => zone.countries))].sort();
}

/**
 * Countries Stripe Checkout will not collect a shipping address in. They are
 * left out of `shipping_address_collection`, which Stripe would otherwise
 * refuse outright.
 */
const STRIPE_UNSUPPORTED = new Set(["AS", "CX", "CC", "CU", "HM", "IR", "KP", "MH", "FM", "NF", "MP", "PW", "SD", "SY", "UM", "VI"]);

export function stripeAllowedCountries(zones: Pick<ShippingZone, "countries">[]): string[] {
  return shippingCountries(zones).filter((code) => !STRIPE_UNSUPPORTED.has(code));
}

/* ------------------------------------------------------------------ rates */

/** What a rate is priced from: the order's weight and its subtotal after discounts, in the zone currency. */
export interface OrderMeasure {
  weightGrams: number;
  subtotal: number;
}

/**
 * What a rate charges for an order, in the zone currency, or null when the
 * order falls outside every tier of a weight or subtotal rate (the rate is
 * then not offered).
 */
export function rateAmount(rate: ShippingRate, measure: OrderMeasure): number | null {
  switch (rate.kind) {
    case "flat":
      return rate.amount;
    case "free_over":
      return rate.threshold !== null && measure.subtotal >= rate.threshold ? 0 : rate.amount;
    case "weight":
    case "subtotal": {
      const value = rate.kind === "weight" ? measure.weightGrams : measure.subtotal;
      const tier = rate.tiers.find((t) => t.upTo === null || value <= t.upTo);
      return tier ? tier.amount : null;
    }
  }
}

/** A rate as the shopper is offered it, priced in the checkout currency. */
export interface ShippingOption {
  zoneId: string;
  zoneName: string;
  rateId: string;
  /** Empty for the standard rate of a store without zones; the page names it. */
  name: string;
  amount: number;
  minDays: number;
  maxDays: number;
}

/** The rate id of the single option a store without shipping zones offers. */
export const STANDARD_RATE_ID = "standard";

export function standardOption(amount: number): ShippingOption {
  return { zoneId: "", zoneName: "", rateId: STANDARD_RATE_ID, name: "", amount, minDays: 0, maxDays: 0 };
}

/** The rate id of a basket of gift cards only, which ships nothing: the codes go out by email. */
export const EMAIL_DELIVERY_RATE_ID = "email";

export function emailDeliveryOption(): ShippingOption {
  return { zoneId: "", zoneName: "", rateId: EMAIL_DELIVERY_RATE_ID, name: "", amount: 0, minDays: 0, maxDays: 0 };
}

/** The options of one zone for an order, cheapest first. */
export function zoneOptions(
  zone: ShippingZone,
  measure: OrderMeasure,
  currency: string,
  fx: Record<string, number> = FX_TO_USD,
): ShippingOption[] {
  return zone.rates
    .flatMap((rate) => {
      const amount = rateAmount(rate, measure);
      if (amount === null) return [];
      return [
        {
          zoneId: zone.id,
          zoneName: zone.name,
          rateId: rate.id,
          name: rate.name,
          amount: convert(amount, zone.currency, currency, fx),
          minDays: rate.minDays,
          maxDays: rate.maxDays,
        },
      ];
    })
    .sort((a, b) => a.amount - b.amount);
}

/**
 * The rates the shopper can choose from for a destination. `subtotal` is the
 * goods after discounts in the checkout currency; each zone converts it into
 * its own before comparing it with thresholds and tiers.
 */
export function shippingOptions(
  zones: ShippingZone[],
  country: string,
  /** `fx` is the store's exchange rates (`storeFxTable`); the built-in ones otherwise. */
  basket: { weightGrams: number; subtotal: number; currency: string; fx?: Record<string, number> },
): ShippingOption[] {
  const zone = zoneFor(zones, country);
  if (!zone) return [];
  const fx = basket.fx ?? FX_TO_USD;
  return zoneOptions(
    zone,
    { weightGrams: basket.weightGrams, subtotal: convert(basket.subtotal, basket.currency, zone.currency, fx) },
    basket.currency,
    fx,
  );
}

/** The option the shopper picked, or the cheapest when the pick is not on offer. */
export function pickOption(options: ShippingOption[], rateId: string | null | undefined): ShippingOption | null {
  return options.find((option) => option.rateId === rateId) ?? options[0] ?? null;
}

/** Total weight of the lines, from each variant's weight. */
export function basketWeight(
  lines: { quantity: number; variantId: string; product: { variants: { id: string; weightGrams?: number }[] } | null }[],
): number {
  return lines.reduce((sum, line) => {
    const grams = line.product?.variants.find((v) => v.id === line.variantId)?.weightGrams ?? 0;
    return sum + grams * line.quantity;
  }, 0);
}

/* -------------------------------------------------------------------- tax */

export function storeTax(store: Pick<Store, "tax">): StoreTaxSettings {
  return store.tax ?? { mode: "manual", rates: [] };
}

/** The store's own rate for a country, or null when it has none. */
export function countryTaxRate(settings: Pick<StoreTaxSettings, "rates">, country: string): number | null {
  const code = country.toUpperCase();
  return settings.rates.find((row) => row.country === code)?.rate ?? null;
}

/** A tax bracket a line can be charged at, with the fulfilment regions it applies to. */
export interface QuoteBracket {
  code: string;
  rate: number;
  regions: string[];
}

/**
 * The rate a line is charged for a destination: its own bracket where that
 * covers the country's region, otherwise a bracket that does, preferring one
 * coded for the country itself (`DE-VAT-19` for Germany), then the order
 * `brackets` comes in. Null when no bracket covers the destination.
 */
export function destinationRate(
  line: { rate: number; regions?: string[] },
  country: string,
  brackets: QuoteBracket[],
): number | null {
  const region = regionForCountry(country);
  if (!line.regions || line.regions.includes(region)) return line.rate;
  const covering = brackets.filter((bracket) => bracket.regions.includes(region));
  const prefix = `${country.toUpperCase()}-`;
  return (covering.find((bracket) => bracket.code.toUpperCase().startsWith(prefix)) ?? covering[0])?.rate ?? null;
}

/** What a checkout's tax and total are worked out from, before the destination is known. */
export interface QuoteBasis {
  /**
   * Each line's goods after its share of the discount, with its product's
   * bracket rate and the regions that bracket covers (absent: everywhere).
   */
  lines: { amount: number; rate: number; regions?: string[] }[];
  /** The goods after discounts. */
  goods: number;
  inclusive: boolean;
  /** Tax is calculated by Stripe Tax at payment, so none is added here. */
  stripeTax: boolean;
  countryRates: { country: string; rate: number }[];
  /** The store's brackets for a line whose own does not cover the destination, default first. */
  brackets?: QuoteBracket[];
}

export interface Quote {
  shipping: number;
  taxRows: TaxRow[];
  taxAmount: number;
  total: number;
  /** No rate covers the destination, so the order cannot be placed there. */
  taxUnavailable: boolean;
}

/**
 * The tax and total for a destination and a shipping charge. A country with
 * a rate of the store's own charges it on every line; anywhere else each line
 * is charged at the bracket for the destination (`destinationRate`).
 * Inclusive prices already hold the tax, so it is reported and not added.
 */
export function quoteTotals(basis: QuoteBasis, country: string, shipping: number): Quote {
  if (basis.stripeTax) {
    return { shipping, taxRows: [], taxAmount: 0, total: basis.goods + shipping, taxUnavailable: false };
  }
  const override = countryTaxRate({ rates: basis.countryRates }, country);
  const rates = basis.lines.map((line) => override ?? destinationRate(line, country, basis.brackets ?? []));
  if (rates.some((rate) => rate === null)) {
    return { shipping, taxRows: [], taxAmount: 0, total: basis.goods + shipping, taxUnavailable: true };
  }
  const taxRows = taxRowsFor(
    basis.lines.map((line, index) => ({ amount: line.amount, rate: rates[index] ?? 0 })),
    shipping,
    basis.inclusive,
  );
  const taxAmount = taxRows.reduce((sum, row) => sum + row.amount, 0);
  return {
    shipping,
    taxRows,
    taxAmount,
    total: basis.inclusive ? basis.goods + shipping : basis.goods + shipping + taxAmount,
    taxUnavailable: false,
  };
}

/** One tax row of a placed order. A null rate is Stripe Tax's, which may blend several. */
export interface OrderTaxRow {
  rate: number | null;
  amount: number;
}

/**
 * How an order was taxed, with the rows to show. Orders placed before tax
 * settings were recorded count as inclusive when their total carries no tax
 * on top of the goods and shipping.
 */
export function orderTax(
  order: Pick<Order, "tax" | "taxLines" | "taxRate" | "taxAmount" | "subtotal" | "shipping" | "total" | "discount">,
): { mode: StoreTaxSettings["mode"]; inclusive: boolean; rows: OrderTaxRow[] } {
  const goods = order.subtotal - (order.discount?.amount ?? 0);
  const inclusive = order.tax?.inclusive ?? (order.taxAmount > 0 && order.total === goods + order.shipping);
  const mode = order.tax?.mode ?? "manual";
  const rows: OrderTaxRow[] =
    mode === "stripe" ? [{ rate: null, amount: order.taxAmount }] : orderTaxRows(order);
  return { mode, inclusive, rows };
}

/* -------------------------------------------------------------- validation */

/** A rule an input broke, as a message key under `actions.shipping` with its values and the field. */
export interface ShippingProblem {
  key: string;
  field: string;
  values?: Record<string, string | number>;
}

export interface ZoneInput {
  name: string;
  countries: string[];
}

/** Checks a zone's name and countries against the store's other zones. */
export function checkZone(
  input: ZoneInput,
  others: Pick<ShippingZone, "name" | "countries">[],
): { zone: ZoneInput } | { problem: ShippingProblem } {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { problem: { key: "zoneName", field: "name" } };
  const countries = [...new Set(input.countries.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (countries.length === 0) return { problem: { key: "zoneCountries", field: "countries" } };
  const unknown = countries.find((code) => !isCountryCode(code));
  if (unknown) return { problem: { key: "unknownCountry", field: "countries", values: { code: unknown } } };
  for (const other of others) {
    const shared = countries.find((code) => other.countries.includes(code));
    if (shared) {
      return { problem: { key: "countryTaken", field: "countries", values: { code: shared, zone: other.name } } };
    }
  }
  return { zone: { name, countries: countries.sort() } };
}

export interface RateInput {
  name: string;
  kind: string;
  amount: number;
  tiers: ShippingRateTier[];
  threshold: number | null;
  minDays: number;
  maxDays: number;
}

const isMoney = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT;

/** Checks a rate and returns it in the shape it is stored in. */
export function checkRate(input: RateInput): { rate: Omit<ShippingRate, "id"> } | { problem: ShippingProblem } {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { problem: { key: "rateName", field: "name" } };
  if (!(RATE_KINDS as readonly string[]).includes(input.kind)) return { problem: { key: "rateKind", field: "kind" } };
  const kind = input.kind as ShippingRateKind;
  if (
    !Number.isInteger(input.minDays) ||
    !Number.isInteger(input.maxDays) ||
    input.minDays < 0 ||
    input.maxDays < 1 ||
    input.maxDays > MAX_DELIVERY_DAYS ||
    input.minDays > input.maxDays
  ) {
    return { problem: { key: "deliveryDays", field: "minDays", values: { max: MAX_DELIVERY_DAYS } } };
  }

  let amount = 0;
  let tiers: ShippingRateTier[] = [];
  let threshold: number | null = null;
  if (kind === "flat" || kind === "free_over") {
    if (!isMoney(input.amount)) return { problem: { key: "ratePrice", field: "amount" } };
    amount = input.amount;
  }
  if (kind === "free_over") {
    if (input.threshold === null || !isMoney(input.threshold) || input.threshold <= 0) {
      return { problem: { key: "threshold", field: "threshold" } };
    }
    threshold = input.threshold;
  }
  if (kind === "weight" || kind === "subtotal") {
    const ceiling = kind === "weight" ? MAX_WEIGHT_GRAMS : MAX_AMOUNT;
    if (input.tiers.length === 0 || input.tiers.length > MAX_TIERS) {
      return { problem: { key: "tierCount", field: "tiers", values: { max: MAX_TIERS } } };
    }
    let previous = -1;
    for (const [index, tier] of input.tiers.entries()) {
      const last = index === input.tiers.length - 1;
      if (!isMoney(tier.amount)) return { problem: { key: "tierPrice", field: "tiers", values: { row: index + 1 } } };
      if (tier.upTo === null) {
        if (!last) return { problem: { key: "tierOpenEnd", field: "tiers" } };
        continue;
      }
      if (!Number.isInteger(tier.upTo) || tier.upTo <= previous || tier.upTo > ceiling) {
        return { problem: { key: "tierOrder", field: "tiers", values: { row: index + 1 } } };
      }
      previous = tier.upTo;
    }
    tiers = input.tiers.map((tier) => ({ upTo: tier.upTo, amount: tier.amount }));
  }
  return { rate: { name, kind, amount, tiers, threshold, minDays: input.minDays, maxDays: input.maxDays } };
}

/** Checks the manual country rates and returns them sorted, one per country. */
export function checkTaxRates(
  rates: { country: string; rate: number }[],
): { rates: { country: string; rate: number }[] } | { problem: ShippingProblem } {
  const seen = new Set<string>();
  const out: { country: string; rate: number }[] = [];
  for (const row of rates) {
    const country = row.country.trim().toUpperCase();
    if (!isCountryCode(country)) return { problem: { key: "unknownCountry", field: "rates", values: { code: country || "?" } } };
    if (seen.has(country)) return { problem: { key: "taxCountryTwice", field: "rates", values: { code: country } } };
    if (!Number.isFinite(row.rate) || row.rate < 0 || row.rate > MAX_TAX_RATE) {
      return { problem: { key: "taxRate", field: "rates", values: { max: MAX_TAX_RATE } } };
    }
    seen.add(country);
    out.push({ country, rate: Math.round(row.rate * 100) / 100 });
  }
  return { rates: out.sort((a, b) => a.country.localeCompare(b.country)) };
}
