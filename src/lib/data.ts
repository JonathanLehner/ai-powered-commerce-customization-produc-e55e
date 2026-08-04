import "server-only";
import { after } from "next/server";
import { hasApprovedPreviews } from "./artwork";
import { db } from "./platform";
import { storeAllowance, type StoreAllowance } from "./plans";
import { newId } from "./util";
import type {
  Agency,
  AiSuggestion,
  AuditCategory,
  AuditLog,
  Cart,
  CatalogProduct,
  GiftCampaign,
  GiftCatalogue,
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
  giftCatalogues: "gift_catalogues",
  giftCampaigns: "gift_campaigns",
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

/**
 * Live stores an agency runs. Counted in the database rather than from a listing
 * because a list is capped at 100 documents, and an agency past that cap would
 * otherwise look as though it had room to spare. Archived stores are excluded:
 * they are the plan's unlimited drafts.
 */
export function countActiveStoresForAgency(agencyId: string) {
  return db.count(COLLECTIONS.stores, { agencyId, status: "active" });
}

/** The agency's plan, its live-store ceiling and what is in use against it. */
export async function agencyStoreAllowance(agency: Agency): Promise<StoreAllowance> {
  return storeAllowance(agency.plan, await countActiveStoresForAgency(agency.id));
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

export function getMembershipByToken(inviteToken: string) {
  return db.findOne<Membership>(COLLECTIONS.memberships, { inviteToken });
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

export async function listPublishedProducts(storeId: string) {
  const products = await db.find<StoreProduct>(
    COLLECTIONS.storeProducts,
    { storeId, status: "published", visibility: "public" },
    { sort: { updatedAt: -1 } },
  );
  return products.filter(hasApprovedPreviews);
}

export function getStoreProduct(id: string) {
  return db.findOne<StoreProduct>(COLLECTIONS.storeProducts, { id });
}

export function getStoreProductBySlug(storeId: string, slug: string) {
  return db.findOne<StoreProduct>(COLLECTIONS.storeProducts, { storeId, slug });
}

/**
 * Applies a patch to a store product.
 *
 * Pass the record the patch was built from and the result is handed to the
 * per-request memo, so the page that re-renders after the mutation does not
 * spend another round trip re-reading a document this request just wrote.
 *
 * Uploading, moving or removing artwork clears the generated mockups, and
 * regenerating them resets every preview to unapproved. A published product in
 * that state is live but unsellable, so any write that puts it there also takes
 * it back to review. The guard sits here because every artwork and mockup
 * mutation routes through this one write.
 */
export async function updateStoreProduct(id: string, patch: Partial<StoreProduct>, current?: StoreProduct) {
  if (patch.artworks || patch.mockups) {
    const before = current ?? (await getStoreProduct(id));
    const merged = before ? { ...before, ...patch } : null;
    if (merged && merged.status === "published" && !hasApprovedPreviews(merged)) {
      patch = { ...patch, status: "in_review", unpublishedReason: "artwork_changed" };
    }
  }
  const updatedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.storeProducts,
    { id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt } },
  );
  if (current && current.id === id) {
    db.primeOne<StoreProduct>(COLLECTIONS.storeProducts, { id }, { ...current, ...patch, updatedAt });
  }
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

/* ----------------------------------------------------------------- gifting */

export function listGiftCatalogues(storeId: string) {
  return db.find<GiftCatalogue>(COLLECTIONS.giftCatalogues, { storeId }, { sort: { createdAt: -1 } });
}

export function getGiftCatalogue(id: string) {
  return db.findOne<GiftCatalogue>(COLLECTIONS.giftCatalogues, { id });
}

export function getGiftCatalogueBySlug(slug: string) {
  return db.findOne<GiftCatalogue>(COLLECTIONS.giftCatalogues, { slug });
}

export async function updateGiftCatalogue(id: string, patch: Partial<GiftCatalogue>) {
  await db.updateOne(
    COLLECTIONS.giftCatalogues,
    { id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  );
}

export function listGiftCampaigns(storeId: string) {
  return db.find<GiftCampaign>(COLLECTIONS.giftCampaigns, { storeId }, { sort: { createdAt: -1 } });
}

export function getGiftCampaign(id: string) {
  return db.findOne<GiftCampaign>(COLLECTIONS.giftCampaigns, { id });
}

export function getGiftCampaignByCode(code: string) {
  return db.findOne<GiftCampaign>(COLLECTIONS.giftCampaigns, { code });
}

export async function updateGiftCampaign(id: string, patch: Partial<GiftCampaign>) {
  await db.updateOne(
    COLLECTIONS.giftCampaigns,
    { id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  );
}

/** Every order a campaign produced, oldest first — one per recipient. */
export function listOrdersForCampaign(campaignId: string) {
  return db.find<Order>(
    COLLECTIONS.orders,
    { "campaign.campaignId": campaignId },
    { sort: { createdAt: 1 } },
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
