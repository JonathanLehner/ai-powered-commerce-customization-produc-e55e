"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import { findProduct } from "@/lib/operations/products";
import { importInventory, saveInventorySettings, updateVariantInventory } from "@/lib/operations/inventory";
import type { InventoryRow } from "@/lib/inventory-rules";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

export type InventoryRowState = ActionState & { row?: InventoryRow };

/** Saves one row of the Inventory page as it was edited in place. */
export async function saveInventoryRow(
  storeId: string,
  input: { productId: string; variantId: string; tracked: boolean; policy: string; available: string; reason: string },
): Promise<InventoryRowState> {
  let access;
  try {
    access = await assertStoreAccess(storeId, "store.catalog");
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const t = await getTranslations("actions.inventory");
  const product = await findProduct(storeId, input.productId);
  if (!product) return { status: "error", message: t("variantGone") };
  const raw = input.available.trim();
  try {
    const row = await updateVariantInventory(await operationContext(access), product, input.variantId, {
      tracked: input.tracked,
      policy: input.policy,
      available: raw === "" ? undefined : Number(raw),
      reason: input.reason,
    });
    return { status: "success", message: t("saved", { variant: `${row.productName} · ${row.variantName}` }), row };
  } catch (error) {
    return refusal(error);
  }
}

const MAX_FILE_BYTES = 1024 * 1024;

export async function importInventoryFile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.inventory");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: t("fileEmpty"), field: "file" };
  if (file.size > MAX_FILE_BYTES) return { status: "error", message: t("fileTooLarge"), field: "file" };
  try {
    const { updated, problems } = await importInventory(await operationContext(access), await file.text());
    if (problems.length > 0) {
      return {
        status: updated > 0 ? "success" : "error",
        message: t("importedWithProblems", {
          count: updated,
          skipped: problems.length,
          lines: problems
            .slice(0, 5)
            .map((p) => p.line)
            .join(", "),
        }),
      };
    }
    return { status: "success", message: t("imported", { count: updated }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveInventorySettingsForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.inventory");
  const raw = String(formData.get("lowStockThreshold") ?? "").trim();
  try {
    await saveInventorySettings(await operationContext(access), {
      lowStockThreshold: raw === "" ? Number.NaN : Number(raw),
      showLowStock: formData.get("showLowStock") === "on",
    });
    return { status: "success", message: t("settingsSaved") };
  } catch (error) {
    return refusal(error);
  }
}
