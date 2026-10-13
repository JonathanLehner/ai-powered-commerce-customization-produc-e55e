"use server";

import { getTranslations } from "next-intl/server";
import type { StoreDomain } from "@/lib/domains";
import { refusal } from "@/lib/operations/action-state";
import {
  connectDomain as connect,
  findDomain,
  refreshDomains as refreshAll,
  removeDomain as remove,
  setPrimaryDomain as makePrimary,
} from "@/lib/operations/domains";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

/**
 * The Domains page. Every action needs the settings capability, which only
 * store administrators hold.
 */

export async function connectDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.domains");
  try {
    const connected = await connect(await operationContext(access), {
      hostname: String(formData.get("hostname") ?? ""),
      includeCompanion: formData.get("includeCompanion") === "on",
      primary: formData.get("primary") === "on",
    });
    const names = connected.map((domain) => domain.hostname).join(", ");
    return {
      status: "success",
      message: connected.some((domain) => domain.status === "pending_setup")
        ? t("savedPendingSetup", { domains: names })
        : t("connected", { domains: names }),
    };
  } catch (error) {
    return refusal(error);
  }
}

/** Checks every domain not serving yet. The page polls this while one is pending. */
export async function refreshDomains(storeId: string): Promise<StoreDomain[]> {
  const access = await assertStoreAccess(storeId, "store.settings");
  return refreshAll(await operationContext(access));
}

export async function setPrimaryDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.domains");
  const domain = await findDomain(storeId, String(formData.get("domainId") ?? ""));
  if (!domain) return { status: "error", message: t("notFound") };
  try {
    await makePrimary(await operationContext(access), domain);
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("primarySet", { domain: domain.hostname }) };
}

export async function removeDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.domains");
  const domain = await findDomain(storeId, String(formData.get("domainId") ?? ""));
  // Already gone: a second click on Remove, or another tab.
  if (!domain) return { status: "success", message: t("removedAlready") };
  try {
    await remove(await operationContext(access), domain);
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("removed", { domain: domain.hostname }) };
}
