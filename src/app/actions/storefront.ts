"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getStorefront, recordAudit, updateStorefront } from "@/lib/data";
import { refusal } from "@/lib/operations/action-state";
import { publishStorefront as publish, saveStorefrontDraft as saveDraft } from "@/lib/operations/storefront";
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
  const [{ user, store }, storefront] = await Promise.all([
    assertStoreAccess(storeId, "store.storefront"),
    getStorefront(storeId),
  ]);
  if (!storefront?.published) return;

  await updateStorefront(storeId, {
    draft: storefront.published,
    draftUpdatedAt: new Date().toISOString(),
  });
  recordAudit({
    category: "publishing",
    action: "storefront.reverted",
    summary: "Reverted the storefront draft to the published version",
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "storefront",
    entityId: storeId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/storefront`);
}

export async function restoreVersion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const [{ user, store }, storefront] = await Promise.all([
    assertStoreAccess(storeId, "store.storefront"),
    getStorefront(storeId),
  ]);
  const version = storefront?.history.find((v) => v.id === versionId);
  if (!version) return;

  await updateStorefront(storeId, {
    draft: version.data,
    draftUpdatedAt: new Date().toISOString(),
  });
  recordAudit({
    category: "publishing",
    action: "storefront.version_restored",
    summary: version.label
      ? `Restored storefront version “${version.label}” into the draft`
      : `Restored a ${version.kind === "draft" ? "saved draft" : "published version"} from ${version.savedAt.slice(0, 10)} into the draft`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "storefront",
    entityId: versionId,
    meta: { label: version.label },
  });
  revalidatePath(`/app/stores/${storeId}/storefront`);
}
