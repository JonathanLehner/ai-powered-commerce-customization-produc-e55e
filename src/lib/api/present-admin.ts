import "server-only";
import { auditDetail, type AuditDetailOptions } from "../audit-log";
import { storeAllowance } from "../plans";
import { isQuoteOnly } from "../sourcing";
import type { Agency, AuditLog, CatalogProduct, PlanEnquiry, QuoteRequest, Store, Supplier, TaxBracket } from "../types";

/**
 * Platform administration records as the platform operations return them:
 * what the admin screens show, without form bookkeeping (submission keys,
 * sign-up keys) or billing provider ids.
 */

export function presentSupplier(supplier: Supplier, catalogProducts: number) {
  return { ...supplier, catalogProducts };
}

export function presentCatalogItem(item: CatalogProduct, supplierName: string | null) {
  return { ...item, supplierName, quoteOnly: isQuoteOnly(item) };
}

export function presentTaxBracket(bracket: TaxBracket, productsUsing: number) {
  return { ...bracket, productsUsing };
}

export function presentAgency(agency: Agency, stores: Store[], people: number) {
  const active = stores.filter((store) => store.status === "active").length;
  const allowance = storeAllowance(agency.plan, active);
  return {
    id: agency.id,
    name: agency.name,
    slug: agency.slug,
    plan: agency.plan,
    planName: allowance.plan.name,
    status: agency.status,
    contactEmail: agency.contactEmail,
    createdAt: agency.createdAt,
    billingStatus: agency.billing?.status ?? null,
    stores: {
      total: stores.length,
      active,
      /** The plan's ceiling on live stores; null for no limit. */
      limit: allowance.limit,
      atLimit: allowance.atLimit,
    },
    people,
  };
}

export function presentQuoteRequest(request: QuoteRequest) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { submissionKey: _submissionKey, ...rest } = request;
  return { ...rest, quotes: rest.quotes ?? [] };
}

export function presentPlanEnquiry(enquiry: PlanEnquiry) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { submissionKey: _submissionKey, ...rest } = enquiry;
  return { ...rest, currency: rest.currency ?? "USD", locale: rest.locale ?? null };
}

/** An entry already read as platform access (`platformAuditEntries`). */
export function presentPlatformAuditEntry(
  entry: AuditLog,
  storeName: string | null,
  detail: AuditDetailOptions,
) {
  return {
    id: entry.id,
    at: entry.at,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    detail: auditDetail(entry, detail),
    storeId: entry.storeId,
    storeName,
    agencyId: entry.agencyId,
    actorId: entry.actorId,
    actorName: entry.actorName,
    entity: entry.entity,
    entityId: entry.entityId,
    meta: entry.meta,
  };
}
