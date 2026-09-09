"use server";

import { revalidatePath } from "next/cache";
import {
  createQuoteRequest,
  getCatalogProduct,
  getQuoteRequest,
  getQuoteRequestByKey,
  getSupplier,
  recordAudit,
  updateQuoteRequest,
} from "@/lib/data";
import { assertPlatformAdmin, assertStoreAccess } from "@/lib/session";
import { checkQuoteAnswer, checkQuoteRequest, formatQuantity, isQuoteOnly } from "@/lib/sourcing";
import { formatMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * Requests for quote against bulk-sourcing listings.
 *
 * A sourcing marketplace has no order API and no fixed unit price, so this is
 * where a store asks: the request is recorded against the store, the sourcing
 * desk answers it, and an accepted quote is what lets the listing be copied in
 * and priced. Any order that later comes out of it still routes to manual
 * handling, because the marketplace cannot be sent a job.
 */
export async function requestQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");

  const product = await getCatalogProduct(catalogId);
  if (!product || !isQuoteOnly(product)) {
    return { status: "error", message: "That listing is not quoted for bulk runs." };
  }

  const checked = checkQuoteRequest(
    {
      quantity: String(formData.get("quantity") ?? ""),
      destination: String(formData.get("destination") ?? ""),
      targetUnitCost: String(formData.get("targetUnitCost") ?? ""),
      neededBy: String(formData.get("neededBy") ?? ""),
      customisation: String(formData.get("customisation") ?? ""),
      contactName: String(formData.get("contactName") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      submissionKey: String(formData.get("submissionKey") ?? ""),
    },
    product,
  );
  if (!checked.ok) return { status: "error", message: checked.message, field: checked.field };
  const input = checked.value;

  // The form key is minted once per filled-in form, so a double click, a slow
  // reply or a retried submission all carry the same one and the supplier is
  // asked a single time.
  if (input.submissionKey) {
    const existing = await getQuoteRequestByKey(input.submissionKey);
    if (existing) {
      return {
        status: "success",
        message: `Request ${existing.code} is already with the sourcing desk. It appears below with its status.`,
      };
    }
  }

  const supplier = await getSupplier(product.supplierId);
  const request = await createQuoteRequest({
    storeId: store.id,
    storeName: store.name,
    agencyId: store.agencyId,
    catalogProductId: product.id,
    productName: product.name,
    supplierId: product.supplierId,
    supplierName: supplier?.name ?? "Unknown supplier",
    currency: product.currency,
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
    summary: `Requested a quote for ${formatQuantity(input.quantity)} of “${product.name}” from ${request.supplierName}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "quote_request",
    entityId: request.id,
    meta: { code: request.code, catalogId: product.id, quantity: input.quantity, destination: input.destination },
  });

  revalidatePath(`/app/stores/${storeId}/sourcing`);
  return {
    status: "success",
    message: `Request ${request.code} is with ${request.supplierName}. Bulk enquiries are answered in ${product.bulkSourcing.responseDays[0]}–${product.bulkSourcing.responseDays[1]} working days, and the status appears below.`,
  };
}

/** A store cancelling a request it no longer needs. The record is kept. */
export async function withdrawQuoteRequest(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");

  const request = await getQuoteRequest(requestId);
  if (!request || request.storeId !== storeId) throw new Error("That quote request is not in this store.");
  // A request already answered or already withdrawn stays as it is: a second
  // click must not overwrite the supplier's reply.
  if (request.status === "submitted") {
    await updateQuoteRequest(request.id, { status: "withdrawn" });
    recordAudit({
      category: "sourcing",
      action: "sourcing.quote_withdrawn",
      summary: `Withdrew quote request ${request.code} for “${request.productName}”`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "quote_request",
      entityId: request.id,
      meta: { code: request.code },
    });
  }

  revalidatePath(`/app/stores/${storeId}/sourcing`);
}

/* ------------------------------------------------- the platform's own queue */

/** The sourcing desk writing a supplier's price back against a request. */
export async function answerQuoteRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const request = await getQuoteRequest(requestId);
  if (!request) return { status: "error", message: "That quote request no longer exists." };
  if (request.status === "withdrawn") {
    return { status: "error", message: `${request.code} was withdrawn by the store.` };
  }

  const checked = checkQuoteAnswer(
    {
      unitCost: String(formData.get("unitCost") ?? ""),
      leadTimeDays: String(formData.get("leadTimeDays") ?? ""),
      validUntil: String(formData.get("validUntil") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    request.currency,
  );
  if (!checked.ok) return { status: "error", message: checked.message, field: checked.field };

  await updateQuoteRequest(request.id, {
    status: "quoted",
    response: { ...checked.value, answeredBy: user.name, answeredAt: new Date().toISOString() },
  });

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_answered",
    summary: `Quoted ${formatMoney(checked.value.unitCost, request.currency)} a unit on ${request.code} for ${request.storeName}`,
    storeId: request.storeId,
    agencyId: request.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "quote_request",
    entityId: request.id,
    meta: { code: request.code, unitCost: checked.value.unitCost, leadTimeDays: checked.value.leadTimeDays },
  });

  revalidatePath("/admin/quotes");
  revalidatePath(`/app/stores/${request.storeId}/sourcing`);
  return {
    status: "success",
    message: `${request.code} is quoted at ${formatMoney(checked.value.unitCost, request.currency)} a unit. The store can copy the listing in at that cost.`,
  };
}

/** No supplier took the run on. The store is told, with the reason. */
export async function declineQuoteRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (reason.length < 5) {
    return { status: "error", message: "Say why the request was declined.", field: "reason" };
  }

  const request = await getQuoteRequest(requestId);
  if (!request) return { status: "error", message: "That quote request no longer exists." };

  await updateQuoteRequest(request.id, {
    status: "declined",
    response: {
      unitCost: 0,
      leadTimeDays: 0,
      validUntil: "",
      notes: reason,
      answeredBy: user.name,
      answeredAt: new Date().toISOString(),
    },
  });

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

  revalidatePath("/admin/quotes");
  revalidatePath(`/app/stores/${request.storeId}/sourcing`);
  return { status: "success", message: `${request.code} is marked declined and the store can see why.` };
}
