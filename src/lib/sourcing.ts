/**
 * Bulk sourcing: what a quote-priced catalog listing is, and what a request for
 * quote has to say before it is worth sending to a supplier.
 *
 * Print-on-demand listings carry a unit cost, so a store can copy one in and
 * price it immediately. A sourcing marketplace quotes per enquiry instead: the
 * cost depends on the run size, the decoration and the factory that takes the
 * job. Those listings carry `bulkSourcing` and a zero base cost, and the only
 * way to a price is to ask.
 *
 * Nothing here touches the database, so the same rules run in
 * `npm run sourcing-check`.
 */

import type { BulkSourcing, CatalogProduct, QuoteRequestStatus } from "./types";
import { formatMoney, parseMoney } from "./util";

/** A catalog entry that is priced by quote rather than by unit cost. */
export type BulkSourcingProduct = CatalogProduct & { bulkSourcing: BulkSourcing };

export function isQuoteOnly(product: CatalogProduct): product is BulkSourcingProduct {
  return Boolean(product.bulkSourcing && product.bulkSourcing.minimumOrderQuantity > 0);
}

export const QUOTE_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  submitted: "Awaiting quote",
  quoted: "Quoted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const QUOTE_STATUS_TONES: Record<QuoteRequestStatus, "amber" | "green" | "rose" | "neutral"> = {
  submitted: "amber",
  quoted: "green",
  declined: "rose",
  withdrawn: "neutral",
};

/** What the buyer is told is happening, in the store's own queue. */
export const QUOTE_STATUS_NOTES: Record<QuoteRequestStatus, string> = {
  submitted: "With the sourcing desk. Suppliers answer bulk enquiries in a few working days.",
  quoted: "A price came back. Copy the listing in at the quoted cost to price and sell it.",
  declined: "No supplier took this one on. Change the run size or the specification and ask again.",
  withdrawn: "Cancelled by the store. Raise a new request when the run is confirmed.",
};

/** How a quote-priced listing names its price everywhere it is shown. */
export const QUOTE_PRICE_LABEL = "By quote";

/** "500 units", with thousands separated so a five-figure run is readable. */
export function formatQuantity(units: number): string {
  return `${units.toLocaleString("en-US")} unit${units === 1 ? "" : "s"}`;
}

/** The indicative band shown beside a quote-priced listing, never a promise. */
export function indicativeRange(product: BulkSourcingProduct): string {
  const [low, high] = product.bulkSourcing.indicativeUnitCost;
  return `${formatMoney(low, product.currency)}–${formatMoney(high, product.currency)} a unit at ${formatQuantity(
    product.bulkSourcing.minimumOrderQuantity,
  )}`;
}

/* -------------------------------------------------------- the request form */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const LIMITS = {
  contactName: 120,
  contactEmail: 160,
  customisation: 2000,
  submissionKey: 40,
  /** A run larger than this is a supply agreement, not a marketplace enquiry. */
  quantity: 1_000_000,
} as const;

export interface QuoteRequestInput {
  quantity: number;
  destination: string;
  targetUnitCost: number | null;
  neededBy: string;
  customisation: string;
  contactName: string;
  contactEmail: string;
  submissionKey: string;
}

export type QuoteRequestCheck =
  | { ok: true; value: QuoteRequestInput }
  | { ok: false; field: keyof QuoteRequestInput; message: string };

/** What the rules need to know about the listing being asked about. */
export interface QuoteRequestTarget {
  currency: string;
  fulfillmentRegions: string[];
  bulkSourcing: BulkSourcing;
}

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/** A calendar day, at the day boundary, so "today" is never already past. */
function startOfDay(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

export function checkQuoteRequest(
  raw: Partial<Record<keyof QuoteRequestInput, string>>,
  target: QuoteRequestTarget,
  today = new Date(),
): QuoteRequestCheck {
  const quantityText = String(raw.quantity ?? "").replace(/[\s,]/g, "");
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN;
  const destination = clamp(String(raw.destination ?? ""), 80);
  const targetText = clamp(String(raw.targetUnitCost ?? ""), 20);
  const neededBy = clamp(String(raw.neededBy ?? ""), 10);
  const moq = target.bulkSourcing.minimumOrderQuantity;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, field: "quantity", message: "Enter how many units this run is for." };
  }
  // The minimum is the supplier's, not ours: a request under it comes back
  // unanswered, so it is refused here with the number that would work.
  if (quantity < moq) {
    return {
      ok: false,
      field: "quantity",
      message: `This listing is quoted from ${formatQuantity(moq)}. Ask for at least that many.`,
    };
  }
  if (quantity > LIMITS.quantity) {
    return {
      ok: false,
      field: "quantity",
      message: `Runs above ${formatQuantity(LIMITS.quantity)} are agreed directly with the supplier.`,
    };
  }
  if (!target.fulfillmentRegions.includes(destination)) {
    return { ok: false, field: "destination", message: "Choose where the run is delivered." };
  }

  // The target price is optional, but a number that cannot be read would be
  // quoted against silently, so it is refused rather than dropped.
  let targetUnitCost: number | null = null;
  if (targetText) {
    targetUnitCost = parseMoney(targetText, target.currency);
    if (targetUnitCost === null || targetUnitCost <= 0) {
      return { ok: false, field: "targetUnitCost", message: "Enter a target unit price, or leave it blank." };
    }
  }

  if (neededBy) {
    const when = startOfDay(neededBy);
    if (when === null) return { ok: false, field: "neededBy", message: "Enter the date as YYYY-MM-DD." };
    const midnight = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
    if (when < midnight) {
      return { ok: false, field: "neededBy", message: "That date has passed. Pick a delivery date ahead of today." };
    }
  }

  const value: QuoteRequestInput = {
    quantity,
    destination,
    targetUnitCost,
    neededBy,
    customisation: clamp(String(raw.customisation ?? ""), LIMITS.customisation),
    contactName: clamp(String(raw.contactName ?? ""), LIMITS.contactName),
    contactEmail: clamp(String(raw.contactEmail ?? ""), LIMITS.contactEmail).toLowerCase(),
    submissionKey: clamp(String(raw.submissionKey ?? ""), LIMITS.submissionKey),
  };

  if (value.contactName.length < 2) {
    return { ok: false, field: "contactName", message: "Tell the supplier who to reply to." };
  }
  if (!EMAIL.test(value.contactEmail)) {
    return { ok: false, field: "contactEmail", message: "Enter an email address the supplier can reply to." };
  }
  if (value.customisation.length < 10) {
    return {
      ok: false,
      field: "customisation",
      message: "Describe the decoration, materials and packaging the factory has to quote for.",
    };
  }
  return { ok: true, value };
}

/* ------------------------------------------------------ answering a quote */

export interface QuoteAnswerInput {
  unitCost: number;
  leadTimeDays: number;
  validUntil: string;
  notes: string;
}

export type QuoteAnswerCheck =
  | { ok: true; value: QuoteAnswerInput }
  | { ok: false; field: keyof QuoteAnswerInput; message: string };

/** The sourcing desk's reply, checked before it is written against the request. */
export function checkQuoteAnswer(
  raw: Partial<Record<keyof QuoteAnswerInput, string>>,
  currency: string,
): QuoteAnswerCheck {
  const unitCost = parseMoney(String(raw.unitCost ?? ""), currency);
  if (unitCost === null || unitCost <= 0) {
    return { ok: false, field: "unitCost", message: "Enter the quoted cost per unit." };
  }
  const leadText = String(raw.leadTimeDays ?? "").trim();
  const leadTimeDays = /^\d+$/.test(leadText) ? Number(leadText) : Number.NaN;
  if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0 || leadTimeDays > 365) {
    return { ok: false, field: "leadTimeDays", message: "Enter the production lead time in days." };
  }
  const validUntil = clamp(String(raw.validUntil ?? ""), 10);
  if (validUntil && startOfDay(validUntil) === null) {
    return { ok: false, field: "validUntil", message: "Enter the expiry date as YYYY-MM-DD." };
  }
  return {
    ok: true,
    value: { unitCost, leadTimeDays, validUntil, notes: clamp(String(raw.notes ?? ""), 2000) },
  };
}

/**
 * Whether a quote can still be used to copy the listing into the store. An
 * expired quote is history: the price behind it is no longer offered.
 */
export function quoteIsUsable(
  request: { status: QuoteRequestStatus; response: { validUntil: string } | null },
  today = new Date(),
): boolean {
  if (request.status !== "quoted" || !request.response) return false;
  const { validUntil } = request.response;
  if (!validUntil) return true;
  const expires = startOfDay(validUntil);
  if (expires === null) return true;
  return expires >= Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
}

/** A quote reference: short, unmistakable in an email subject line. */
export function quoteCode(random: string): string {
  return `RFQ-${random.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}`;
}
