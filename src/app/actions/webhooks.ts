"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import {
  createEndpoint,
  deleteEndpoint,
  findDelivery,
  findEndpoint,
  resendDelivery as resend,
  rotateSecret,
  updateEndpoint,
} from "@/lib/operations/webhooks";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

/**
 * Settings → Webhooks. Every action needs the settings capability, which only
 * store administrators hold.
 */

export async function createWebhookEndpoint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  let endpointId: string;
  try {
    const endpoint = await createEndpoint(await operationContext(access), {
      url: String(formData.get("url") ?? ""),
      description: String(formData.get("description") ?? ""),
      topics: formData.getAll("topics"),
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
    endpointId = endpoint.id;
  } catch (error) {
    return refusal(error);
  }
  redirect(`/app/stores/${storeId}/setup/webhooks/${endpointId}`);
}

async function loadEndpoint(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const endpoint = await findEndpoint(storeId, String(formData.get("endpointId") ?? ""));
  return { access, endpoint, t: await getTranslations("actions.webhooks") };
}

export async function updateWebhookEndpoint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, endpoint, t } = await loadEndpoint(formData);
  if (!endpoint) return { status: "error", message: t("notFound") };
  try {
    await updateEndpoint(await operationContext(access), endpoint, {
      url: String(formData.get("url") ?? ""),
      description: String(formData.get("description") ?? ""),
      topics: formData.getAll("topics"),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("saved") };
}

export async function setWebhookEnabled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, endpoint, t } = await loadEndpoint(formData);
  if (!endpoint) return { status: "error", message: t("notFound") };
  const enabled = formData.get("enabled") === "true";
  try {
    await updateEndpoint(await operationContext(access), endpoint, { enabled });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t(enabled ? "enabled" : "disabled") };
}

export async function rotateWebhookSecret(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, endpoint, t } = await loadEndpoint(formData);
  if (!endpoint) return { status: "error", message: t("notFound") };
  await rotateSecret(await operationContext(access), endpoint);
  return { status: "success", message: t("secretRotated") };
}

export async function deleteWebhookEndpoint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, endpoint } = await loadEndpoint(formData);
  // Already gone: a second click, or another tab.
  if (endpoint) await deleteEndpoint(await operationContext(access), endpoint);
  redirect(`/app/stores/${access.store.id}/setup/webhooks`);
}

export async function resendWebhookDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.webhooks");
  const delivery = await findDelivery(storeId, String(formData.get("deliveryId") ?? ""));
  if (!delivery) return { status: "error", message: t("deliveryNotFound") };
  try {
    const sent = await resend(await operationContext(access), delivery);
    const last = sent.attempts.at(-1);
    return sent.status === "succeeded"
      ? { status: "success", message: t("resent", { code: last?.responseCode ?? 0 }) }
      : { status: "error", message: last?.responseCode ? t("resendFailedCode", { code: last.responseCode }) : t("resendFailed") };
  } catch (error) {
    return refusal(error);
  }
}
