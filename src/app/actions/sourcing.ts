"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import { addSupplierQuote, declineEnquiry, platformContext } from "@/lib/operations/admin";
import { isOperationError } from "@/lib/operations/context";
import { acceptSupplierQuote, copyQuoteIntoCatalog, raiseQuoteRequest, withdrawEnquiry } from "@/lib/operations/sourcing";
import { assertPlatformAdmin, assertStoreAccess, operationContext } from "@/lib/session";
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

export async function requestQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.sourcing");

  try {
    const { request, alreadySent, supplierName, responseDays } = await raiseQuoteRequest(
      await operationContext(access),
      catalogId,
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
    );
    if (alreadySent) return { status: "success", message: t("alreadySent", { code: request.code }) };
    return {
      status: "success",
      message: responseDays
        ? t("sent", { code: request.code, supplier: supplierName, min: responseDays[0], max: responseDays[1] })
        : t("sentUsual", { code: request.code, supplier: supplierName }),
    };
  } catch (error) {
    // The form shows a refusal beside its field. A wrong catalog id is not a
    // field the person filled in, so it reads as before, without one.
    const state = refusal(error);
    return state.field === "catalogId" ? { status: "error", message: state.message } : state;
  }
}

/** The form's store and enquiry, after the same access check as before. */
async function storeEnquiryContext(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  return { ctx: await operationContext(access), requestId };
}

/**
 * A stale tab acting on an enquiry that has moved on is left as it is, as
 * the page will show once it reloads. Anything else is thrown on.
 */
function ignoreConflict(error: unknown) {
  if (isOperationError(error) && error.code === "conflict") return;
  throw error;
}

/** A store cancelling an enquiry it no longer needs. The record is kept. */
export async function withdrawQuoteRequest(formData: FormData): Promise<void> {
  const { ctx, requestId } = await storeEnquiryContext(formData);
  await withdrawEnquiry(ctx, requestId).catch(ignoreConflict);
}

/** The store picking the quote it will go with. The others stay on record. */
export async function acceptQuote(formData: FormData): Promise<void> {
  const { ctx, requestId } = await storeEnquiryContext(formData);
  await acceptSupplierQuote(ctx, requestId, String(formData.get("quoteId") ?? "")).catch(ignoreConflict);
}

/**
 * Copies the accepted quote into the store catalog. A second click or a stale
 * tab opens the product the first one made instead of copying again.
 */
export async function copyAcceptedQuote(formData: FormData): Promise<void> {
  const { ctx, requestId } = await storeEnquiryContext(formData);
  const { product, created } = await copyQuoteIntoCatalog(ctx, requestId);
  redirect(`/app/stores/${ctx.store.id}/catalog/${product.id}${created ? "?imported=1" : ""}`);
}

/* ------------------------------------------------- the platform's own queue */

/** The sourcing desk recording one supplier's quote against an enquiry. */
export async function recordSupplierQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const [t, locale] = await Promise.all([getTranslations("actions.sourcing"), getLocale()]);
  try {
    const { request, quote, alreadyRecorded } = await addSupplierQuote(await platformContext(user), {
      requestId: String(formData.get("requestId") ?? ""),
      quoteId: String(formData.get("submissionKey") ?? ""),
      supplierLabel: String(formData.get("supplierLabel") ?? ""),
      unitCost: String(formData.get("unitCost") ?? ""),
      minimumOrderQuantity: String(formData.get("minimumOrderQuantity") ?? ""),
      leadTimeDays: String(formData.get("leadTimeDays") ?? ""),
      validUntil: String(formData.get("validUntil") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      baseCatalogProductId: String(formData.get("baseCatalogProductId") ?? ""),
    });
    if (alreadyRecorded) return { status: "success", message: t("quoteAlreadyOn", { code: request.code }) };
    return {
      status: "success",
      message: t("quoteAdded", {
        supplier: quote.supplierLabel,
        amount: formatMoney(quote.unitCost, request.currency, locale),
        code: request.code,
      }),
    };
  } catch (error) {
    return refusal(error);
  }
}

/** No supplier took the run on. The store is told, with the reason. */
export async function declineQuoteRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("actions.sourcing");
  try {
    const request = await declineEnquiry(
      await platformContext(user),
      String(formData.get("requestId") ?? ""),
      String(formData.get("reason") ?? ""),
    );
    return { status: "success", message: t("declined", { code: request.code }) };
  } catch (error) {
    return refusal(error);
  }
}
