import "server-only";
import { after } from "next/server";
import { db } from "./platform";
import { newId } from "./util";
import type {
  Agency,
  AiSuggestion,
  AuditCategory,
  AuditLog,
  Cart,
  CatalogProduct,
  Membership,
  Order,
  Store,
  Storefront,
  StoreProduct,
  Supplier,
  TaxBracket,
  User,
} from "./types";

export const COLLECTIONS = {
  agencies: "agencies",
  users: "users",
  stores: "stores",
  memberships: "memberships",
  suppliers: "suppliers",
  catalog: "catalog_products",
  storeProducts: "store_products",
  taxBrackets: "tax_brackets",
  orders: "orders",
  storefronts: "storefronts",
  audit: "audit_logs",
  suggestions: "ai_suggestions",
  carts: "carts",
} as const;

/* ---------------------------------------------------------------- agencies */

export function listAgencies() {
  return db.find<Agency>(COLLECTIONS.agencies, {}, { sort: { name: 1 } });
}

export function getAgency(id: string) {
  return db.findOne<Agency>(COLLECTIONS.agencies, { id });
}

/* ------------------------------------------------------------------- users */

export function getUserById(id: string) {
  return db.findOne<User>(COLLECTIONS.users, { id });
}

export function getUserByEmail(email: string) {
  return db.findOne<User>(COLLECTIONS.users, { email: email.toLowerCase().trim() });
}

export function listUsers() {
  return db.find<User>(COLLECTIONS.users, {}, { sort: { name: 1 } });
}

/* ------------------------------------------------------------------ stores */

export function listStoresForAgency(agencyId: string) {
  return db.find<Store>(COLLECTIONS.stores, { agencyId }, { sort: { createdAt: -1 } });
}

export function listAllStores() {
  return db.find<Store>(COLLECTIONS.stores, {}, { sort: { createdAt: -1 } });
}

export function getStore(id: string) {
  return db.findOne<Store>(COLLECTIONS.stores, { id });
}

export function getStoreBySlug(slug: string) {
  return db.findOne<Store>(COLLECTIONS.stores, { slug });
}

export async function updateStore(id: string, patch: Partial<Store>) {
  await db.updateOne(COLLECTIONS.stores, { id }, { $set: patch as Record<string, unknown> });
}

/* ------------------------------------------------------------- memberships */

export function listMemberships(storeId: string) {
  return db.find<Membership>(COLLECTIONS.memberships, { storeId }, { sort: { invitedAt: 1 } });
}

export function listMembershipsForUser(userId: string) {
  return db.find<Membership>(COLLECTIONS.memberships, { userId });
}

export function getMembership(id: string) {
  return db.findOne<Membership>(COLLECTIONS.memberships, { id });
}

/**
 * Suppliers, the shared catalog and tax brackets are small global lists that
 * almost every screen needs. Reading the whole collection is one round trip and
 * it is cached (see `lib/platform.ts`), so resolving a single record out of it
 * is free where a `findOne` would have been another half-second wait. The
 * direct lookup stays as a fallback, because the API caps a list at 100
 * documents and a record past that cap would otherwise look deleted.
 */
async function fromCollection<T extends { id: string }>(
  rows: Promise<T[]>,
  id: string,
  lookup: () => Promise<T | null>,
): Promise<T | null> {
  if (!id) return null;
  const all = await rows;
  return all.find((row) => row.id === id) ?? (all.length < 100 ? null : await lookup());
}

/* --------------------------------------------------------------- suppliers */

export function listSuppliers() {
  return db.find<Supplier>(COLLECTIONS.suppliers, {}, { sort: { name: 1 } });
}

export function getSupplier(id: string) {
  return fromCollection(listSuppliers(), id, () => db.findOne<Supplier>(COLLECTIONS.suppliers, { id }));
}

/* ---------------------------------------------------------- shared catalog */

export function listCatalogProducts() {
  return db.find<CatalogProduct>(COLLECTIONS.catalog, {}, { sort: { name: 1 } });
}

export function getCatalogProduct(id: string) {
  return fromCollection(listCatalogProducts(), id, () => db.findOne<CatalogProduct>(COLLECTIONS.catalog, { id }));
}

/* ---------------------------------------------------------- store products */

export function listStoreProducts(storeId: string) {
  return db.find<StoreProduct>(COLLECTIONS.storeProducts, { storeId }, { sort: { updatedAt: -1 } });
}

export function listPublishedProducts(storeId: string) {
  return db.find<StoreProduct>(
    COLLECTIONS.storeProducts,
    { storeId, status: "published", visibility: "public" },
    { sort: { updatedAt: -1 } },
  );
}

export function getStoreProduct(id: string) {
  return db.findOne<StoreProduct>(COLLECTIONS.storeProducts, { id });
}

export function getStoreProductBySlug(storeId: string, slug: string) {
  return db.findOne<StoreProduct>(COLLECTIONS.storeProducts, { storeId, slug });
}

export async function updateStoreProduct(id: string, patch: Partial<StoreProduct>) {
  await db.updateOne(
    COLLECTIONS.storeProducts,
    { id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  );
}

/* ------------------------------------------------------------ tax brackets */

export function listTaxBrackets() {
  return db.find<TaxBracket>(COLLECTIONS.taxBrackets, {}, { sort: { rate: 1 } });
}

export function getTaxBracket(id: string) {
  return fromCollection(listTaxBrackets(), id, () => db.findOne<TaxBracket>(COLLECTIONS.taxBrackets, { id }));
}

/* ------------------------------------------------------------------ orders */

export function listOrders(storeId: string) {
  return db.find<Order>(COLLECTIONS.orders, { storeId }, { sort: { createdAt: -1 } });
}

export function getOrder(id: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { id });
}

export function getOrderByCode(storeId: string, code: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { storeId, code });
}

export function getOrderByIdempotencyKey(key: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { idempotencyKey: key });
}

export async function updateOrder(id: string, patch: Partial<Order>) {
  await db.updateOne(
    COLLECTIONS.orders,
    { id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  );
}

/* ------------------------------------------------------------- storefronts */

export function getStorefront(storeId: string) {
  return db.findOne<Storefront>(COLLECTIONS.storefronts, { storeId });
}

export async function updateStorefront(storeId: string, patch: Partial<Storefront>) {
  await db.updateOne(COLLECTIONS.storefronts, { storeId }, { $set: patch as Record<string, unknown> });
}

/* ------------------------------------------------------------------- carts */

export function getCart(storeId: string, sessionId: string) {
  return db.findOne<Cart>(COLLECTIONS.carts, { storeId, sessionId });
}

/* ------------------------------------------------------------- suggestions */

export function listSuggestions(storeId: string) {
  return db.find<AiSuggestion>(COLLECTIONS.suggestions, { storeId }, { sort: { createdAt: -1 }, limit: 40 });
}

export function getSuggestion(id: string) {
  return db.findOne<AiSuggestion>(COLLECTIONS.suggestions, { id });
}

/* ------------------------------------------------------------------- audit */

export interface AuditInput {
  category: AuditCategory;
  action: string;
  summary: string;
  storeId?: string | null;
  agencyId?: string | null;
  actorId: string;
  actorName: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

/**
 * Writes an audit entry after the response has been sent.
 *
 * Nothing on screen reads the entry that was just written, so making the person
 * wait another round trip for it only made every save slower. `after` hands the
 * work to the platform's `waitUntil`, which keeps the invocation alive until the
 * write finishes. Where there is no request to defer to — a script, or a call
 * outside a request scope — it falls back to writing inline.
 */
export function recordAudit(input: AuditInput): void {
  try {
    after(() => writeAudit(input));
  } catch {
    void writeAudit(input);
  }
}

async function writeAudit(input: AuditInput): Promise<void> {
  const entry: AuditLog = {
    id: newId("aud"),
    category: input.category,
    action: input.action,
    summary: input.summary,
    storeId: input.storeId ?? null,
    agencyId: input.agencyId ?? null,
    actorId: input.actorId,
    actorName: input.actorName,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    meta: input.meta ?? {},
    at: new Date().toISOString(),
  };
  try {
    await db.insertOne(COLLECTIONS.audit, entry as unknown as Record<string, unknown>);
  } catch (error) {
    // The change itself already succeeded and the response has gone out, so a
    // failed trail entry is logged rather than surfaced as a failed save.
    console.error("Audit entry could not be written", error);
  }
}

export function listAudit(filter: Record<string, unknown>, limit = 60) {
  return db.find<AuditLog>(COLLECTIONS.audit, filter, { sort: { at: -1 }, limit });
}
