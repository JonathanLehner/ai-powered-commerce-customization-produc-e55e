/**
 * Store-level product SKUs.
 *
 * The same supplier product can be copied into a store more than once, and two
 * copies otherwise look identical — same name, same price, same cost, same
 * supplier. The SKU is what tells them apart on a card, in a dropdown and in a
 * conversation, so it is unique inside the store and never reused.
 */

import type { StoreProduct } from "./types";

/** Lower-case alphanumeric words, accents folded away. */
function words(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Six-character store prefix — channel "northwind-supply" becomes "NORTHW". */
export function storeSkuPrefix(channelCode: string): string {
  return words(channelCode).join("").toUpperCase().slice(0, 6) || "STORE";
}

/** Readable stem from a product name — "Organic Cotton Tee" becomes "ORG-COT-TEE". */
export function skuStem(name: string): string {
  const stem = words(name)
    .slice(0, 3)
    .map((word) => word.slice(0, 3).toUpperCase())
    .join("-");
  return stem || "ITEM";
}

export function baseStoreSku(channelCode: string, name: string): string {
  return `${storeSkuPrefix(channelCode)}-${skuStem(name)}`;
}

/**
 * The SKU to show for a store product.
 *
 * Records imported before SKUs existed carry none, so one is derived from the
 * record's own id — different for every copy, which is the whole point, and
 * stable for as long as the record lives.
 */
export function storeSku(product: Pick<StoreProduct, "id" | "name" | "sku">, channelCode: string): string {
  if (product.sku) return product.sku;
  const tail = product.id.replace(/^[a-z]+_/, "").slice(-4).toUpperCase();
  return `${baseStoreSku(channelCode, product.name)}-${tail}`;
}

/** `base`, then `base-2`, `base-3`… until one is free. */
export function nextFreeSku(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((sku) => sku.toUpperCase()));
  if (!used.has(base.toUpperCase())) return base;
  for (let n = 2; n <= 999; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** `name`, then `name (2)`, `name (3)`… until one is free within the store. */
export function nextFreeName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((value) => value.trim().toLowerCase()));
  if (!used.has(name.trim().toLowerCase())) return name;
  for (let n = 2; n <= 999; n++) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} (copy)`;
}
