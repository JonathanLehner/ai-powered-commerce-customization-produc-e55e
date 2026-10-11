import "server-only";
import { after } from "next/server";
import { hasApprovedPreviews } from "./artwork";
import type { AuditReadWindow } from "./audit-log";
import { db } from "./mongo";
import { storeAllowance, type StoreAllowance } from "./plans";
import { quoteCode } from "./sourcing";
import { newId } from "./util";
import type {
  Agency,
  AiSuggestion,
  AuditCategory,
  AuditLog,
  Cart,
  CatalogProduct,
  DiscountCode,
  GiftCampaign,
  GiftCatalogue,
  Membership,
  Order,
  PlanEnquiry,
  QuoteRequest,
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
  planEnquiries: "plan_enquiries",
  quoteRequests: "quote_requests",
  discounts: "discount_codes",
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

/** Several stores by id, in one read. The store switcher resolves a membership list this way. */
export async function getStoresByIds(ids: string[]): Promise<Map<string, Store>> {
  const rows = await db.findIn<Store>(COLLECTIONS.stores, "id", ids);
  return new Map(rows.map((row) => [row.id, row]));
}

export async function updateStore(id: string, patch: Partial<Store>) {
  await db.updateOne(COLLECTIONS.stores, { id }, { $set: patch as Record<string, unknown> });
}

/**
 * Live stores an agency runs. Archived stores are excluded: they are the plan's
 * unlimited drafts.
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
 * Groups rows read in one batched `{$in: [...]}` call under the ids they were
 * asked for, keeping the order the database returned them in.
 *
 * Every id asked for gets an entry, so a store with no records of its own reads
 * as an empty list rather than as a missing one.
 */
function groupById<T>(ids: string[], rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>(ids.map((id) => [id, []]));
  for (const row of rows) out.get(key(row))?.push(row);
  return out;
}

/* --------------------------------------------------------------- suppliers */

export function listSuppliers() {
  return db.find<Supplier>(COLLECTIONS.suppliers, {}, { sort: { name: 1 } });
}

export function getSupplier(id: string) {
  return db.findOne<Supplier>(COLLECTIONS.suppliers, { id });
}

/* ---------------------------------------------------------- shared catalog */

export function listCatalogProducts() {
  return db.find<CatalogProduct>(COLLECTIONS.catalog, {}, { sort: { name: 1 } });
}

export function getCatalogProduct(id: string) {
  return db.findOne<CatalogProduct>(COLLECTIONS.catalog, { id });
}

/* ---------------------------------------------------------- store products */

export function listStoreProducts(storeId: string) {
  return db.find<StoreProduct>(COLLECTIONS.storeProducts, { storeId }, { sort: { updatedAt: -1 } });
}

/**
 * Store products for several stores at once, grouped by store and ordered the
 * way `listStoreProducts` orders them. One read for the whole dashboard rather
 * than one per store.
 */
export async function listStoreProductsByStore(storeIds: string[]): Promise<Map<string, StoreProduct[]>> {
  const rows = await db.findIn<StoreProduct>(COLLECTIONS.storeProducts, "storeId", storeIds, {
    sort: { updatedAt: -1 },
  });
  return groupById(storeIds, rows, (row) => row.storeId);
}

/**
 * Several store products by id, in one read. Used where a basket or a recipient
 * list would otherwise cost a round trip per line.
 */
export async function getStoreProductsByIds(ids: string[]): Promise<Map<string, StoreProduct>> {
  const rows = await db.findIn<StoreProduct>(COLLECTIONS.storeProducts, "id", ids);
  return new Map(rows.map((row) => [row.id, row]));
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
 * Applies a patch to a store product. Pass the record the patch was built from
 * to spare the guard below a re-read.
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
  return db.findOne<TaxBracket>(COLLECTIONS.taxBrackets, { id });
}

/* ------------------------------------------------------------------ orders */

export function listOrders(storeId: string) {
  return db.find<Order>(COLLECTIONS.orders, { storeId }, { sort: { createdAt: -1 } });
}

/**
 * Orders for several stores at once, grouped by store, newest first — the order
 * `listOrders` returns them in.
 */
export async function listOrdersByStore(storeIds: string[]): Promise<Map<string, Order[]>> {
  const rows = await db.findIn<Order>(COLLECTIONS.orders, "storeId", storeIds, { sort: { createdAt: -1 } });
  return groupById(storeIds, rows, (row) => row.storeId);
}

export function getOrder(id: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { id });
}

export function getOrderByCode(storeId: string, code: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { storeId, code });
}

export function getOrderByIdempotencyKey(storeId: string, key: string) {
  return db.findOne<Order>(COLLECTIONS.orders, { storeId, idempotencyKey: key });
}

/**
 * Pass `where` to make the write guarded: it applies only while the order still
 * matches, and the boolean says whether it did. Matching on the `updatedAt` the
 * caller read is how a double click or two managers at once lands once — which
 * matters where the write follows a payment-gateway call.
 */
export async function updateOrder(
  id: string,
  patch: Partial<Order>,
  where: Record<string, unknown> = {},
): Promise<boolean> {
  const result = (await db.updateOne(
    COLLECTIONS.orders,
    { ...where, id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  )) as { matchedCount?: number } | null;
  return (result?.matchedCount ?? 0) > 0;
}

/* --------------------------------------------------------- plan enquiries */

/** Newest first: the sales queue is worked from the top. */
export function listPlanEnquiries(limit = 20) {
  return db.find<PlanEnquiry>(COLLECTIONS.planEnquiries, {}, { sort: { createdAt: -1 }, limit });
}

/** How a resubmitted form finds the enquiry it already created. */
export function getPlanEnquiryByKey(submissionKey: string) {
  return db.findOne<PlanEnquiry>(COLLECTIONS.planEnquiries, { submissionKey });
}

export async function createPlanEnquiry(
  enquiry: Omit<PlanEnquiry, "id" | "status" | "createdAt">,
): Promise<PlanEnquiry> {
  const record: PlanEnquiry = {
    ...enquiry,
    id: newId("enq"),
    status: "new",
    createdAt: new Date().toISOString(),
  };
  await db.insertOne(COLLECTIONS.planEnquiries, record as unknown as Record<string, unknown>);
  return record;
}

/* ---------------------------------------------------------- quote requests */

/** Every request this store has raised, newest first. */
export function listQuoteRequests(storeId: string) {
  return db.find<QuoteRequest>(COLLECTIONS.quoteRequests, { storeId }, { sort: { createdAt: -1 } });
}

/** The platform sourcing desk's queue, across every store. */
export function listAllQuoteRequests(limit = 100) {
  return db.find<QuoteRequest>(COLLECTIONS.quoteRequests, {}, { sort: { createdAt: -1 }, limit });
}

export function getQuoteRequest(id: string) {
  return db.findOne<QuoteRequest>(COLLECTIONS.quoteRequests, { id });
}

/** How a resubmitted form finds the request it already created. */
export function getQuoteRequestByKey(submissionKey: string) {
  return db.findOne<QuoteRequest>(COLLECTIONS.quoteRequests, { submissionKey });
}

export async function createQuoteRequest(
  request: Omit<
    QuoteRequest,
    "id" | "code" | "status" | "quotes" | "acceptedQuoteId" | "declineReason" | "storeProductId" | "createdAt" | "updatedAt"
  >,
): Promise<QuoteRequest> {
  const now = new Date().toISOString();
  const id = newId("rfq");
  const record: QuoteRequest = {
    ...request,
    id,
    code: quoteCode(id),
    status: "submitted",
    quotes: [],
    acceptedQuoteId: null,
    declineReason: null,
    storeProductId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.quoteRequests, record as unknown as Record<string, unknown>);
  return record;
}

/**
 * A guarded write: applies only while the enquiry still matches `where`, and
 * says whether it did. A double click or two people acting at once lands once.
 */
export async function updateQuoteRequest(
  id: string,
  where: Record<string, unknown>,
  update: { $set?: Partial<QuoteRequest>; $push?: Record<string, unknown> },
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const result = (await db.updateOne(
    COLLECTIONS.quoteRequests,
    { ...where, id },
    { ...update, $set: { ...update.$set, updatedAt } },
  )) as { matchedCount?: number } | null;
  return (result?.matchedCount ?? 0) > 0;
}

/* --------------------------------------------------------- discount codes */

export function listDiscountCodes(storeId: string) {
  return db.find<DiscountCode>(COLLECTIONS.discounts, { storeId }, { sort: { createdAt: -1 } });
}

export function getDiscountCode(id: string) {
  return db.findOne<DiscountCode>(COLLECTIONS.discounts, { id });
}

/** The code a shopper typed, which is unique within the store. */
export function getDiscountCodeByCode(storeId: string, code: string) {
  return db.findOne<DiscountCode>(COLLECTIONS.discounts, { storeId, code });
}

export async function createDiscountCode(code: DiscountCode): Promise<void> {
  await db.insertOne(COLLECTIONS.discounts, code as unknown as Record<string, unknown>);
}

/**
 * A guarded write, in the shape of `updateQuoteRequest`: it applies only while
 * the code still matches `where`, and says whether it did.
 */
export async function updateDiscountCode(
  id: string,
  where: Record<string, unknown>,
  patch: Partial<DiscountCode>,
): Promise<boolean> {
  const result = (await db.updateOne(
    COLLECTIONS.discounts,
    { ...where, id },
    { $set: { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() } },
  )) as { matchedCount?: number } | null;
  return (result?.matchedCount ?? 0) > 0;
}

/**
 * Takes one use of a code, or says there was none left.
 *
 * The count is advanced with a write guarded on the count that was read, so two
 * shoppers paying at the same instant cannot both take the last use: the second
 * write matches nothing, re-reads and tries again, and stops once the limit is
 * reached. An unlimited code still counts, because the store wants to know how
 * often it was used.
 */
export async function claimDiscountUse(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await getDiscountCode(id);
    if (!code) return false;
    const used = code.timesUsed ?? 0;
    if (code.usageLimit !== null && used >= code.usageLimit) return false;
    if (await updateDiscountCode(id, { timesUsed: used }, { timesUsed: used + 1 })) return true;
  }
  return false;
}

/**
 * Hands a claimed use back when the payment it was taken for never happened.
 * Best effort: a use left standing is the safe direction to fail in, because it
 * can only hold a code back, never let it past its limit.
 */
export async function releaseDiscountUse(id: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await getDiscountCode(id);
    if (!code || (code.timesUsed ?? 0) <= 0) return;
    const used = code.timesUsed;
    if (await updateDiscountCode(id, { timesUsed: used }, { timesUsed: used - 1 })) return;
  }
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

/**
 * Pending suggestions and a window of recently decided ones.
 *
 * The two are read separately because one shared `limit` is lossy in a way
 * that matters: decided suggestions accumulate forever, so a single window
 * sorted by date eventually fills with them and pushes pending ones out of
 * sight — and a pending suggestion nobody can see is one nobody can apply or
 * dismiss. Pending is therefore read whole and only the decided history is
 * trimmed.
 */
export async function listSuggestions(storeId: string) {
  const [pending, decided] = await Promise.all([
    db.find<AiSuggestion>(
      COLLECTIONS.suggestions,
      { storeId, status: "pending" },
      { sort: { createdAt: -1 } },
    ),
    db.find<AiSuggestion>(
      COLLECTIONS.suggestions,
      { storeId, status: { $ne: "pending" } },
      { sort: { createdAt: -1 }, limit: 40 },
    ),
  ]);
  return [...pending, ...decided];
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

export interface AuditWindow {
  entries: AuditLog[];
  /**
   * The oldest instant this result is complete from. Equal to the window's own
   * start unless reading stopped at the cap, in which case older entries exist
   * and the view says so.
   */
  coveredFrom: string;
  truncated: boolean;
}

/**
 * The newest `cap` audit entries in an instant window, newest first. With no
 * start date asked for, everything before `to` belongs in the window — an entry
 * written before the scope's oldest store, a platform-wide change say, is still
 * in the history.
 */
export async function loadAuditWindow(
  scope: Record<string, unknown>,
  window: AuditReadWindow,
  cap: number,
): Promise<AuditWindow> {
  const at: Record<string, string> = { $lt: window.to };
  if (!window.openStart) at.$gte = window.from;
  // One past the cap says whether anything older was left behind.
  const rows = await db.find<AuditLog>(
    COLLECTIONS.audit,
    { ...scope, at },
    { sort: { at: -1, id: -1 }, limit: cap + 1 },
  );
  if (rows.length <= cap) return { entries: rows, coveredFrom: window.from, truncated: false };
  const entries = rows.slice(0, cap);
  return { entries, coveredFrom: entries[entries.length - 1].at, truncated: true };
}
