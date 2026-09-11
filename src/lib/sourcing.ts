/**
 * Bulk sourcing: what a quote-priced catalog listing is, what a bulk sourcing
 * enquiry has to say before it is worth sending to a supplier, and what a
 * supplier quote has to carry before a store can accept it.
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

import type { BulkSourcing, CatalogProduct, QuoteRequest, QuoteRequestStatus, SupplierQuote } from "./types";
import { formatMoney, parseMoney } from "./util";

/** A catalog entry that is priced by quote rather than by unit cost. */
export type BulkSourcingProduct = CatalogProduct & { bulkSourcing: BulkSourcing };

export function isQuoteOnly(product: CatalogProduct): product is BulkSourcingProduct {
  return Boolean(product.bulkSourcing && product.bulkSourcing.minimumOrderQuantity > 0);
}

export const QUOTE_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  submitted: "Awaiting quotes",
  quoted: "Quotes to review",
  accepted: "Quote accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const QUOTE_STATUS_TONES: Record<QuoteRequestStatus, "amber" | "green" | "rose" | "neutral" | "iris"> = {
  submitted: "amber",
  quoted: "iris",
  accepted: "green",
  declined: "rose",
  withdrawn: "neutral",
};

/** What the buyer is told is happening, in the store's own queue. */
export const QUOTE_STATUS_NOTES: Record<QuoteRequestStatus, string> = {
  submitted: "With the sourcing desk. Suppliers answer bulk enquiries in a few working days.",
  quoted: "Quotes came back. Compare them with the print-on-demand options, then accept the one to go with.",
  accepted: "Accepted. Copy it into the catalog to price and sell it — orders for it are raised by hand.",
  declined: "No supplier took this one on. Change the run size or the specification and ask again.",
  withdrawn: "Cancelled by the store. Raise a new enquiry when the run is confirmed.",
};

/** Enquiries still in play, the ones the store team has to act on or wait for. */
export function isOpenEnquiry(request: Pick<QuoteRequest, "status" | "storeProductId">): boolean {
  return (
    request.status === "submitted" ||
    request.status === "quoted" ||
    (request.status === "accepted" && !request.storeProductId)
  );
}

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

/* ------------------------------------------------------ the enquiry form */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const LIMITS = {
  productName: 120,
  description: 2000,
  contactName: 120,
  contactEmail: 160,
  customisation: 2000,
  submissionKey: 40,
  /** A run larger than this is a supply agreement, not a marketplace enquiry. */
  quantity: 1_000_000,
} as const;

export interface QuoteRequestInput {
  productName: string;
  description: string;
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

/** What the rules need to know about what is being asked about. */
export interface QuoteRequestTarget {
  currency: string;
  /** Destination markets the enquiry can be delivered to. */
  regions: string[];
  /** The supplier's minimum run, or 0 when none is published. */
  minimumOrderQuantity: number;
  /** Name of the referenced catalog item, or null when the buyer describes it. */
  listingName: string | null;
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

function todayMidnight(today: Date): number {
  return Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
}

function wholeNumber(raw: unknown): number {
  const text = String(raw ?? "").replace(/[\s,]/g, "");
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

export function checkQuoteRequest(
  raw: Partial<Record<keyof QuoteRequestInput, string>>,
  target: QuoteRequestTarget,
  today = new Date(),
): QuoteRequestCheck {
  const described = clamp(String(raw.productName ?? ""), LIMITS.productName);
  const description = clamp(String(raw.description ?? ""), LIMITS.description);
  const quantity = wholeNumber(raw.quantity);
  const destination = clamp(String(raw.destination ?? ""), 80);
  const targetText = clamp(String(raw.targetUnitCost ?? ""), 20);
  const neededBy = clamp(String(raw.neededBy ?? ""), 10);
  const moq = target.minimumOrderQuantity;

  // Without a catalog reference the words are all the factory has to go on.
  if (target.listingName === null) {
    if (described.length < 3) {
      return { ok: false, field: "productName", message: "Name the product, or pick a catalog item to refer to." };
    }
    if (description.length < 20) {
      return {
        ok: false,
        field: "description",
        message: "Describe the product: what it is, the material and weight, sizes or capacity.",
      };
    }
  }

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
  if (!target.regions.includes(destination)) {
    return { ok: false, field: "destination", message: "Choose the market the run is delivered to." };
  }

  // The target price is optional, but a number that cannot be read would be
  // quoted against silently, so it is refused rather than dropped.
  let targetUnitCost: number | null = null;
  if (targetText) {
    targetUnitCost = parseMoney(targetText, target.currency);
    if (targetUnitCost === null || targetUnitCost <= 0) {
      return { ok: false, field: "targetUnitCost", message: "Enter a target unit cost, or leave it blank." };
    }
  }

  if (neededBy) {
    const when = startOfDay(neededBy);
    if (when === null) return { ok: false, field: "neededBy", message: "Enter the date as YYYY-MM-DD." };
    if (when < todayMidnight(today)) {
      return { ok: false, field: "neededBy", message: "That date has passed. Pick a delivery date ahead of today." };
    }
  }

  const value: QuoteRequestInput = {
    productName: target.listingName ?? described,
    description,
    quantity,
    destination,
    targetUnitCost,
    neededBy,
    customisation: clamp(String(raw.customisation ?? ""), LIMITS.customisation),
    contactName: clamp(String(raw.contactName ?? ""), LIMITS.contactName),
    contactEmail: clamp(String(raw.contactEmail ?? ""), LIMITS.contactEmail).toLowerCase(),
    submissionKey: clamp(String(raw.submissionKey ?? ""), LIMITS.submissionKey),
  };

  if (value.customisation.length < 10) {
    return {
      ok: false,
      field: "customisation",
      message: "Say what decoration is needed — print or embroidery, placement, colours — or “none, blank stock”.",
    };
  }
  if (value.contactName.length < 2) {
    return { ok: false, field: "contactName", message: "Tell the supplier who to reply to." };
  }
  if (!EMAIL.test(value.contactEmail)) {
    return { ok: false, field: "contactEmail", message: "Enter an email address the supplier can reply to." };
  }
  return { ok: true, value };
}

/* ------------------------------------------------- recording a supplier quote */

export interface SupplierQuoteInput {
  supplierLabel: string;
  unitCost: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  validUntil: string;
  notes: string;
}

export type SupplierQuoteCheck =
  | { ok: true; value: SupplierQuoteInput }
  | { ok: false; field: keyof SupplierQuoteInput; message: string };

/**
 * One supplier's reply, checked before it is written against the enquiry. A
 * blank minimum means the supplier quoted the run size the store asked for.
 */
export function checkSupplierQuote(
  raw: Partial<Record<keyof SupplierQuoteInput, string>>,
  currency: string,
  requestedQuantity: number,
): SupplierQuoteCheck {
  const supplierLabel = clamp(String(raw.supplierLabel ?? ""), 120);
  if (supplierLabel.length < 2) {
    return { ok: false, field: "supplierLabel", message: "Name the supplier that sent this quote." };
  }
  const unitCost = parseMoney(String(raw.unitCost ?? ""), currency);
  if (unitCost === null || unitCost <= 0) {
    return { ok: false, field: "unitCost", message: "Enter the quoted cost per unit." };
  }
  const moqText = String(raw.minimumOrderQuantity ?? "").trim();
  const minimumOrderQuantity = moqText ? wholeNumber(moqText) : requestedQuantity;
  if (!Number.isFinite(minimumOrderQuantity) || minimumOrderQuantity <= 0) {
    return { ok: false, field: "minimumOrderQuantity", message: "Enter the supplier's minimum order, or leave it blank." };
  }
  const leadTimeDays = wholeNumber(raw.leadTimeDays);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0 || leadTimeDays > 365) {
    return { ok: false, field: "leadTimeDays", message: "Enter the production lead time in days." };
  }
  const validUntil = clamp(String(raw.validUntil ?? ""), 10);
  if (validUntil && startOfDay(validUntil) === null) {
    return { ok: false, field: "validUntil", message: "Enter the expiry date as YYYY-MM-DD." };
  }
  return {
    ok: true,
    value: {
      supplierLabel,
      unitCost,
      minimumOrderQuantity,
      leadTimeDays,
      validUntil,
      notes: clamp(String(raw.notes ?? ""), 2000),
    },
  };
}

/** Whether a quote is still on offer. An expired one is history. */
export function quoteIsLive(quote: Pick<SupplierQuote, "validUntil">, today = new Date()): boolean {
  if (!quote.validUntil) return true;
  const expires = startOfDay(quote.validUntil);
  if (expires === null) return true;
  return expires >= todayMidnight(today);
}

/** Whether the store can accept this quote on this enquiry right now. */
export function canAcceptQuote(
  request: Pick<QuoteRequest, "status">,
  quote: Pick<SupplierQuote, "validUntil">,
  today = new Date(),
): boolean {
  return request.status === "quoted" && quoteIsLive(quote, today);
}

/** The quote the store accepted, if it has accepted one. */
export function acceptedQuote(request: Pick<QuoteRequest, "quotes" | "acceptedQuoteId">): SupplierQuote | null {
  if (!request.acceptedQuoteId) return null;
  return (request.quotes ?? []).find((q) => q.id === request.acceptedQuoteId) ?? null;
}

/** An enquiry reference: short, unmistakable in an email subject line. */
export function quoteCode(random: string): string {
  return `RFQ-${random.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}`;
}
