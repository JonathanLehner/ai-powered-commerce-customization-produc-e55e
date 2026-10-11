"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
} from "@/lib/data";
import { copyCatalogProductIntoStore } from "@/lib/catalog-import";
import { assertPlatformAdmin, assertStoreAccess } from "@/lib/session";
import {
  acceptedQuote,
  canAcceptQuote,
  checkQuoteRequest,
  checkSupplierQuote,
  formatQuantity,
  isQuoteOnly,
} from "@/lib/sourcing";
import type { QuoteRequest, SupplierQuote } from "@/lib/types";
import { formatMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * Bulk sourcing enquiries (requests for quote).
 *
 * A sourcing marketplace has no order API and no fixed unit price, so this is
 * where a store asks: the enquiry is recorded against the store, the sourcing
 * desk records each supplier quote that comes back, the store accepts one, and
 * the accepted quote is copied into the catalog as a product flagged for
 * manual fulfilment. Every step lands in the audit history.
 */

function revalidateEnquiry(storeId: string) {
  revalidatePath("/admin/quotes");
  revalidatePath(`/app/stores/${storeId}/sourcing`);
  revalidatePath(`/app/stores/${storeId}`);
}

export async function requestQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.sourcing");

  const [listing, suppliers] = await Promise.all([
    catalogId ? getCatalogProduct(catalogId) : Promise.resolve(null),
    listSuppliers(),
  ]);
  if (catalogId && (!listing || listing.status !== "active")) {
    return { status: "error", message: t("listingGone") };
  }

  // A quote-priced listing belongs to its marketplace; anything else — a
  // print-on-demand item to source in bulk, or a product described from
  // scratch — goes to the approved marketplace that takes RFQs.
  const quoteListing = listing && isQuoteOnly(listing) ? listing : null;
  const supplier = quoteListing
    ? suppliers.find((s) => s.id === quoteListing.supplierId)
    : suppliers.find((s) => s.status === "approved" && s.kind === "sourcing_marketplace" && s.capabilities.quotes);
  if (!supplier || supplier.status !== "approved") {
    return { status: "error", message: t("noPartner") };
  }

  const currency = listing?.currency ?? "USD";
  const checked = checkQuoteRequest(
    {
      productName: String(formData.get("productName") ?? ""),
      description: String(formData.get("description") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      destination: String(formData.get("destination") ?? ""),
      targetUnitCost: String(formData.get("targetUnitCost") ?? ""),
      neededBy: String(formData.get("neededBy") ?? ""),
      customisation: String(formData.get("customisation") ?? ""),
      contactName: String(formData.get("contactName") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      submissionKey: String(formData.get("submissionKey") ?? ""),
    },
    {
      currency,
      regions: quoteListing ? quoteListing.fulfillmentRegions : supplier.regions,
      minimumOrderQuantity: quoteListing ? quoteListing.bulkSourcing.minimumOrderQuantity : 0,
      listingName: listing?.name ?? null,
    },
  );
  if (!checked.ok) {
    return { status: "error", message: t(`check.${checked.code}`, checked.values), field: checked.field };
  }
  const input = checked.value;

  // The form key is minted once per filled-in form, so a double click, a slow
  // reply or a retried submission all carry the same one and the supplier is
  // asked a single time.
  if (input.submissionKey) {
    const existing = await getQuoteRequestByKey(input.submissionKey);
    if (existing) {
      return {
        status: "success",
        message: t("alreadySent", { code: existing.code }),
      };
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
    requestedById: user.id,
    requestedBy: user.name,
    submissionKey: input.submissionKey,
  });

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_requested",
    summary: `Raised bulk enquiry ${request.code}: ${formatQuantity(input.quantity)} of “${input.productName}” to ${input.destination} via ${supplier.name}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
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

  revalidateEnquiry(storeId);
  const days = quoteListing?.bulkSourcing.responseDays;
  return {
    status: "success",
    message: days
      ? t("sent", { code: request.code, supplier: supplier.name, min: days[0], max: days[1] })
      : t("sentUsual", { code: request.code, supplier: supplier.name }),
  };
}

/** Loads an enquiry the store is acting on, refusing one from another store. */
async function storeEnquiry(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const request = await getQuoteRequest(requestId);
  if (!request || request.storeId !== storeId) throw new Error("That enquiry is not in this store.");
  return { ...access, request };
}

/** A store cancelling an enquiry it no longer needs. The record is kept. */
export async function withdrawQuoteRequest(formData: FormData): Promise<void> {
  const { user, store, request } = await storeEnquiry(formData);
  // An accepted or already closed enquiry stays as it is: a stale tab must
  // not undo a decision.
  const withdrawn = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted"] } },
    { $set: { status: "withdrawn" } },
  );
  if (withdrawn) {
    recordAudit({
      category: "sourcing",
      action: "sourcing.quote_withdrawn",
      summary: `Withdrew bulk enquiry ${request.code} for “${request.productName}”`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "quote_request",
      entityId: request.id,
      meta: { code: request.code },
    });
  }
  revalidateEnquiry(store.id);
}

/** The store picking the quote it will go with. The others stay on record. */
export async function acceptQuote(formData: FormData): Promise<void> {
  const { user, store, request } = await storeEnquiry(formData);
  const quoteId = String(formData.get("quoteId") ?? "");
  const quote = (request.quotes ?? []).find((q) => q.id === quoteId);
  if (!quote) throw new Error("That quote is not on this enquiry.");

  if (canAcceptQuote(request, quote)) {
    const accepted = await updateQuoteRequest(
      request.id,
      { status: "quoted" },
      { $set: { status: "accepted", acceptedQuoteId: quote.id } },
    );
    if (accepted) {
      recordAudit({
        category: "sourcing",
        action: "sourcing.quote_accepted",
        summary: `Accepted ${quote.supplierLabel}'s quote of ${formatMoney(quote.unitCost, request.currency)} a unit on ${request.code}`,
        storeId: store.id,
        agencyId: store.agencyId,
        actorId: user.id,
        actorName: user.name,
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
    }
  }
  revalidateEnquiry(store.id);
}

/**
 * Copies the accepted quote into the store catalog as a draft built on the
 * quote's base listing, at the quoted cost, flagged for manual fulfilment.
 * The import key is derived from the enquiry, so a second click or a stale tab
 * opens the product the first one made instead of copying again.
 */
export async function copyAcceptedQuote(formData: FormData): Promise<void> {
  const { user, store, request } = await storeEnquiry(formData);
  const quote = acceptedQuote(request);
  if (request.status !== "accepted" || !quote) throw new Error("Accept a quote before copying it in.");

  const importKey = `rfq_${request.id}`;
  const already = request.storeProductId
    ? await getStoreProduct(request.storeProductId)
    : (await listStoreProducts(store.id)).find((p) => p.importKey === importKey);
  if (already && already.storeId === store.id) {
    redirect(`/app/stores/${store.id}/catalog/${already.id}`);
  }

  const { product } = await copyCatalogProductIntoStore(store, quote.baseCatalogProductId, user, importKey, {
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
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: product.id,
    meta: { code: request.code, unitCost: quote.unitCost, currency: request.currency, supplierLabel: quote.supplierLabel },
  });

  revalidateEnquiry(store.id);
  revalidatePath(`/app/stores/${store.id}/catalog`);
  redirect(`/app/stores/${store.id}/catalog/${product.id}?imported=1`);
}

/* ------------------------------------------------- the platform's own queue */

/** The sourcing desk recording one supplier's quote against an enquiry. */
export async function recordSupplierQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const quoteId = String(formData.get("submissionKey") ?? "");
  const request = await getQuoteRequest(requestId);
  const [t, locale] = await Promise.all([getTranslations("actions.sourcing"), getLocale()]);
  if (!request) return { status: "error", message: t("enquiryGone") };
  if (!quoteId) return { status: "error", message: t("formNotReady") };
  if (request.status === "withdrawn" || request.status === "accepted") {
    return {
      status: "error",
      message: t(request.status === "withdrawn" ? "withdrawnNoQuotes" : "acceptedNoQuotes", { code: request.code }),
    };
  }
  // Submitting the same form twice lands the quote once.
  if ((request.quotes ?? []).some((q) => q.id === quoteId)) {
    return { status: "success", message: t("quoteAlreadyOn", { code: request.code }) };
  }

  const checked = checkSupplierQuote(
    {
      supplierLabel: String(formData.get("supplierLabel") ?? ""),
      unitCost: String(formData.get("unitCost") ?? ""),
      minimumOrderQuantity: String(formData.get("minimumOrderQuantity") ?? ""),
      leadTimeDays: String(formData.get("leadTimeDays") ?? ""),
      validUntil: String(formData.get("validUntil") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    request.currency,
    request.quantity,
  );
  if (!checked.ok) return { status: "error", message: t(`quoteCheck.${checked.field}`), field: checked.field };

  // The copy needs variants, print areas and mockups to start from. An enquiry
  // that named a catalog item uses it; a described one needs the desk to say
  // which shared listing the quoted product is closest to.
  const baseId = request.catalogProductId ?? String(formData.get("baseCatalogProductId") ?? "");
  const base = baseId ? await getCatalogProduct(baseId) : null;
  if (!base) {
    return {
      status: "error",
      field: "baseCatalogProductId",
      message: t("chooseBase"),
    };
  }

  const quote: SupplierQuote = {
    id: quoteId,
    ...checked.value,
    baseCatalogProductId: base.id,
    recordedBy: user.name,
    recordedAt: new Date().toISOString(),
  };
  const pushed = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted", "declined"] }, "quotes.id": { $ne: quote.id } },
    { $push: { quotes: quote }, $set: { status: "quoted", declineReason: null } },
  );
  if (!pushed) {
    return { status: "error", message: t("changed", { code: request.code }) };
  }

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_recorded",
    summary: `Recorded ${quote.supplierLabel}'s quote of ${formatMoney(quote.unitCost, request.currency)} a unit on ${request.code} for ${request.storeName}`,
    storeId: request.storeId,
    agencyId: request.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "quote_request",
    entityId: request.id,
    meta: {
      code: request.code,
      supplierLabel: quote.supplierLabel,
      unitCost: quote.unitCost,
      currency: request.currency,
      minimumOrderQuantity: quote.minimumOrderQuantity,
      leadTimeDays: quote.leadTimeDays,
    },
    notify: {
      type: "quote_received",
      href: `/app/stores/${request.storeId}/sourcing`,
      params: { code: request.code, name: quote.supplierLabel },
    },
  });

  revalidateEnquiry(request.storeId);
  return {
    status: "success",
    message: t("quoteAdded", {
      supplier: quote.supplierLabel,
      amount: formatMoney(quote.unitCost, request.currency, locale),
      code: request.code,
    }),
  };
}

/** No supplier took the run on. The store is told, with the reason. */
export async function declineQuoteRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  const t = await getTranslations("actions.sourcing");
  if (reason.length < 5) {
    return { status: "error", message: t("reasonRequired"), field: "reason" };
  }

  const request: QuoteRequest | null = await getQuoteRequest(requestId);
  if (!request) return { status: "error", message: t("enquiryGone") };

  const declined = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted"] } },
    { $set: { status: "declined", declineReason: reason } },
  );
  if (!declined) return { status: "error", message: t("notOpen", { code: request.code }) };

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_declined",
    summary: `Declined ${request.code} for ${request.storeName}: ${reason}`,
    storeId: request.storeId,
    agencyId: request.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "quote_request",
    entityId: request.id,
    meta: { code: request.code },
  });

  revalidateEnquiry(request.storeId);
  return { status: "success", message: t("declined", { code: request.code }) };
}
