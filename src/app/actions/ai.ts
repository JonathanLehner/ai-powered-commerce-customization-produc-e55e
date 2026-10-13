"use server";

import { getLocale, getTranslations } from "next-intl/server";
import {
  applyAssistantSuggestion,
  assistantFailure,
  dismissAssistantSuggestion,
  dismissOlderSuggestions as dismissOlder,
  draftCopy,
  draftPrice,
  draftProductIdeas,
  draftSupplier,
} from "@/lib/operations/assistant";
import { refusal } from "@/lib/operations/action-state";
import { isOperationError } from "@/lib/operations/context";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

/** A refusal as the form shows it; the assistant failing, in words a person can act on. */
async function failed(error: unknown): Promise<ActionState> {
  if (isOperationError(error)) return refusal(error);
  return { status: "error", message: await assistantFailure(await getLocale(), error) };
}

export async function requestProductIdeas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const brief = String(formData.get("brief") ?? "").trim();
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.ai");

  try {
    const suggestions = await draftProductIdeas(await operationContext(access), brief);
    return { status: "success", message: t("ideas", { count: suggestions.length }) };
  } catch (error) {
    // "No matches" is about the brief as a whole; the form shows it without a field.
    const state = await failed(error);
    return { status: state.status, message: state.message };
  }
}

export async function requestCopy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.ai");

  try {
    const { product } = await draftCopy(await operationContext(access), productId);
    return { status: "success", message: t("copyDrafted", { name: product.name }) };
  } catch (error) {
    return failed(error);
  }
}

export async function requestPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.ai");

  try {
    const { product } = await draftPrice(await operationContext(access), productId);
    return { status: "success", message: t("priceDrafted", { name: product.name }) };
  } catch (error) {
    return failed(error);
  }
}

export async function requestSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const destination = String(formData.get("destination") ?? "North America");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.ai");

  try {
    const { catalogName } = await draftSupplier(await operationContext(access), catalogId, destination);
    return { status: "success", message: t("supplierDrafted", { name: catalogName }) };
  } catch (error) {
    return failed(error);
  }
}

/**
 * A suggestion that is gone or already decided is left as it is: the page
 * shows where it stands once it reloads. Anything else is thrown on.
 */
function ignoreRefusal(error: unknown) {
  if (isOperationError(error)) return;
  throw error;
}

/** Applying a suggestion is always an explicit, audited human decision. */
export async function applySuggestion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  await applyAssistantSuggestion(await operationContext(access), suggestionId).catch(ignoreRefusal);
}

export async function dismissSuggestion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  await dismissAssistantSuggestion(await operationContext(access), suggestionId).catch(ignoreRefusal);
}

/** Dismisses the older suggestions the page showed for one product. */
export async function dismissOlderSuggestions(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const suggestionIds = formData.getAll("suggestionId").map(String);
  const access = await assertStoreAccess(storeId, "store.catalog");
  await dismissOlder(await operationContext(access), productId, suggestionIds).catch(ignoreRefusal);
}
