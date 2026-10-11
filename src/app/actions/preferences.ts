"use server";

import { isLocale } from "@/i18n/locales";
import { updateUser } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

/**
 * Saves the language the signed-in user reads the workspace in. Setting the
 * same value twice is harmless, so a double click or a retry needs no guard.
 */
export async function setUiLanguage(locale: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !isLocale(locale)) return { ok: false };
  await updateUser(user.id, { uiLanguage: locale });
  return { ok: true };
}
