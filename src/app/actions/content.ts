"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { isContentKind, isMenuName } from "@/lib/content";
import { refusal } from "@/lib/operations/action-state";
import {
  createEntry as addEntry,
  deleteEntry as removeEntry,
  findEntry,
  saveEntry as storeEntry,
  saveEntryTranslation,
  saveMenu as storeMenu,
} from "@/lib/operations/content";
import { assertStoreAccess, operationContext } from "@/lib/session";
import { readStoredImage } from "@/lib/uploads";
import type { ActionState } from "./stores";

/** Pages, blog posts and menus are storefront content: whoever may edit the storefront may edit them. */
const CAPABILITY = "store.storefront";

export async function createEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const t = await getTranslations("actions.content");
  if (!isContentKind(kind)) return { status: "error", message: t("kindInvalid") };

  let entryId: string;
  try {
    const { entry } = await addEntry(await operationContext(access), {
      kind,
      title: String(formData.get("title") ?? ""),
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
    entryId = entry.id;
  } catch (error) {
    return refusal(error);
  }
  redirect(`/app/stores/${storeId}/content/${entryId}?created=1`);
}

export async function saveEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const t = await getTranslations("actions.content");
  const entry = await findEntry(storeId, String(formData.get("entryId") ?? ""));
  if (!entry) return { status: "error", message: t("notFound") };

  const uploaded = readStoredImage(formData, "cover", "collection");
  const coverImageUrl = formData.get("removeCover") ? null : (uploaded?.url ?? entry.coverImageUrl);
  const status = formData.get("published") ? "published" : "draft";
  try {
    const saved = await storeEntry(await operationContext(access), entry, {
      title: String(formData.get("title") ?? ""),
      handle: String(formData.get("handle") ?? ""),
      body: String(formData.get("body") ?? ""),
      excerpt: String(formData.get("excerpt") ?? ""),
      seoTitle: String(formData.get("seoTitle") ?? ""),
      seoDescription: String(formData.get("seoDescription") ?? ""),
      coverImageUrl,
      status,
    });
    return { status: "success", message: saved.status === "published" ? t("savedLive") : t("savedDraft") };
  } catch (error) {
    return refusal(error);
  }
}

export async function translateEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const t = await getTranslations("actions.content");
  const entry = await findEntry(storeId, String(formData.get("entryId") ?? ""));
  if (!entry) return { status: "error", message: t("notFound") };
  const locale = String(formData.get("locale") ?? "");
  const values: Record<string, string> = {};
  for (const key of ["title", "excerpt", "body", "seoTitle", "seoDescription"]) {
    values[key] = String(formData.get(key) ?? "");
  }
  try {
    await saveEntryTranslation(await operationContext(access), entry, locale, values);
    return { status: "success", message: t("translationSaved") };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const entry = await findEntry(storeId, String(formData.get("entryId") ?? ""));
  if (entry) await removeEntry(await operationContext(access), entry);
  redirect(`/app/stores/${storeId}/content${entry?.kind === "post" ? "?kind=post" : ""}`);
}

export async function saveMenu(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const name = String(formData.get("menu") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const t = await getTranslations("actions.content");
  if (!isMenuName(name)) return { status: "error", message: t("menuInvalid") };
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { status: "error", message: t("menuInvalid") };
  }
  try {
    await storeMenu(await operationContext(access), name, items);
    return { status: "success", message: t("menuSaved") };
  } catch (error) {
    return refusal(error);
  }
}
