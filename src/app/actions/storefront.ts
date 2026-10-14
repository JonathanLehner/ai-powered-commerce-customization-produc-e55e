"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import {
  publishStorefront as publish,
  restoreStorefrontVersion as restore,
  revertStorefront as revert,
  saveStorefrontDraft as saveDraft,
} from "@/lib/operations/storefront";
import { saveBranding } from "@/lib/operations/store-settings";
import { applyTemplate } from "@/lib/operations/templates";
import { isLocale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { siteOrigin } from "@/lib/email";
import { templatePreviewLink } from "@/lib/storefront-preview";
import { getTemplate } from "@/lib/templates/index";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { StoreDesign } from "@/lib/store-design";
import { THEMES, type ThemeKey } from "@/lib/types";
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

/** The editor's Design panel: the preset and the tokens on top of it. They apply to the live storefront straight away. */
export async function saveStoreDesign(input: { storeId: string; theme: string; design: StoreDesign }): Promise<ActionState> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  const theme = (input.theme in THEMES ? input.theme : access.store.theme) as ThemeKey;
  try {
    await saveBranding(await operationContext(access), { theme, logoUrl: access.store.logoUrl, design: input.design ?? {} });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("designSaved") };
}

/** Makes a template the storefront draft, keeping the draft it replaces in the history. */
export async function applyStoreTemplate(input: {
  storeId: string;
  templateId: string;
  addStarterProducts?: boolean;
}): Promise<ActionState> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    const result = await applyTemplate(await operationContext(access), {
      templateId: input.templateId,
      addStarterProducts: input.addStarterProducts === true,
    });
    return {
      status: "success",
      message: result.productsAdded.length > 0 ? t("templateAppliedWithProducts", { count: result.productsAdded.length }) : t("templateApplied"),
    };
  } catch (error) {
    return refusal(error);
  }
}

/** A signed link to the store's products in a template, before it is applied. */
export async function previewStoreTemplate(input: { storeId: string; templateId: string; locale: string }): Promise<{ url: string } | { error: string }> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const template = getTemplate(input.templateId);
  if (!template) return { error: (await getTranslations("actions.storefront"))("templateMissing") };
  const { locales, defaultLocale } = storeLanguages(access.store);
  const locale = isLocale(input.locale) && locales.includes(input.locale) ? input.locale : defaultLocale;
  return { url: (await templatePreviewLink(access.store, template.id, locale, await siteOrigin())).url };
}
