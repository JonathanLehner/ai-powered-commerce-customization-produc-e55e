import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { listStoreProducts, recordAudit, updateStore } from "../data";
import { changeStock, listLevels, type StockChange } from "../inventory";
import {
  INVENTORY_POLICIES,
  MANUAL_REASONS,
  MAX_STOCK,
  inventoryRows,
  inventorySettings,
  parseInventoryCsv,
  type InventoryImportProblem,
  type InventoryRow,
} from "../inventory-rules";
import type { InventoryLevel, InventoryPolicy, InventoryReason, InventorySettings, StoreProduct } from "../types";
import { OperationError, type OperationContext } from "./context";

/**
 * Stock as the store team works it: the Inventory page, its import, and the
 * Admin API all run these.
 */

export async function storeInventory(storeId: string, settings: InventorySettings): Promise<{
  rows: InventoryRow[];
  products: StoreProduct[];
  levels: InventoryLevel[];
}> {
  const [products, levels] = await Promise.all([listStoreProducts(storeId), listLevels(storeId)]);
  return { rows: inventoryRows(products, levels, settings), products, levels };
}

function revalidateInventory(storeId: string) {
  revalidatePath(`/app/stores/${storeId}/catalog/inventory`);
}

export interface InventoryInput {
  tracked?: boolean;
  policy?: string;
  /** Sets the units available. */
  available?: number;
  /** Adds units on hand; negative takes them away. */
  adjustBy?: number;
  reason?: string;
}

/** One variant's tracking, out-of-stock policy and quantity. */
export async function updateVariantInventory(
  ctx: OperationContext,
  product: StoreProduct,
  variantId: string,
  input: InventoryInput,
): Promise<InventoryRow> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.inventory" });
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) throw new OperationError("not_found", t("variantGone"));
  if (input.policy !== undefined && !INVENTORY_POLICIES.includes(input.policy as InventoryPolicy)) {
    throw new OperationError("invalid", t("choosePolicy"), "policy");
  }
  for (const [field, value] of [
    ["available", input.available],
    ["adjustBy", input.adjustBy],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || Math.abs(value) > MAX_STOCK)) {
      throw new OperationError("invalid", t("wholeNumber", { max: MAX_STOCK }), field);
    }
  }
  if (input.available !== undefined && input.adjustBy !== undefined) {
    throw new OperationError("invalid", t("oneQuantity"), "adjustBy");
  }
  const reason = (input.reason || "correction") as InventoryReason;
  if (!MANUAL_REASONS.includes(reason)) throw new OperationError("invalid", t("chooseReason"), "reason");

  const change: StockChange = {
    tracked: input.tracked,
    policy: input.policy as InventoryPolicy | undefined,
    available: input.available,
    delta: input.adjustBy,
    reason,
  };
  const level = await changeStock(
    ctx.store,
    { productId: product.id, variantId, label: { productName: product.name, variantName: variant.name, sku: variant.sku } },
    change,
    ctx.actor,
  );
  const row = inventoryRows([product], [level], inventorySettings(ctx.store)).find((r) => r.variantId === variantId)!;
  recordAudit({
    category: "inventory",
    action: "inventory.updated",
    summary: `Updated stock of ${product.name} · ${variant.name}: ${row.tracked ? `${row.available} available` : "not tracked"}`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "variant",
    entityId: variantId,
    meta: { sku: variant.sku, tracked: row.tracked, policy: row.policy, available: row.available, reason },
  });
  revalidateInventory(ctx.store.id);
  return row;
}

/** Applies an inventory file. Rows that cannot be read are reported by line; the rest are saved. */
export async function importInventory(
  ctx: OperationContext,
  text: string,
): Promise<{ updated: number; problems: InventoryImportProblem[] }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.inventory" });
  if (!text.trim()) throw new OperationError("invalid", t("fileEmpty"), "file");
  const settings = inventorySettings(ctx.store);
  const { rows, products } = await storeInventory(ctx.store.id, settings);
  const { changes, problems } = parseInventoryCsv(text, rows);
  if (changes.length === 0 && problems.length === 0) throw new OperationError("invalid", t("fileEmpty"), "file");
  if (changes.length > 5000) throw new OperationError("invalid", t("fileTooLong", { max: 5000 }), "file");

  const byId = new Map(products.map((p) => [p.id, p]));
  for (const change of changes) {
    const product = byId.get(change.productId)!;
    const variant = product.variants.find((v) => v.id === change.variantId)!;
    await changeStock(
      ctx.store,
      { productId: product.id, variantId: variant.id, label: { productName: product.name, variantName: variant.name, sku: variant.sku } },
      { tracked: change.tracked, policy: change.policy, available: change.available, reason: "import" },
      ctx.actor,
    );
  }
  recordAudit({
    category: "inventory",
    action: "inventory.imported",
    summary: `Imported stock for ${changes.length} variants`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta: { updated: changes.length, skipped: problems.length },
  });
  revalidateInventory(ctx.store.id);
  return { updated: changes.length, problems };
}

export async function saveInventorySettings(
  ctx: OperationContext,
  input: { lowStockThreshold: number; showLowStock: boolean },
): Promise<InventorySettings> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.inventory" });
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0 || input.lowStockThreshold > 10_000) {
    throw new OperationError("invalid", t("thresholdRange", { max: 10_000 }), "lowStockThreshold");
  }
  const settings: InventorySettings = { lowStockThreshold: input.lowStockThreshold, showLowStock: input.showLowStock };
  await updateStore(ctx.store.id, { inventory: settings });
  recordAudit({
    category: "inventory",
    action: "inventory.settings_updated",
    summary: `Low stock set to ${settings.lowStockThreshold} units${settings.showLowStock ? ", shown to shoppers" : ""}`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta: { lowStockThreshold: settings.lowStockThreshold, showLowStock: settings.showLowStock },
  });
  revalidateInventory(ctx.store.id);
  return settings;
}
