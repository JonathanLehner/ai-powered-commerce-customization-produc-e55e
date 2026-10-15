/**
 * Shipping and delivery claims in storefront copy, checked against the
 * store's shipping rates before the page goes live: free shipping the rates
 * do not give, a free-shipping threshold no rate has, delivery faster than
 * any rate's estimate, and delivery promises still written for a template's
 * sample brand. Pure, so the publish step, the Admin API, the assistant and
 * `npm run sample-copy-check` read the same answer.
 */
import { convert, FX_TO_USD } from "./pricing";
import { PRODUCT_BLOCK_DEFS, PRODUCT_PAGE_PROP, translatableBlockFields, type ProductBlockType } from "./product-template";
import { SHIPPING_WORDS, isSampleField } from "./sample-copy";
import { SECTION_DEFS, type SectionType } from "./storefront-schema";
import { SITE_FIELDS, translatableSectionFields } from "./translations";
import type { ShippingRate, ShippingZone } from "./types";

const FREE_WORDS = /\bfree\b|gratis|kostenlos|gratuit|grátis|\bfri\b|無料/i;
const CURRENCY = /[$€£¥]|\b(?:USD|EUR|GBP|CAD|AUD|JPY|SGD|CHF|SEK|AED|BRL|INR|MXN|ZAR|kr)\b/i;
const AMOUNT = /(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/;
const DAYS =
  /(\d+)\s*(?:(?:-|–|to|bis|à|a)\s*(\d+)\s*)?(?:business |working )?(?:days?|tage?n?|werktage?n?|jours?|días|dias|giorni|dagen|dagar|日)/i;
const NEXT_DAY = /next[- ]day|overnight|same[- ]day/i;
/** Arrival rather than dispatch: "ships within 3 days" is not a delivery time. */
const DELIVERY_WORDS = /deliver|arriv|liefer|zugestellt|livr|entreg|consegn|bezorg|leverans|お届け/i;

export type ClaimProblem =
  /** Promises free shipping on every order; `zones` charge for it. Empty when the store has no zones. */
  | { kind: "free"; zones: string[] }
  /** Promises free shipping from `threshold` (store currency, minor units); no rate in `zones` gives it. */
  | { kind: "freeOver"; threshold: number; zones: string[] }
  /** Promises delivery within `days`; the fastest rate takes up to `fastest`. */
  | { kind: "days"; days: number; fastest: number }
  /** A delivery promise still in the words of a template's sample brand. */
  | { kind: "sample" };

export interface ClaimIssue {
  /** `section:<node id>:<field>`, `block:<block id>:<field>` or `site:<field>`. */
  key: string;
  area: "section" | "block" | "site";
  /** The section or block type, or "site". */
  type: string;
  field: string;
  text: string;
  problem: ClaimProblem;
}

/** The decimals a currency's minor units carry: 2 for USD, 0 for JPY. */
function decimals(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** The money amount written in a sentence, in minor units of `currency`, or null when it names none. */
export function claimedAmount(sentence: string, currency: string): number | null {
  if (!CURRENCY.test(sentence)) return null;
  const match = AMOUNT.exec(sentence);
  if (!match) return null;
  const whole = Number(match[1].replace(/[.,\s]/g, ""));
  const fraction = match[2] ? Number(match[2].padEnd(2, "0")) / 100 : 0;
  return Math.round((whole + fraction) * 10 ** decimals(currency));
}

/** The longest delivery a sentence promises, in days, or null when it promises none. */
export function claimedDays(sentence: string): number | null {
  if (NEXT_DAY.test(sentence)) return 1;
  const match = DAYS.exec(sentence);
  if (!match) return null;
  return Number(match[2] ?? match[1]);
}

/** Whether a rate is free whatever the order. */
function alwaysFree(rate: ShippingRate): boolean {
  if (rate.kind === "flat") return rate.amount === 0;
  if (rate.kind === "free_over") return rate.amount === 0 || rate.threshold === 0;
  return rate.tiers.length > 0 && rate.tiers.every((tier) => tier.amount === 0);
}

/** Whether a zone ships free from `threshold` (store currency), or on every order when it is null. */
function zoneGivesFree(zone: ShippingZone, threshold: number | null, currency: string, fx: Record<string, number>): boolean {
  return zone.rates.some((rate) => {
    if (alwaysFree(rate)) return true;
    if (threshold === null || rate.kind !== "free_over" || rate.threshold === null) return false;
    return convert(rate.threshold, zone.currency, currency, fx) <= threshold;
  });
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?。])\s+|\n+/).filter((s) => s.trim() !== "");
}

/** What is wrong with one piece of copy, or null when its claims hold. */
export function claimProblem(
  text: string,
  sample: boolean,
  zones: ShippingZone[],
  currency: string,
  fx: Record<string, number> = FX_TO_USD,
): ClaimProblem | null {
  let deliveryClaim = false;
  for (const sentence of sentences(text)) {
    if (!SHIPPING_WORDS.test(sentence)) continue;
    deliveryClaim = true;
    if (FREE_WORDS.test(sentence)) {
      const threshold = claimedAmount(sentence, currency);
      const lacking = zones.filter((zone) => !zoneGivesFree(zone, threshold, currency, fx)).map((zone) => zone.name);
      if (zones.length === 0 || lacking.length > 0) {
        return threshold === null ? { kind: "free", zones: lacking } : { kind: "freeOver", threshold, zones: lacking };
      }
      continue;
    }
    const days = DELIVERY_WORDS.test(sentence) ? claimedDays(sentence) : null;
    const estimates = zones.flatMap((zone) => zone.rates.map((rate) => rate.maxDays));
    if (days !== null && estimates.length > 0) {
      const fastest = Math.min(...estimates);
      if (fastest > days) return { kind: "days", days, fastest };
    }
  }
  return deliveryClaim && sample ? { kind: "sample" } : null;
}

type TreeNode = { type?: { resolvedName?: string }; props?: Record<string, unknown>; nodes?: string[]; hidden?: boolean };

/**
 * The shipping and delivery claims on a page tree, in its default language,
 * that the store's rates do not back: visible sections top to bottom, the
 * product page, then the header and footer copy.
 */
export function shippingClaimIssues(
  tree: unknown,
  zones: ShippingZone[],
  currency: string,
  fx: Record<string, number> = FX_TO_USD,
): ClaimIssue[] {
  if (!tree || typeof tree !== "object") return [];
  const nodes = tree as Record<string, TreeNode>;
  const out: ClaimIssue[] = [];
  const check = (area: ClaimIssue["area"], prefix: string, type: string, props: Record<string, unknown>, keys: string[]) => {
    for (const field of keys) {
      const text = String(props[field] ?? "");
      if (text.trim() === "") continue;
      const problem = claimProblem(text, isSampleField(props, field), zones, currency, fx);
      if (problem) out.push({ key: `${prefix}${field}`, area, type, field, text, problem });
    }
  };
  for (const id of nodes.ROOT?.nodes ?? []) {
    const node = nodes[id];
    const type = node?.type?.resolvedName;
    if (!node || node.hidden || !type || !(type in SECTION_DEFS)) continue;
    check("section", `section:${id}:`, type, node.props ?? {}, translatableSectionFields(type as SectionType));
  }
  const root = nodes.ROOT?.props ?? {};
  const blocks = root[PRODUCT_PAGE_PROP];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block.id !== "string" || !(block.type in PRODUCT_BLOCK_DEFS)) continue;
    check("block", `block:${block.id}:`, block.type, (block.props ?? {}) as Record<string, unknown>, translatableBlockFields(block.type as ProductBlockType));
  }
  check("site", "site:", "site", root, SITE_FIELDS.map((f) => f.key));
  return out;
}

/**
 * The rate that would make a free-shipping claim true in a zone: "Free over
 * an amount", free from the claimed threshold and charging the zone's
 * cheapest current price below it, with that rate's delivery estimate.
 */
export function suggestedFreeRate(
  zone: ShippingZone,
  threshold: number,
  currency: string,
  fx: Record<string, number> = FX_TO_USD,
): { kind: "free_over"; amount: number; threshold: number; minDays: number; maxDays: number } {
  const paid = zone.rates.filter((rate) => rate.kind === "flat" || rate.kind === "free_over");
  const base = [...paid].sort((a, b) => a.amount - b.amount)[0] ?? zone.rates[0];
  return {
    kind: "free_over",
    amount: base?.kind === "flat" || base?.kind === "free_over" ? base.amount : 0,
    threshold: convert(threshold, currency, zone.currency, fx),
    minDays: base?.minDays ?? 3,
    maxDays: base?.maxDays ?? 7,
  };
}
