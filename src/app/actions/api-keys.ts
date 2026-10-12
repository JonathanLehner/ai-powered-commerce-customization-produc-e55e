"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { API_KEY_NAME_LIMIT, createApiKey, revokeApiKey } from "@/lib/api-keys";
import { API_RESOURCES, normalizeScopes } from "@/lib/api-scopes";
import { assertStoreAccess } from "@/lib/session";
import type { ActionState } from "./stores";

/** Keys are store settings: only a store administrator creates or revokes them. */

export interface CreateKeyState extends ActionState {
  /** The new key's secret, in this one answer and never again. */
  secret?: string;
  name?: string;
}

export async function createKey(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("apiKeys.errors");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: t("nameRequired"), field: "name" };
  if (name.length > API_KEY_NAME_LIMIT) {
    return { status: "error", message: t("nameTooLong", { max: API_KEY_NAME_LIMIT }), field: "name" };
  }
  const scopes = normalizeScopes(
    API_RESOURCES.map((resource) => `${resource}:${String(formData.get(`scope_${resource}`) ?? "")}`),
  );
  if (scopes.length === 0) return { status: "error", message: t("scopeRequired"), field: "scopes" };

  const result = await createApiKey(store, user, {
    name,
    scopes,
    submissionKey: String(formData.get("submissionKey") ?? "") || null,
  });
  revalidatePath(`/app/stores/${storeId}/setup/api-keys`);
  if (result.status === "duplicate") return { status: "error", message: t("duplicate") };
  return {
    status: "success",
    message: (await getTranslations("apiKeys"))("created"),
    secret: result.secret,
    name: result.key.name,
  };
}

export async function revokeKey(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const keyId = String(formData.get("keyId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  await revokeApiKey(store, user, keyId);
  revalidatePath(`/app/stores/${storeId}/setup/api-keys`);
}
