"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import { isOperationError } from "@/lib/operations/context";
import {
  addImportPart,
  cancelImport,
  deleteRedirect as removeRedirect,
  importProgress,
  queueImport,
  saveRedirect as setRedirect,
  startImport,
} from "@/lib/operations/shopify-import";
import type { CsvRecord, ImportKind, ShopifyImportJob } from "@/lib/shopify";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

/**
 * The Import page. The browser reads and previews the files, then starts an
 * import, posts each file in parts and queues it; the page then watches its
 * progress. Store administrators only.
 */

export type ImportStep = { ok: true; job: ShopifyImportJob } | { ok: false; message: string };

async function step(storeId: string, run: (ctx: Awaited<ReturnType<typeof operationContext>>) => Promise<ShopifyImportJob>): Promise<ImportStep> {
  const access = await assertStoreAccess(storeId, "store.settings");
  try {
    return { ok: true, job: await run(await operationContext(access)) };
  } catch (error) {
    if (isOperationError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

export async function startShopifyImport(storeId: string, submissionKey: string): Promise<ImportStep> {
  return step(storeId, (ctx) => startImport(ctx, submissionKey || null));
}

export async function uploadShopifyImportPart(
  storeId: string,
  importId: string,
  input: { kind: ImportKind; part: number; header: string[]; records: CsvRecord[] },
): Promise<ImportStep> {
  return step(storeId, (ctx) => addImportPart(ctx, importId, input));
}

export async function queueShopifyImport(storeId: string, importId: string): Promise<ImportStep> {
  return step(storeId, (ctx) => queueImport(ctx, importId));
}

/** Polled by the progress screen while an import runs. */
export async function shopifyImportProgress(storeId: string, importId: string): Promise<ImportStep> {
  return step(storeId, (ctx) => importProgress(ctx, importId));
}

export async function cancelShopifyImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.import");
  try {
    await cancelImport(await operationContext(access), String(formData.get("importId") ?? ""));
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("cancelled") };
}

export async function saveRedirect(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.import");
  try {
    const saved = await setRedirect(await operationContext(access), {
      path: String(formData.get("path") ?? ""),
      target: String(formData.get("target") ?? ""),
    });
    return { status: "success", message: t("redirectSaved", { path: saved.path }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteRedirect(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.import");
  await removeRedirect(await operationContext(access), String(formData.get("redirectId") ?? ""));
  return { status: "success", message: t("redirectDeleted") };
}
