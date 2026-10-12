import "server-only";
import { acceptedQuote, canAcceptQuote, quoteIsLive, type BulkSourcingProduct } from "../sourcing";
import type { AiSuggestion, QuoteRequest } from "../types";
import { presentCatalogProduct } from "./present";

/**
 * Bulk sourcing enquiries and assistant suggestions as the Admin API returns
 * them. The form's submission key and who on the sourcing desk keyed a quote
 * in stay out.
 */

export function presentQuoteRequest(request: QuoteRequest) {
  const accepted = acceptedQuote(request);
  return {
    id: request.id,
    code: request.code,
    status: request.status,
    catalogProductId: request.catalogProductId,
    productName: request.productName,
    description: request.description,
    supplierId: request.supplierId,
    supplierName: request.supplierName,
    currency: request.currency,
    quantity: request.quantity,
    destination: request.destination,
    targetUnitCost: request.targetUnitCost,
    neededBy: request.neededBy,
    customisation: request.customisation,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    requestedBy: request.requestedBy,
    quotes: (request.quotes ?? []).map((quote) => ({
      id: quote.id,
      supplierLabel: quote.supplierLabel,
      baseCatalogProductId: quote.baseCatalogProductId,
      unitCost: quote.unitCost,
      minimumOrderQuantity: quote.minimumOrderQuantity,
      leadTimeDays: quote.leadTimeDays,
      validUntil: quote.validUntil,
      notes: quote.notes,
      recordedAt: quote.recordedAt,
      live: quoteIsLive(quote),
      acceptable: canAcceptQuote(request, quote),
    })),
    acceptedQuoteId: accepted ? accepted.id : null,
    declineReason: request.declineReason,
    storeProductId: request.storeProductId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export function presentSourcingListing(product: BulkSourcingProduct) {
  return {
    ...presentCatalogProduct(product),
    supplierId: product.supplierId,
    bulkSourcing: product.bulkSourcing,
  };
}

export function presentSuggestion(suggestion: AiSuggestion) {
  return {
    id: suggestion.id,
    kind: suggestion.kind,
    status: suggestion.status,
    productId: suggestion.productId,
    title: suggestion.title,
    rationale: suggestion.rationale,
    payload: suggestion.payload,
    createdBy: suggestion.createdBy,
    createdAt: suggestion.createdAt,
    decidedBy: suggestion.decidedBy,
    decidedAt: suggestion.decidedAt,
  };
}
