"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import {
  publishStorefront as publish,
  restoreStorefrontVersion as restore,
  revertStorefront as revert,
  saveStorefrontDraft as saveDraft,
} from "@/lib/operations/storefront";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

export async function saveStorefrontDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    await saveDraft(await operationContext(access), {
      tree: String(formData.get("tree") ?? ""),
      label: String(formData.get("label") ?? ""),
      locale: String(formData.get("locale") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("draftSaved") };
}

export async function publishStorefront(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    await publish(await operationContext(access), {
      tree: String(formData.get("tree") ?? ""),
      label: String(formData.get("label") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("published") };
}

export async function revertStorefront(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  await revert(await operationContext(access));
}

export async function restoreVersion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  await restore(await operationContext(access), versionId);
}
