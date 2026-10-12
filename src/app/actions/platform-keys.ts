"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { API_KEY_NAME_LIMIT, createPlatformApiKey, revokePlatformApiKey } from "@/lib/api-keys";
import { assertPlatformAdmin } from "@/lib/session";
import type { CreateKeyState } from "./api-keys";

/** Platform keys: made and revoked only by a signed-in platform administrator. */

const PAGE = "/admin/api-keys";

export async function createPlatformKey(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("apiKeys.errors");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: t("nameRequired"), field: "name" };
  if (name.length > API_KEY_NAME_LIMIT) {
    return { status: "error", message: t("nameTooLong", { max: API_KEY_NAME_LIMIT }), field: "name" };
  }

  const result = await createPlatformApiKey(user, {
    name,
    submissionKey: String(formData.get("submissionKey") ?? "") || null,
  });
  revalidatePath(PAGE);
  if (result.status === "duplicate") return { status: "error", message: t("duplicate") };
  return {
    status: "success",
    message: (await getTranslations("apiKeys"))("created"),
    secret: result.secret,
    name: result.key.name,
  };
}

export async function revokePlatformKey(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  await revokePlatformApiKey(user, String(formData.get("keyId") ?? ""));
  revalidatePath(PAGE);
}
