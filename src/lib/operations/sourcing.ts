import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { copyCatalogProductIntoStore } from "../catalog-import";
import {
  createQuoteRequest,
  getCatalogProduct,
  getQuoteRequest,
  getQuoteRequestByKey,
  getStoreProduct,
  listStoreProducts,
  listSuppliers,
  recordAudit,
  updateQuoteRequest,
} from "../data";
import { acceptedQuote, canAcceptQuote, checkQuoteRequest, formatQuantity, isQuoteOnly, type QuoteRequestInput } from "../sourcing";
import type { QuoteRequest, StoreProduct } from "../types";
import { formatMoney } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's bulk sourcing enquiries (requests for quote), store side: raising
 * one, withdrawing it, accepting a supplier quote and copying the accepted
 * quote into the catalog. The workspace's sourcing page and the Admin API both
 * run these. Recording and declining quotes is the platform's sourcing desk.
 */

export function revalidateEnquiry(storeId: string) {
  revalidatePath("/admin/quotes");
  revalidatePath(`/app/stores/${storeId}/sourcing`);
  revalidatePath(`/app/stores/${storeId}`);
}

/** The enquiry, provided it belongs to the store. */
export async function findQuoteRequest(storeId: string, requestId: string): Promise<QuoteRequest | null> {
  const request = await getQuoteRequest(requestId);
  return request && request.storeId === storeId ? request : null;
}

async function storeEnquiry(ctx: OperationContext, requestId: string): Promise<QuoteRequest> {
  const request = await findQuoteRequest(ctx.store.id, requestId);
  if (!request) throw new OperationError("not_found", "That enquiry is not in this store.");
  return request;
}

/** The enquiry as entered: text exactly as the form posts it. */
export type QuoteRequestFields = Partial<Record<keyof QuoteRequestInput, string>>;

export interface RaisedEnquiry {
  request: QuoteRequest;
  /** The submission key had already sent this enquiry; nothing new was sent. */
  alreadySent: boolean;
  supplierName: string;
  /** Working days suppliers on the listing usually take to answer, when it says. */
  responseDays: [number, number] | null;
}

export async function raiseQuoteRequest(
  ctx: OperationContext,
  catalogId: string,
  fields: QuoteRequestFields,
): Promise<RaisedEnquiry> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.sourcing" });

  const [listing, suppliers] = await Promise.all([
    catalogId ? getCatalogProduct(catalogId) : Promise.resolve(null),
    listSuppliers(),
  ]);
  if (catalogId && (!listing || listing.status !== "active")) {
    throw new OperationError("not_found", t("listingGone"), "catalogId");
  }

  // A quote-priced listing belongs to its marketplace; anything else — a
  // print-on-demand item to source in bulk, or a product described from
  // scratch — goes to the approved marketplace that takes RFQs.
  const quoteListing = listing && isQuoteOnly(listing) ? listing : null;
  const supplier = quoteListing
    ? suppliers.find((s) => s.id === quoteListing.supplierId)
    : suppliers.find((s) => s.status === "approved" && s.kind === "sourcing_marketplace" && s.capabilities.quotes);
  if (!supplier || supplier.status !== "approved") {
    throw new OperationError("conflict", t("noPartner"));
  }

  const currency = listing?.currency ?? "USD";
  const checked = checkQuoteRequest(fields, {
    currency,
    regions: quoteListing ? quoteListing.fulfillmentRegions : supplier.regions,
    minimumOrderQuantity: quoteListing ? quoteListing.bulkSourcing.minimumOrderQuantity : 0,
    listingName: listing?.name ?? null,
  });
  if (!checked.ok) {
    throw new OperationError("invalid", t(`check.${checked.code}`, checked.values), checked.field);
  }
  const input = checked.value;
  const responseDays = quoteListing?.bulkSourcing.responseDays ?? null;

  // The form key is minted once per filled-in form, so a double click, a slow
  // reply or a retried submission all carry the same one and the supplier is
  // asked a single time. Keys are looked up across stores, so another store's
  // enquiry under the same key is refused rather than reported.
  if (input.submissionKey) {
    const existing = await getQuoteRequestByKey(input.submissionKey);
    if (existing) {
      if (existing.storeId !== store.id) {
        throw new OperationError("conflict", "That submission key has already been used.", "submissionKey");
      }
      return { request: existing, alreadySent: true, supplierName: existing.supplierName, responseDays };
    }
  }

  const request = await createQuoteRequest({
    storeId: store.id,
    storeName: store.name,
    agencyId: store.agencyId,
    catalogProductId: listing?.id ?? null,
    productName: input.productName,
    description: input.description,
    supplierId: supplier.id,
    supplierName: supplier.name,
    currency,
    quantity: input.quantity,
    destination: input.destination,
    targetUnitCost: input.targetUnitCost,
    neededBy: input.neededBy,
    customisation: input.customisation,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    requestedById: actor.id,
    requestedBy: actor.name,
    submissionKey: input.submissionKey,
  });

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_requested",
    summary: `Raised bulk enquiry ${request.code}: ${formatQuantity(input.quantity)} of “${input.productName}” to ${input.destination} via ${supplier.name}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "quote_request",
    entityId: request.id,
    meta: {
      code: request.code,
      catalogId: listing?.id ?? null,
      quantity: input.quantity,
      destination: input.destination,
      targetUnitCost: input.targetUnitCost,
      currency,
    },
  });

  revalidateEnquiry(store.id);
  return { request, alreadySent: false, supplierName: supplier.name, responseDays };
}

/**
 * A store cancelling an enquiry it no longer needs. The record is kept. An
 * accepted or already closed enquiry stays as it is: a stale tab must not undo
 * a decision, so that is refused as a conflict.
 */
export async function withdrawEnquiry(ctx: OperationContext, requestId: string): Promise<QuoteRequest> {
  const { store, actor } = ctx;
  const request = await storeEnquiry(ctx, requestId);
  const withdrawn = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted"] } },
    { $set: { status: "withdrawn" } },
  );
  revalidateEnquiry(store.id);
  if (!withdrawn) {
    if (request.status === "withdrawn") return request;
    throw new OperationError("conflict", `${request.code} is ${request.status} and can no longer be withdrawn.`);
  }
  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_withdrawn",
    summary: `Withdrew bulk enquiry ${request.code} for “${request.productName}”`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "quote_request",
    entityId: request.id,
    meta: { code: request.code },
  });
  return (await getQuoteRequest(request.id)) ?? request;
}

/**
 * The store picking the quote it will go with. The others stay on record.
 * Accepting the quote already accepted is a no-op; any other quote that cannot
 * be accepted right now (the enquiry is not awaiting a choice, or the quote has
 * lapsed) is refused as a conflict.
 */
export async function acceptSupplierQuote(
  ctx: OperationContext,
  requestId: string,
  quoteId: string,
): Promise<QuoteRequest> {
  const { store, actor } = ctx;
  const request = await storeEnquiry(ctx, requestId);
  const quote = (request.quotes ?? []).find((q) => q.id === quoteId);
  if (!quote) throw new OperationError("not_found", "That quote is not on this enquiry.", "quoteId");

  const accepted =
    canAcceptQuote(request, quote) &&
    (await updateQuoteRequest(
      request.id,
      { status: "quoted" },
      { $set: { status: "accepted", acceptedQuoteId: quote.id } },
    ));
  revalidateEnquiry(store.id);
  if (!accepted) {
    if (request.status === "accepted" && request.acceptedQuoteId === quote.id) return request;
    throw new OperationError(
      "conflict",
      request.status === "quoted"
        ? "That quote has lapsed and can no longer be accepted."
        : `${request.code} is ${request.status}, so no quote can be accepted on it.`,
      "quoteId",
    );
  }

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_accepted",
    summary: `Accepted ${quote.supplierLabel}'s quote of ${formatMoney(quote.unitCost, request.currency)} a unit on ${request.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "quote_request",
    entityId: request.id,
    meta: {
      code: request.code,
      supplierLabel: quote.supplierLabel,
      unitCost: quote.unitCost,
      currency: request.currency,
      quantity: request.quantity,
    },
  });
  return (await getQuoteRequest(request.id)) ?? request;
}

/**
 * Copies the accepted quote into the store catalog as a draft built on the
 * quote's base listing, at the quoted cost, flagged for manual fulfilment.
 * The import key is derived from the enquiry, so a second call or a stale tab
 * returns the product the first one made instead of copying again.
 */
export async function copyQuoteIntoCatalog(
  ctx: OperationContext,
  requestId: string,
): Promise<{ product: StoreProduct; created: boolean }> {
  const { store, actor } = ctx;
  const request = await storeEnquiry(ctx, requestId);
  const quote = acceptedQuote(request);
  if (request.status !== "accepted" || !quote) {
    throw new OperationError("conflict", "Accept a quote before copying it in.");
  }

  const importKey = `rfq_${request.id}`;
  const already = request.storeProductId
    ? await getStoreProduct(request.storeProductId)
    : (await listStoreProducts(store.id)).find((p) => p.importKey === importKey);
  if (already && already.storeId === store.id) return { product: already, created: false };

  const { product } = await copyCatalogProductIntoStore(store, quote.baseCatalogProductId, actor, importKey, {
    unitCost: quote.unitCost,
    name: request.productName,
    description: request.description,
    supplierId: request.supplierId,
    manualFulfilment: {
      quoteRequestId: request.id,
      quoteCode: request.code,
      supplierLabel: quote.supplierLabel,
      unitCost: quote.unitCost,
      minimumOrderQuantity: quote.minimumOrderQuantity,
    },
  });
  await updateQuoteRequest(request.id, {}, { $set: { storeProductId: product.id } });

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_copied",
    summary: `Copied accepted quote ${request.code} into the catalog as “${product.name}” for manual fulfilment`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "store_product",
    entityId: product.id,
    meta: { code: request.code, unitCost: quote.unitCost, currency: request.currency, supplierLabel: quote.supplierLabel },
  });

  revalidateEnquiry(store.id);
  revalidatePath(`/app/stores/${store.id}/catalog`);
  return { product, created: true };
}
