import "server-only";
import { presentOrder, presentProduct } from "./api/present";
import { COLLECTIONS, getOrder, getStore, getStoreProduct } from "./data";
import { availableOf } from "./inventory-rules";
import { db } from "./mongo";
import type { Customer, InventoryLevel, StoreProduct } from "./types";
import type { WebhookTopic } from "./webhook-rules";
import { emitWebhook } from "./webhooks";

/**
 * The record each topic carries, as the Admin API returns it, read when the
 * event is sent so the payload is what the store holds now. Every emitter
 * returns straight away; the work runs after the response.
 */

type OrderTopic = Extract<WebhookTopic, `order.${string}`>;

export function emitOrderWebhook(storeId: string, orderId: string, ...topics: OrderTopic[]): void {
  for (const topic of topics) {
    emitWebhook(storeId, topic, async () => {
      const order = await getOrder(orderId);
      return order && order.storeId === storeId ? presentOrder(order) : null;
    });
  }
}

/** `storeId` null reads it from the product, after the response. */
export function emitProductWebhook(
  storeId: string | null,
  productId: string,
  topic: "product.created" | "product.updated",
): void {
  emitWebhook(storeId ?? (async () => (await getStoreProduct(productId))?.storeId), topic, async () => {
    const product = await getStoreProduct(productId);
    const store = product ? await getStore(product.storeId) : null;
    return product && store ? presentProduct(product, store) : null;
  });
}

/** A deleted product can no longer be read, so the event names what it was. */
export function emitProductDeleted(storeId: string, product: Pick<StoreProduct, "id" | "name">): void {
  emitWebhook(storeId, "product.deleted", async () => ({ id: product.id, name: product.name, deletedAt: new Date().toISOString() }));
}

/** The customer without the store team's private notes. */
function presentCustomer(customer: Customer) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notes: _notes, ...rest } = customer;
  return rest;
}

export function emitCustomerWebhook(
  storeId: string,
  match: { id: string } | { email: string },
  topic: "customer.created" | "customer.updated",
): void {
  emitWebhook(storeId, topic, async () => {
    const customer = await db.findOne<Customer>(COLLECTIONS.customers, { storeId, ...match });
    return customer ? presentCustomer(customer) : null;
  });
}

export function emitInventoryWebhook(storeId: string, levelId: string): void {
  emitWebhook(storeId, "inventory.updated", async () => {
    const level = await db.findOne<InventoryLevel>(COLLECTIONS.inventoryLevels, { id: levelId, storeId });
    if (!level) return null;
    return {
      productId: level.productId,
      variantId: level.variantId,
      tracked: level.tracked,
      policy: level.policy,
      onHand: level.onHand,
      committed: level.committed,
      available: availableOf(level),
      updatedAt: level.updatedAt,
    };
  });
}
