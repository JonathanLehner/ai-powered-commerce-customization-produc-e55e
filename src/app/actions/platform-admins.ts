"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import { platformContext } from "@/lib/operations/admin";
import {
  addPlatformAdmin as add,
  removePlatformAdmin as remove,
  resendPlatformAdminInvitation as resend,
} from "@/lib/operations/platform-admins";
import { assertPlatformAdmin } from "@/lib/session";
import type { ActionState } from "./stores";

/**
 * /admin/admins. Each action checks the signed-in person is a platform
 * administrator and runs the operation the Admin API runs too.
 */

/** The invitation link is shown once, for the inviting administrator to pass on by hand. */
export interface PlatformAdminInviteState extends ActionState {
  url?: string;
}

export async function addPlatformAdmin(
  _prev: PlatformAdminInviteState,
  formData: FormData,
): Promise<PlatformAdminInviteState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("admin.admins");
  try {
    const { admin, invitationUrl } = await add(await platformContext(user), {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    return { status: "success", message: t("added", { email: admin.email }), url: invitationUrl };
  } catch (error) {
    return refusal(error);
  }
}

export async function resendPlatformAdminInvitation(
  _prev: PlatformAdminInviteState,
  formData: FormData,
): Promise<PlatformAdminInviteState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("admin.admins");
  try {
    const { admin, invitationUrl } = await resend(await platformContext(user), String(formData.get("userId") ?? ""));
    return { status: "success", message: t("resent", { email: admin.email }), url: invitationUrl };
  } catch (error) {
    return refusal(error);
  }
}

export async function removePlatformAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("admin.admins");
  try {
    const admin = await remove(await platformContext(user), String(formData.get("userId") ?? ""));
    return { status: "success", message: t("removed", { email: admin.email }) };
  } catch (error) {
    return refusal(error);
  }
}
