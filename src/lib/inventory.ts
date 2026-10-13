import "server-only";
import { COLLECTIONS, recordAudit } from "./data";
import {
  availableOf,
  canSell,
  crossedLow,
  inventorySettings,
  levelId,
  stockLines,
} from "./inventory-rules";
import { db } from "./mongo";
import type {
  InventoryAdjustment,
  InventoryLevel,
  InventoryPolicy,
  InventoryReason,
  Order,
  OrderInventory,
  Store,
} from "./types";
import { newId } from "./util";
import { emitInventoryWebhook } from "./webhook-events";

/**
 * Stock of a store's variants, and every write to it.
 *
 * Each change is a single conditional `$inc` on the variant's level, so two
 * checkouts after the last unit cannot both have it: the second update's
 * filter no longer matches. Moves of an order's stock are guarded on the
 * order's own `inventory.state`, so a webhook delivered twice, or a payment
 * and a cancellation racing, moves the stock once.
 */

export interface StockActor {
  id: string;
  name: string;
}

const SYSTEM: StockActor = { id: "system", name: "Parcelith" };

/** What a change is logged under: the product and variant as the store names them. */
export interface VariantLabel {
  productName: string;
  variantName: string;
  sku: string;
}

export function listLevels(storeId: string): Promise<InventoryLevel[]> {
  return db.find<InventoryLevel>(COLLECTIONS.inventoryLevels, { storeId });
}

export function levelsForProducts(productIds: string[]): Promise<InventoryLevel[]> {
  return db.findIn<InventoryLevel>(COLLECTIONS.inventoryLevels, "productId", productIds);
}

export function getLevel(productId: string, variantId: string): Promise<InventoryLevel | null> {
  return db.findOne<InventoryLevel>(COLLECTIONS.inventoryLevels, { id: levelId(productId, variantId) });
}

/** The newest changes first, optionally for one variant. */
export function listAdjustments(
  storeId: string,
  options: { productId?: string; variantId?: string; limit?: number } = {},
): Promise<InventoryAdjustment[]> {
  return db.find<InventoryAdjustment>(
    COLLECTIONS.inventoryAdjustments,
    {
      storeId,
      ...(options.productId ? { productId: options.productId } : {}),
      ...(options.variantId ? { variantId: options.variantId } : {}),
    },
    { sort: { at: -1, id: -1 }, limit: options.limit ?? 100 },
  );
}

/* ------------------------------------------------------------- checkout */

export type ReserveResult =
  | { ok: true; inventory: OrderInventory | null }
  | { ok: false; productId: string; variantId: string; available: number };

/**
 * Holds the basket's units on its tracked variants for one order. Either every
 * line is held or none is: a line that cannot be gives back the ones before it.
 */
export async function reserveStock(
  items: { storeProductId: string; variantId: string; quantity: number }[],
): Promise<ReserveResult> {
  const held: OrderInventory["lines"] = [];
  for (const line of stockLines(items)) {
    const id = levelId(line.productId, line.variantId);
    const result = await db.updateOne(
      COLLECTIONS.inventoryLevels,
      {
        id,
        tracked: true,
        $or: [
          { policy: "continue" },
          { $expr: { $gte: [{ $subtract: ["$onHand", "$committed"] }, line.quantity] } },
        ],
      },
      { $inc: { committed: line.quantity }, $set: { updatedAt: new Date().toISOString() } },
    );
    if (result.matchedCount === 1) {
      held.push(line);
      continue;
    }
    const level = await db.findOne<InventoryLevel>(COLLECTIONS.inventoryLevels, { id });
    // Not tracked, or no longer: nothing to hold.
    if (!level || !level.tracked) continue;
    await releaseLines(held);
    return { ok: false, productId: line.productId, variantId: line.variantId, available: Math.max(0, availableOf(level)) };
  }
  return { ok: true, inventory: held.length > 0 ? { state: "reserved", lines: held } : null };
}

/** Gives back units held for a checkout that never became an order. */
export async function releaseLines(lines: OrderInventory["lines"]): Promise<void> {
  for (const line of lines) {
    await db.updateOne(
      COLLECTIONS.inventoryLevels,
      { id: levelId(line.productId, line.variantId) },
      { $inc: { committed: -line.quantity }, $set: { updatedAt: new Date().toISOString() } },
    );
  }
}

/** Moves the order's stock from one state to the next, once. False when another call already did. */
async function claimOrderStock(
  order: Order,
  from: OrderInventory["state"],
  set: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<OrderInventory | null> {
  const updated = await db.findOneAndUpdate<Order>(
    COLLECTIONS.orders,
    { id: order.id, "inventory.state": from, ...extra },
    { $set: set },
  );
  return updated?.inventory ?? null;
}

function labelFor(order: Order, variantId: string): VariantLabel {
  const item = order.items.find((i) => i.variantId === variantId);
  return { productName: item?.productName ?? "", variantName: item?.variantName ?? "", sku: "" };
}

/** Takes the paid order's units off hand. Runs once per order, whoever calls it. */
export async function commitOrderStock(order: Order, store: Store): Promise<boolean> {
  const inventory = await claimOrderStock(order, "reserved", { "inventory.state": "committed" });
  if (!inventory) return false;
  for (const line of inventory.lines) {
    await applyDelta(store, line, { onHand: -line.quantity, committed: -line.quantity }, {
      reason: "sold",
      reference: order.code,
      actor: { id: "system", name: "Shopper" },
      label: labelFor(order, line.variantId),
      // The checkout already took the units out of available; the sale is
      // what crosses the threshold, so it is judged from before the hold.
      availableBefore: (after) => availableOf(after) + line.quantity,
    });
  }
  return true;
}

/** Gives back what an unpaid order held. Runs once per order. */
export async function releaseOrderStock(order: Order): Promise<boolean> {
  const inventory = await claimOrderStock(order, "reserved", { "inventory.state": "released" });
  if (!inventory) return false;
  await releaseLines(inventory.lines);
  return true;
}

/** Puts a refunded order's units back on hand. Runs once per order. */
export async function restockOrder(order: Order, store: Store, actor: StockActor): Promise<boolean> {
  const now = new Date().toISOString();
  const inventory = await claimOrderStock(order, "committed", { "inventory.restockedAt": now }, {
    "inventory.restockedAt": { $in: [null] },
  });
  if (!inventory) return false;
  for (const line of inventory.lines) {
    await applyDelta(store, line, { onHand: line.quantity, committed: 0 }, {
      reason: "restock",
      reference: order.code,
      actor,
      label: labelFor(order, line.variantId),
    });
  }
  return true;
}

/**
 * The tracked lines of orders raised without a checkout (a paid gift campaign),
 * to be taken off hand straight away with `deductStock`.
 */
export async function trackedLines(
  items: { storeProductId: string; variantId: string; quantity: number }[],
): Promise<OrderInventory["lines"]> {
  const lines = stockLines(items);
  const levels = await db.findIn<InventoryLevel>(
    COLLECTIONS.inventoryLevels,
    "id",
    lines.map((line) => levelId(line.productId, line.variantId)),
  );
  const tracked = new Set(levels.filter((level) => level.tracked).map((level) => level.id));
  return lines.filter((line) => tracked.has(levelId(line.productId, line.variantId)));
}

/** Takes units of an already-paid order off hand, however many are left. */
export async function deductStock(order: Order, store: Store): Promise<void> {
  for (const line of order.inventory?.lines ?? []) {
    await applyDelta(store, line, { onHand: -line.quantity, committed: 0 }, {
      reason: "sold",
      reference: order.code,
      actor: SYSTEM,
      label: labelFor(order, line.variantId),
    });
  }
}

/* ------------------------------------------------------ changes by hand */

/** Creates the variant's level, untracked and empty, unless it has one. */
async function ensureLevel(storeId: string, productId: string, variantId: string): Promise<void> {
  await db.upsertOne(
    COLLECTIONS.inventoryLevels,
    { id: levelId(productId, variantId) },
    {
      $setOnInsert: {
        id: levelId(productId, variantId),
        storeId,
        productId,
        variantId,
        tracked: false,
        policy: "deny",
        onHand: 0,
        committed: 0,
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

export interface StockChange {
  tracked?: boolean;
  policy?: InventoryPolicy;
  /** Sets the units available to this. */
  available?: number;
  /** Adds this many units on hand (negative takes them away). */
  delta?: number;
  reason: InventoryReason;
}

/**
 * Applies one change to a variant's stock. Setting the available units reads
 * the level and writes the difference with a write guarded on what it read, so
 * a checkout landing in between is never overwritten: the write misses, and
 * the next attempt works from the new count.
 */
export async function changeStock(
  store: Store,
  target: { productId: string; variantId: string; label: VariantLabel },
  change: StockChange,
  actor: StockActor,
): Promise<InventoryLevel> {
  const { productId, variantId } = target;
  const id = levelId(productId, variantId);
  await ensureLevel(store.id, productId, variantId);
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (change.tracked !== undefined) set.tracked = change.tracked;
  if (change.policy) set.policy = change.policy;

  for (let attempt = 0; attempt < 8; attempt++) {
    const level = await db.findOne<InventoryLevel>(COLLECTIONS.inventoryLevels, { id });
    if (!level) break;
    const delta =
      change.available !== undefined ? change.available - availableOf(level) : (change.delta ?? 0);
    const result = await db.updateOne(
      COLLECTIONS.inventoryLevels,
      { id, onHand: level.onHand, committed: level.committed },
      { $set: set, ...(delta !== 0 ? { $inc: { onHand: delta } } : {}) },
    );
    if (result.matchedCount === 0) continue;
    const after: InventoryLevel = { ...level, ...(set as Partial<InventoryLevel>), onHand: level.onHand + delta };
    if (delta !== 0) {
      await logAdjustment(store, after, delta, { reason: change.reason, reference: null, actor, label: target.label });
    } else if (change.tracked !== undefined || change.policy) {
      emitInventoryWebhook(store.id, id);
    }
    await warnIfLow(store, availableOf(level), after, target.label);
    return after;
  }
  throw new Error(`Stock of ${id} kept changing; try again.`);
}

/* -------------------------------------------------------------- shared */

interface DeltaContext {
  reason: InventoryReason;
  reference: string | null;
  actor: StockActor;
  label: VariantLabel;
  availableBefore?: (after: InventoryLevel) => number;
}

async function applyDelta(
  store: Store,
  line: { productId: string; variantId: string },
  inc: { onHand: number; committed: number },
  context: DeltaContext,
): Promise<void> {
  const after = await db.findOneAndUpdate<InventoryLevel>(
    COLLECTIONS.inventoryLevels,
    { id: levelId(line.productId, line.variantId) },
    { $inc: inc, $set: { updatedAt: new Date().toISOString() } },
  );
  if (!after) return;
  if (inc.onHand !== 0) await logAdjustment(store, after, inc.onHand, context);
  const before = context.availableBefore
    ? context.availableBefore(after)
    : availableOf({ onHand: after.onHand - inc.onHand, committed: after.committed - inc.committed });
  await warnIfLow(store, before, after, context.label);
}

async function logAdjustment(store: Store, level: InventoryLevel, delta: number, context: DeltaContext) {
  const sku = context.label.sku || (await variantSku(level));
  const entry: InventoryAdjustment = {
    id: newId("adj"),
    storeId: store.id,
    productId: level.productId,
    variantId: level.variantId,
    productName: context.label.productName,
    variantName: context.label.variantName,
    sku,
    delta,
    onHandAfter: level.onHand,
    reason: context.reason,
    reference: context.reference,
    actorId: context.actor.id,
    actorName: context.actor.name,
    at: new Date().toISOString(),
  };
  await db.insertOne(COLLECTIONS.inventoryAdjustments, entry as unknown as Record<string, unknown>);
  emitInventoryWebhook(store.id, level.id);
}

async function variantSku(level: InventoryLevel): Promise<string> {
  const product = await db.findOne<{ variants: { id: string; sku: string }[] }>(COLLECTIONS.storeProducts, {
    id: level.productId,
  });
  return product?.variants.find((v) => v.id === level.variantId)?.sku ?? "";
}

/** Tells the store's team when a tracked variant drops to its low-stock threshold. */
async function warnIfLow(store: Store, before: number, after: InventoryLevel, label: VariantLabel): Promise<void> {
  if (!after.tracked) return;
  const settings = inventorySettings(store);
  const available = availableOf(after);
  if (!crossedLow(before, available, settings)) return;
  const name = [label.productName, label.variantName].filter(Boolean).join(" · ");
  recordAudit({
    category: "inventory",
    action: "inventory.low_stock",
    summary: `${name} is low on stock: ${available} available`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Parcelith",
    entity: "variant",
    entityId: after.variantId,
    meta: { available, threshold: settings.lowStockThreshold },
    notify: {
      type: "low_stock",
      href: `/app/stores/${store.id}/catalog/inventory?filter=low`,
      params: { name, count: Math.max(0, available) },
    },
  });
}

/** The products none of whose variants on sale can be bought, for the "Sold out" tile badge. */
export async function soldOutProducts(
  products: { id: string; variants: { id: string; enabled: boolean }[] }[],
): Promise<Set<string>> {
  const levels = await levelsForProducts(products.map((p) => p.id));
  const byId = new Map(levels.map((level) => [level.id, level]));
  return new Set(
    products
      .filter((p) => {
        const onSale = p.variants.filter((v) => v.enabled);
        return onSale.length > 0 && onSale.every((v) => !canSell(byId.get(levelId(p.id, v.id))));
      })
      .map((p) => p.id),
  );
}
