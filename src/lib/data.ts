import "server-only";
import { after } from "next/server";
import { hasApprovedPreviews } from "./artwork";
import { auditMonthBuckets, sortAuditEntries, type AuditReadWindow } from "./audit-log";
import { db } from "./platform";
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

/**
 * The platform API answers a `find` with at most this many documents, and it
 * applies neither `sort` nor `skip`. A collection with more history than this
 * therefore cannot be read newest-first in one call, and asking for it plainly
 * returned an arbitrary slice of it — which is what made the audit list show
 * whatever it happened to get rather than the latest changes.
 */
const AUDIT_FIND_CAP = 50;
/** Reads of one slice of time, so a dense month cannot loop. */
const AUDIT_SLICE_READS = 16;
/** Buckets read together. Enough to overlap the latency, few enough to stop early. */
const AUDIT_BUCKET_BATCH = 8;
/** Older than any record the platform holds. */
const AUDIT_BEGINNING = "1970-01-01T00:00:00.000Z";

export interface AuditWindow {
  entries: AuditLog[];
  /**
   * The oldest instant this result is complete from. Equal to the window's own
   * start unless reading stopped early, in which case older entries exist and
   * the view says so.
   */
  coveredFrom: string;
  truncated: boolean;
}

/**
 * Every audit entry in an instant window, newest first.
 *
 * The window is walked one month at a time from the newest end, so stopping
 * early drops the oldest history rather than an arbitrary scattering of it, and
 * what is returned is complete from `coveredFrom` onwards. Months are read
 * several at a time, and a month holding more entries than the API returns at
 * once is read again with what is already in hand excluded.
 */
export async function loadAuditWindow(
  scope: Record<string, unknown>,
  window: AuditReadWindow,
  cap: number,
): Promise<AuditWindow> {
  const buckets = auditMonthBuckets(window.from, window.to);
  // With no start date asked for, the months only say where reading begins:
  // anything older is swept up last, so an entry written before the scope's
  // oldest store — a platform-wide change, say — is still in the history.
  if (window.openStart) buckets.push({ from: AUDIT_BEGINNING, to: window.from });
  const entries: AuditLog[] = [];
  let coveredFrom = window.from;
  let truncated = false;

  for (let index = 0; index < buckets.length; index += AUDIT_BUCKET_BATCH) {
    const batch = buckets.slice(index, index + AUDIT_BUCKET_BATCH);
    const reads = await Promise.all(batch.map((bucket) => readAuditSlice(scope, bucket)));
    for (const rows of reads) entries.push(...rows);
    const remaining = index + AUDIT_BUCKET_BATCH < buckets.length;
    if (entries.length >= cap && remaining) {
      coveredFrom = batch[batch.length - 1].from;
      truncated = true;
      break;
    }
  }

  return { entries: sortAuditEntries(entries), coveredFrom, truncated };
}

/**
 * Every entry in one slice of time.
 *
 * A read that comes back full means the cap was hit and there is more behind it,
 * so the documents already in hand are excluded and the slice is read again.
 * Halving the slice and reading both halves at once was tried instead and was
 * three times slower: it spends a whole round trip per level to discover a
 * boundary the exclusion already knows.
 */
async function readAuditSlice(
  scope: Record<string, unknown>,
  slice: { from: string; to: string },
): Promise<AuditLog[]> {
  const rows: AuditLog[] = [];
  const seen: string[] = [];
  for (let read = 0; read < AUDIT_SLICE_READS; read++) {
    const filter: Record<string, unknown> = { ...scope, at: { $gte: slice.from, $lt: slice.to } };
    if (seen.length > 0) filter.id = { $nin: seen };
    const page = await db.find<AuditLog>(COLLECTIONS.audit, filter);
    rows.push(...page);
    if (page.length < AUDIT_FIND_CAP) break;
    for (const row of page) seen.push(row.id);
  }
  return rows;
}
