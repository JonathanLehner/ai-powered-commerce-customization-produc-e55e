import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import {
  auditActors,
  auditWindow,
  matchesAuditFilters,
  platformAuditEntries,
  type AuditFilters,
} from "../audit-log";
import { FILE_REQUIREMENTS, parsePrintAreas, parseVariants } from "../catalog-rows";
import {
  COLLECTIONS,
  getAgency,
  getCatalogProduct,
  getQuoteRequest,
  getSupplier,
  getTaxBracket,
  listAllStores,
  listCatalogProducts,
  listSuppliers,
  loadAuditWindow,
  recordAudit,
  updateQuoteRequest,
} from "../data";
import { db } from "../mongo";
import { checkSupplierQuote, isQuoteOnly } from "../sourcing";
import { PRODUCT_CATEGORIES, type Agency, type CatalogProduct, type QuoteRequest, type Supplier, type SupplierQuote, type TaxBracket } from "../types";
import { CURRENCY_OPTIONS, formatMoney, newId, parseMoney, toMajorString } from "../util";
import { OperationError, type Actor, type PlatformContext } from "./context";

/**
 * Platform administration: suppliers, the shared catalog, global tax brackets,
 * agency access and the sourcing desk. The admin screens' server actions and
 * the platform operations of the Admin API both run these. Who may run them —
 * a signed-in platform administrator, or a platform key whose maker still is
 * one — is checked by the caller.
 */

/** The context a signed-in platform administrator's server action runs with. */
export async function platformContext(user: Actor): Promise<PlatformContext> {
  return { actor: { id: user.id, name: user.name }, locale: await getLocale() };
}

/**
 * An amount as a form posts it (a string in major units, as typed) or as the
 * API sends it (an integer number of minor units).
 */
export type Amount = string | number;

function minorAmount(value: Amount, currency: string): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  return parseMoney(value, currency);
}

/* -------------------------------------------------------------- suppliers */

export const SUPPLIER_STATUSES = ["approved", "pending_review", "disabled"] as const;

async function supplier(ctx: PlatformContext, supplierId: string): Promise<Supplier> {
  const found = await getSupplier(supplierId);
  if (found) return found;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  throw new OperationError("not_found", t("supplierGone"));
}

/** Approves, disables or returns a supplier to review. The same status again changes nothing. */
export async function changeSupplierStatus(
  ctx: PlatformContext,
  supplierId: string,
  status: Supplier["status"],
): Promise<Supplier> {
  if (!SUPPLIER_STATUSES.includes(status)) {
    throw new OperationError("invalid", "Use approved, pending_review or disabled.", "status");
  }
  const current = await supplier(ctx, supplierId);
  if (current.status === status) return current;

  await db.updateOne(COLLECTIONS.suppliers, { id: supplierId }, { $set: { status } });
  recordAudit({
    category: "administration",
    action: "supplier.status_changed",
    summary: `${status === "approved" ? "Approved" : status === "disabled" ? "Disabled" : "Returned to review"} supplier ${current.name}`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "supplier",
    entityId: supplierId,
    meta: { from: current.status, to: status },
  });
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
  return { ...current, status };
}

/** The regions a supplier fulfils to, and the operator's notes on it. Notes left out keep theirs. */
export async function updateSupplierRegions(
  ctx: PlatformContext,
  supplierId: string,
  input: { regions: string[]; notes?: string },
): Promise<Supplier> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  const current = await supplier(ctx, supplierId);
  const regions = input.regions;
  if (regions.length === 0) throw new OperationError("invalid", t("regionRequired"), "regions");
  const notes = input.notes === undefined ? current.notes : input.notes.trim();

  await db.updateOne(COLLECTIONS.suppliers, { id: supplierId }, { $set: { regions, notes } });
  recordAudit({
    category: "administration",
    action: "supplier.updated",
    summary: `Updated fulfilment regions for ${current.name} (${regions.length} regions)`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "supplier",
    entityId: supplierId,
    meta: { regions: regions.join(", ") },
  });
  revalidatePath("/admin/suppliers");
  return { ...current, regions, notes };
}

export interface NewSupplierInput {
  name: string;
  website: string;
  summary: string;
  kind: Supplier["kind"];
  integration: Supplier["integration"];
  regions: string[];
}

/** Adds a supplier for commercial review. Stores cannot select it until it is approved. */
export async function createSupplier(ctx: PlatformContext, input: NewSupplierInput): Promise<Supplier> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  const name = input.name.trim();
  const website = input.website.trim();
  const summary = input.summary.trim();
  const { kind, integration, regions } = input;

  if (name.length < 2) throw new OperationError("invalid", t("nameRequired"), "name");
  if (!/^https?:\/\/.+\..+/.test(website)) throw new OperationError("invalid", t("websiteRequired"), "website");
  if (summary.length < 20) throw new OperationError("invalid", t("summaryRequired"), "summary");
  if (regions.length === 0) throw new OperationError("invalid", t("fulfilmentRegionRequired"), "regions");

  const record: Supplier = {
    id: newId("sup"),
    name,
    kind,
    website,
    summary,
    status: "pending_review",
    regions,
    integration,
    capabilities: {
      catalog: true,
      quotes: true,
      inventory: integration === "api",
      mockups: false,
      orderSubmission: integration === "api",
      tracking: integration === "api",
      cancellation: false,
    },
    leadTimeDays: [3, 10],
    notes: "Added for commercial review. Not selectable by stores until approved.",
    createdAt: new Date().toISOString(),
  };

  await db.insertOne(COLLECTIONS.suppliers, record as unknown as Record<string, unknown>);
  recordAudit({
    category: "administration",
    action: "supplier.added",
    summary: `Added supplier ${name} for review`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "supplier",
    entityId: record.id,
    meta: { kind, integration },
  });
  revalidatePath("/admin/suppliers");
  return record;
}

/* --------------------------------------------------------- shared catalog */

/** "added 2, removed 1" — what an audit entry says about a changed table. */
function changeSummary(added: number, removed: number): string {
  return [added ? `added ${added}` : "", removed ? `removed ${removed}` : ""].filter(Boolean).join(", ");
}

/**
 * A print-area or variant table: the JSON the editor posts, or rows from the
 * API. API rows carry numbers, which the parsers read as the editor's text;
 * a variant's `baseCost` from the API is in minor units.
 */
export type CatalogRows = string | Record<string, unknown>[];

function postedRows(rows: CatalogRows, currency: string): string {
  if (typeof rows === "string") return rows;
  return JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value !== "number" ? value : key === "baseCost" ? toMajorString(value, currency) : String(value),
        ]),
      ),
    ),
  );
}

export interface CatalogItemInput {
  /** The product to save; null to create one. */
  catalogId: string | null;
  /** Used for a new product only: an existing product keeps its currency. */
  currency: string;
  supplierId: string;
  productType: string;
  category: string;
  name: string;
  description: string;
  baseCost: Amount;
  customizationCostPerArea: Amount;
  shippingEstimate: Amount;
  /** Left out: the product's current value, or the default for a new one. */
  availability?: CatalogProduct["availability"];
  status?: CatalogProduct["status"];
  fulfillmentRegions: string[];
  printAreas: CatalogRows;
  variants: CatalogRows;
}

/**
 * Creates a shared catalog product, or saves an existing one. Both run through
 * here so the create form and the editor cannot drift apart: the only difference
 * is whether a `catalogId` comes with the submission.
 */
export async function saveCatalogProduct(
  ctx: PlatformContext,
  input: CatalogItemInput,
): Promise<{ item: CatalogProduct; created: boolean }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  const catalogId = input.catalogId?.trim() || null;
  const item = catalogId ? await getCatalogProduct(catalogId) : null;
  if (catalogId && !item) throw new OperationError("not_found", t("catalogGone"));

  // A bulk-sourcing listing is priced by quote, so there are no costs for this
  // editor to save. Writing one would publish a unit price no supplier has
  // given, and stores would compare against it.
  if (item && isQuoteOnly(item)) {
    throw new OperationError("conflict", t("pricedByQuote", { name: item.name }));
  }

  // The currency is fixed once a product exists: every stored amount is in its
  // minor units, and changing it would silently reinterpret all of them.
  const currency = item?.currency ?? input.currency.trim().toUpperCase();
  const supplierId = input.supplierId.trim();
  const productType = input.productType.trim();
  const category = input.category as CatalogProduct["category"];
  const name = input.name.trim();
  const description = input.description.trim();
  const baseCost = minorAmount(input.baseCost, currency);
  const customizationCostPerArea = minorAmount(input.customizationCostPerArea, currency);
  const shippingEstimate = minorAmount(input.shippingEstimate, currency);
  const availability = input.availability ?? item?.availability ?? "available";
  const status = input.status ?? item?.status ?? "active";
  const fulfillmentRegions = input.fulfillmentRegions;

  const maker = await getSupplier(supplierId);
  if (!maker) throw new OperationError("invalid", t("supplierRequired"), "supplierId");
  if (productType.length < 3) throw new OperationError("invalid", t("productTypeRequired"), "productType");
  if (name.length < 3) throw new OperationError("invalid", t("productNameRequired"), "name");
  if (description.length < 20) throw new OperationError("invalid", t("descriptionRequired"), "description");
  if (baseCost === null || baseCost <= 0) throw new OperationError("invalid", t("baseCostRequired"), "baseCost");
  if (customizationCostPerArea === null) {
    throw new OperationError("invalid", t("customisationRequired"), "customizationCost");
  }
  if (shippingEstimate === null) throw new OperationError("invalid", t("shippingRequired"), "shippingEstimate");
  if (!PRODUCT_CATEGORIES.includes(category)) {
    throw new OperationError("invalid", t("categoryRequired"), "category");
  }
  if (!CURRENCY_OPTIONS.some((option) => option.code === currency)) {
    throw new OperationError("invalid", t("currencyRequired"), "currency");
  }
  if (fulfillmentRegions.length === 0) {
    throw new OperationError("invalid", t("fulfilmentRegionRequired"), "regions");
  }

  const parsedAreas = parsePrintAreas(postedRows(input.printAreas, currency), item?.printAreas ?? []);
  if ("error" in parsedAreas) {
    throw new OperationError("invalid", t(`rows.${parsedAreas.code}`, parsedAreas.values), "printAreas");
  }
  const parsedVariants = parseVariants(postedRows(input.variants, currency), item?.variants ?? [], currency);
  if ("error" in parsedVariants) {
    throw new OperationError("invalid", t(`rows.${parsedVariants.code}`, parsedVariants.values), "variants");
  }
  const printAreas = parsedAreas.areas;
  const variants = parsedVariants.variants;

  if (!item) {
    // A second submission of the same form — a double click on a slow
    // connection, or a retried tab — must not leave two identical products in a
    // catalog every store copies from.
    const existing = await listCatalogProducts();
    const clash = existing.find(
      (product) => product.supplierId === supplierId && product.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      throw new OperationError("conflict", t("nameClash", { supplier: maker.name, name: clash.name }), "name");
    }

    const created: CatalogProduct = {
      id: newId("cat"),
      supplierId,
      name,
      category,
      productType,
      description,
      currency,
      baseCost,
      customizationCostPerArea,
      shippingEstimate,
      variants,
      printAreas,
      // Supplier photography arrives with the supplier's own imagery; the
      // product is costed, importable and configurable without it.
      mockups: [],
      fileRequirements: FILE_REQUIREMENTS[category],
      fulfillmentRegions,
      leadTimeDays: maker.leadTimeDays,
      availability,
      status,
      createdAt: new Date().toISOString(),
    };

    await db.insertOne(COLLECTIONS.catalog, created as unknown as Record<string, unknown>);
    recordAudit({
      category: "administration",
      action: "catalog.product_added",
      summary: `Added “${name}” to the shared supplier catalog`,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      entity: "catalog_product",
      entityId: created.id,
      meta: {
        supplier: maker.name,
        printAreas: printAreas.length,
        variants: variants.length,
        status,
      },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/suppliers");
    revalidatePath("/admin");
    return { item: created, created: true };
  }

  const changes = {
    supplierId,
    name,
    category,
    productType,
    description,
    baseCost,
    customizationCostPerArea,
    shippingEstimate,
    availability,
    status,
    fulfillmentRegions,
    printAreas,
    variants,
  };
  await db.updateOne(COLLECTIONS.catalog, { id: item.id }, { $set: changes });
  recordAudit({
    category: "administration",
    action: "catalog.product_updated",
    summary: `Updated shared catalog product “${name}”`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "catalog_product",
    entityId: item.id,
    meta: { availability, status, regions: fulfillmentRegions.length },
  });

  // Adding or dropping a print area or a variant changes what every store can
  // sell from this product, so it is recorded in its own right rather than left
  // inside the general update.
  const areasAdded = printAreas.filter((area) => !item.printAreas.some((old) => old.id === area.id)).length;
  const areasRemoved = item.printAreas.filter((old) => !printAreas.some((area) => area.id === old.id)).length;
  if (areasAdded || areasRemoved) {
    recordAudit({
      category: "administration",
      action: "catalog.print_areas_changed",
      summary: `Print areas on “${name}”: ${changeSummary(areasAdded, areasRemoved)} (${printAreas.length} in total)`,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      entity: "catalog_product",
      entityId: item.id,
      meta: { added: areasAdded, removed: areasRemoved, total: printAreas.length },
    });
  }
  const variantsAdded = variants.filter((variant) => !item.variants.some((old) => old.id === variant.id)).length;
  const variantsRemoved = item.variants.filter((old) => !variants.some((variant) => variant.id === old.id)).length;
  if (variantsAdded || variantsRemoved) {
    recordAudit({
      category: "administration",
      action: "catalog.variants_changed",
      summary: `Variants on “${name}”: ${changeSummary(variantsAdded, variantsRemoved)} (${variants.length} in total)`,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      entity: "catalog_product",
      entityId: item.id,
      meta: { added: variantsAdded, removed: variantsRemoved, total: variants.length },
    });
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${item.id}`);
  return { item: { ...item, ...changes }, created: false };
}

/* ------------------------------------------------------------ tax brackets */

export interface TaxBracketInput {
  /** The bracket to save; null to create one. */
  bracketId: string | null;
  name: string;
  code: string;
  description: string;
  /** Percent, 0 to 50. */
  rate: number;
  regions: string[];
}

export async function saveTaxBracket(
  ctx: PlatformContext,
  input: TaxBracketInput,
): Promise<{ bracket: TaxBracket; created: boolean }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const description = input.description.trim();
  const { rate, regions } = input;

  if (name.length < 3) throw new OperationError("invalid", t("bracketName"), "name");
  if (!/^[A-Z0-9-.]{2,12}$/.test(code)) throw new OperationError("invalid", t("bracketCode"), "code");
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) throw new OperationError("invalid", t("bracketRate"), "rate");
  if (regions.length === 0) throw new OperationError("invalid", t("bracketRegions"), "regions");

  if (input.bracketId) {
    const bracketId = input.bracketId;
    const existing = await getTaxBracket(bracketId);
    if (!existing) throw new OperationError("not_found", t("bracketGone"));
    await db.updateOne(COLLECTIONS.taxBrackets, { id: bracketId }, { $set: { name, code, description, rate, regions } });
    recordAudit({
      category: "administration",
      action: "tax.bracket_updated",
      summary: `Updated tax bracket “${name}” to ${rate}%`,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      entity: "tax_bracket",
      entityId: bracketId,
      meta: { from: existing.rate, to: rate },
    });
    revalidatePath("/admin/tax");
    return { bracket: { ...existing, name, code, description, rate, regions }, created: false };
  }

  const bracket: TaxBracket = {
    id: newId("tax"),
    name,
    code,
    rate,
    description,
    regions,
    createdAt: new Date().toISOString(),
  };
  await db.insertOne(COLLECTIONS.taxBrackets, bracket as unknown as Record<string, unknown>);
  recordAudit({
    category: "administration",
    action: "tax.bracket_created",
    summary: `Created global tax bracket “${name}” at ${rate}%`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "tax_bracket",
    entityId: bracket.id,
    meta: { rate },
  });
  revalidatePath("/admin/tax");
  return { bracket, created: true };
}

/** How many store products are filed under a bracket. One in use cannot be deleted. */
export function taxBracketUsage(bracketId: string): Promise<number> {
  return db.count(COLLECTIONS.storeProducts, { taxBracketId: bracketId });
}

/** Deletes a bracket no store product is filed under. */
export async function removeTaxBracket(ctx: PlatformContext, bracketId: string): Promise<void> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.admin" });
  const bracket = await getTaxBracket(bracketId);
  if (!bracket) throw new OperationError("not_found", t("bracketGone"));

  const inUse = await taxBracketUsage(bracketId);
  if (inUse > 0) {
    throw new OperationError(
      "conflict",
      `“${bracket.name}” is used by ${inUse} store product${inUse === 1 ? "" : "s"}. Move them to another bracket first.`,
    );
  }

  await db.deleteOne(COLLECTIONS.taxBrackets, { id: bracketId });
  recordAudit({
    category: "administration",
    action: "tax.bracket_deleted",
    summary: `Deleted unused tax bracket “${bracket.name}”`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "tax_bracket",
    entityId: bracketId,
    meta: {},
  });
  revalidatePath("/admin/tax");
}

/* ----------------------------------------------------------------- access */

export const AGENCY_STATUSES = ["active", "suspended"] as const;
export const AGENCY_PLANS = ["starter", "studio", "scale"] as const;

async function agency(agencyId: string): Promise<Agency> {
  const found = await getAgency(agencyId);
  if (!found) throw new OperationError("not_found", "Agency not found.");
  return found;
}

/** Suspends or reactivates an agency. The same status again changes nothing. */
export async function changeAgencyStatus(
  ctx: PlatformContext,
  agencyId: string,
  status: Agency["status"],
): Promise<Agency> {
  if (!AGENCY_STATUSES.includes(status)) throw new OperationError("invalid", "Use active or suspended.", "status");
  const current = await agency(agencyId);
  if (current.status === status) return current;

  await db.updateOne(COLLECTIONS.agencies, { id: agencyId }, { $set: { status } });
  recordAudit({
    category: "administration",
    action: "agency.status_changed",
    summary: `${status === "suspended" ? "Suspended" : "Reactivated"} agency ${current.name}`,
    agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "agency",
    entityId: agencyId,
    meta: { status },
  });
  revalidatePath("/admin/agencies");
  return { ...current, status };
}

/** Moves an agency to another plan. The same plan again changes nothing. */
export async function changeAgencyPlan(ctx: PlatformContext, agencyId: string, plan: Agency["plan"]): Promise<Agency> {
  if (!AGENCY_PLANS.includes(plan)) throw new OperationError("invalid", "Use starter, studio or scale.", "plan");
  const current = await agency(agencyId);
  if (current.plan === plan) return current;

  await db.updateOne(COLLECTIONS.agencies, { id: agencyId }, { $set: { plan } });
  recordAudit({
    category: "administration",
    action: "agency.plan_changed",
    summary: `Moved ${current.name} from the ${current.plan} plan to ${plan}`,
    agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "agency",
    entityId: agencyId,
    meta: { from: current.plan, to: plan },
  });
  revalidatePath("/admin/agencies");
  return { ...current, plan };
}

/* ------------------------------------------------- the platform's sourcing desk */

function revalidateEnquiry(storeId: string) {
  revalidatePath("/admin/quotes");
  revalidatePath(`/app/stores/${storeId}/sourcing`);
  revalidatePath(`/app/stores/${storeId}`);
}

export interface SupplierQuoteFields {
  requestId: string;
  /** The quote's own id: the form's submission key, so a resubmission lands once. */
  quoteId: string;
  supplierLabel: string;
  /** Per unit, in the enquiry's currency. */
  unitCost: Amount;
  /** Blank or null: the run size the store asked for. */
  minimumOrderQuantity: string | number | null;
  leadTimeDays: string | number;
  /** `YYYY-MM-DD`, or "" for no expiry. */
  validUntil: string;
  notes: string;
  /** The shared listing the store copy is built on, for an enquiry that named none. */
  baseCatalogProductId: string;
}

/** The sourcing desk recording one supplier's quote against an enquiry. */
export async function addSupplierQuote(
  ctx: PlatformContext,
  input: SupplierQuoteFields,
): Promise<{ request: QuoteRequest; quote: SupplierQuote; alreadyRecorded: boolean }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.sourcing" });
  const request = await getQuoteRequest(input.requestId);
  const quoteId = input.quoteId;
  if (!request) throw new OperationError("not_found", t("enquiryGone"));
  if (!quoteId) throw new OperationError("invalid", t("formNotReady"));
  if (request.status === "withdrawn" || request.status === "accepted") {
    throw new OperationError(
      "conflict",
      t(request.status === "withdrawn" ? "withdrawnNoQuotes" : "acceptedNoQuotes", { code: request.code }),
    );
  }
  // Submitting the same form twice lands the quote once.
  const recorded = (request.quotes ?? []).find((q) => q.id === quoteId);
  if (recorded) return { request, quote: recorded, alreadyRecorded: true };

  const checked = checkSupplierQuote(
    {
      supplierLabel: input.supplierLabel,
      unitCost:
        typeof input.unitCost === "number" ? toMajorString(input.unitCost, request.currency) : input.unitCost,
      minimumOrderQuantity: input.minimumOrderQuantity === null ? "" : String(input.minimumOrderQuantity),
      leadTimeDays: String(input.leadTimeDays),
      validUntil: input.validUntil,
      notes: input.notes,
    },
    request.currency,
    request.quantity,
  );
  if (!checked.ok) throw new OperationError("invalid", t(`quoteCheck.${checked.field}`), checked.field);

  // The copy needs variants, print areas and mockups to start from. An enquiry
  // that named a catalog item uses it; a described one needs the desk to say
  // which shared listing the quoted product is closest to.
  const baseId = request.catalogProductId ?? input.baseCatalogProductId;
  const base = baseId ? await getCatalogProduct(baseId) : null;
  if (!base) throw new OperationError("invalid", t("chooseBase"), "baseCatalogProductId");

  const quote: SupplierQuote = {
    id: quoteId,
    ...checked.value,
    baseCatalogProductId: base.id,
    recordedBy: ctx.actor.name,
    recordedAt: new Date().toISOString(),
  };
  const pushed = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted", "declined"] }, "quotes.id": { $ne: quote.id } },
    { $push: { quotes: quote }, $set: { status: "quoted", declineReason: null } },
  );
  if (!pushed) throw new OperationError("conflict", t("changed", { code: request.code }));

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_recorded",
    summary: `Recorded ${quote.supplierLabel}'s quote of ${formatMoney(quote.unitCost, request.currency)} a unit on ${request.code} for ${request.storeName}`,
    storeId: request.storeId,
    agencyId: request.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "quote_request",
    entityId: request.id,
    meta: {
      code: request.code,
      supplierLabel: quote.supplierLabel,
      unitCost: quote.unitCost,
      currency: request.currency,
      minimumOrderQuantity: quote.minimumOrderQuantity,
      leadTimeDays: quote.leadTimeDays,
    },
    notify: {
      type: "quote_received",
      href: `/app/stores/${request.storeId}/sourcing`,
      params: { code: request.code, name: quote.supplierLabel },
    },
  });

  revalidateEnquiry(request.storeId);
  return {
    request: {
      ...request,
      status: "quoted",
      declineReason: null,
      quotes: [...(request.quotes ?? []), quote],
    },
    quote,
    alreadyRecorded: false,
  };
}

/** No supplier took the run on. The store is told, with the reason. */
export async function declineEnquiry(
  ctx: PlatformContext,
  requestId: string,
  rawReason: string,
): Promise<QuoteRequest> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.sourcing" });
  const reason = rawReason.trim().slice(0, 2000);
  if (reason.length < 5) throw new OperationError("invalid", t("reasonRequired"), "reason");

  const request = await getQuoteRequest(requestId);
  if (!request) throw new OperationError("not_found", t("enquiryGone"));

  const declined = await updateQuoteRequest(
    request.id,
    { status: { $in: ["submitted", "quoted"] } },
    { $set: { status: "declined", declineReason: reason } },
  );
  if (!declined) throw new OperationError("conflict", t("notOpen", { code: request.code }));

  recordAudit({
    category: "sourcing",
    action: "sourcing.quote_declined",
    summary: `Declined ${request.code} for ${request.storeName}: ${reason}`,
    storeId: request.storeId,
    agencyId: request.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "quote_request",
    entityId: request.id,
    meta: { code: request.code },
  });

  revalidateEnquiry(request.storeId);
  return { ...request, status: "declined", declineReason: reason };
}

/* ---------------------------------------------------------------- audit log */

/**
 * The platform-wide audit log as the admin log page reads it: every store and
 * the platform's own changes, read as platform access (no shopper names, no
 * order values) and redacted before the filters run, so neither the search
 * nor the person filter can confirm a name the result does not show.
 */
export async function platformAuditLog(filters: AuditFilters, cap: number) {
  const [stores, suppliers] = await Promise.all([listAllStores(), listSuppliers()]);
  const now = new Date().toISOString();
  // Nothing on the platform predates the oldest store by more than the margin
  // `auditWindow` adds, so that is where an unbounded read starts from.
  const earliest = stores.reduce((oldest, store) => (store.createdAt < oldest ? store.createdAt : oldest), now);
  const scope: Record<string, unknown> = {};
  if (filters.category) scope.category = filters.category;
  const loaded = await loadAuditWindow(scope, auditWindow(filters, earliest, now), cap);
  const entries = platformAuditEntries(loaded.entries);
  return {
    entries: entries.filter((entry) => matchesAuditFilters(entry, filters)),
    actors: auditActors(entries, filters.actorId),
    coveredFrom: loaded.coveredFrom,
    truncated: loaded.truncated,
    stores,
    suppliers,
  };
}
