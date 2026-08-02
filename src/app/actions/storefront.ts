"use server";

import { revalidatePath } from "next/cache";
import { getStorefront, recordAudit, updateStorefront } from "@/lib/data";
import { assertStoreAccess } from "@/lib/session";
import { sectionsFromTree } from "@/lib/storefront-schema";
import type { StorefrontVersion } from "@/lib/types";
import { newId } from "@/lib/util";
import type { ActionState } from "./stores";

function parseTree(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "ROOT" in parsed) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

export async function saveStorefrontDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const raw = String(formData.get("tree") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.storefront");

  const tree = parseTree(raw);
  if (!tree) return { status: "error", message: "The layout could not be read. Reload the editor and try again." };

  await updateStorefront(storeId, { draft: tree, draftUpdatedAt: new Date().toISOString() });
  recordAudit({
    category: "publishing",
    action: "storefront.draft_saved",
    summary: `Saved a storefront draft with ${sectionsFromTree(tree).length} sections`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "storefront",
    entityId: storeId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/storefront`);
  return { status: "success", message: "Draft saved. Shoppers still see the published version." };
}

export async function publishStorefront(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const raw = String(formData.get("tree") ?? "");
  const label = String(formData.get("label") ?? "").trim() || "Untitled version";
  // The existing storefront is needed for its version history, and it is
  // fetched alongside the access check instead of after it.
  const [{ user, store }, storefront] = await Promise.all([
    assertStoreAccess(storeId, "store.storefront"),
    getStorefront(storeId),
  ]);

  const tree = parseTree(raw);
  if (!tree) return { status: "error", message: "The layout could not be read. Reload the editor and try again." };
  const sections = sectionsFromTree(tree);
  if (sections.length === 0) {
    return { status: "error", message: "Add at least one section before publishing — an empty page is not useful to shoppers." };
  }
  if (store.status === "archived") {
    return { status: "error", message: "This store is archived, so its storefront cannot be published. Restore the store first." };
  }

  const now = new Date().toISOString();
  const version: StorefrontVersion = {
    id: newId("ver"),
    label,
    data: tree,
    savedAt: now,
    savedBy: user.name,
  };
  const history = [version, ...(storefront?.history ?? [])].slice(0, 10);

  await updateStorefront(storeId, {
    draft: tree,
    published: tree,
    publishedAt: now,
    publishedBy: user.name,
    draftUpdatedAt: now,
    history,
  });
  recordAudit({
    category: "publishing",
    action: "storefront.published",
    summary: `Published storefront layout “${label}” with ${sections.length} sections`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "storefront",
    entityId: storeId,
    meta: { sections: sections.length, label },
  });

  revalidatePath(`/app/stores/${storeId}/storefront`);
  revalidatePath(`/s/${store.slug}`);
  return { status: "success", message: `Published. ${sections.length} sections are now live on the storefront.` };
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
    summary: `Restored storefront version “${version.label}” into the draft`,
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
