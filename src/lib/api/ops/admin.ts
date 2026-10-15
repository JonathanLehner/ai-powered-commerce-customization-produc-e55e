import "server-only";
import { z } from "zod";
import { AUDIT_EXPORT_CAP, parseAuditFilters } from "../../audit-log";
import {
  COLLECTIONS,
  getCatalogProduct,
  getPlanEnquiry,
  getQuoteRequest,
  listAgencies,
  listAllStores,
  listCatalogProducts,
  listSuppliers,
  listTaxBrackets,
  listUsers,
  pageRecords,
} from "../../data";
import {
  AGENCY_PLANS,
  AGENCY_STATUSES,
  SUPPLIER_STATUSES,
  addSupplierQuote,
  changeAgencyPlan,
  changeAgencyStatus,
  changeSupplierStatus,
  createSupplier,
  declineEnquiry,
  platformAuditLog,
  removeTaxBracket,
  saveCatalogProduct,
  saveTaxBracket,
  taxBracketUsage,
  updateSupplierRegions,
} from "../../operations/admin";
import {
  INVITE_LINK_DAYS,
  addPlatformAdmin,
  listPlatformAdmins,
  removePlatformAdmin,
  resendPlatformAdminInvitation,
} from "../../operations/platform-admins";
import { AUDIT_CATEGORY_LABELS, PRODUCT_CATEGORIES, type AuditCategory, type CatalogProduct, type PlanEnquiry, type QuoteRequest } from "../../types";
import { CURRENCY_OPTIONS, newId } from "../../util";
import {
  dateRange,
  decodeCursor,
  defineAdmin,
  id,
  idempotencyKey,
  money,
  notFound,
  offsetPage,
  page,
  paging,
  type ApiOperation,
} from "../define";
import {
  presentAgency,
  presentCatalogItem,
  presentPlanEnquiry,
  presentPlatformAuditEntry,
  presentQuoteRequest,
  presentSupplier,
  presentTaxBracket,
} from "../present-admin";

/**
 * Platform administration: suppliers, the shared supplier catalog, global tax
 * brackets, agencies, the sourcing desk's quote requests, plan enquiries and
 * the platform-wide audit log. Platform keys only.
 */

const regions = z.array(z.string().min(1)).describe("Fulfilment regions, such as US, EU, UK or APAC.");

/* -------------------------------------------------------------- suppliers */

async function catalogCount(supplierId: string) {
  return (await listCatalogProducts()).filter((item) => item.supplierId === supplierId).length;
}

const suppliers = [
  defineAdmin({
    id: "listPlatformSuppliers",
    method: "GET",
    path: "/suppliers",
    summary: "List suppliers",
    description:
      "Every supplier on the platform with its review status, kind, integration, capabilities, fulfilment regions, lead time and how many shared catalog products it makes. Stores can only select approved suppliers.",
    input: z.object({
      status: z.enum(SUPPLIER_STATUSES).optional().describe("Only suppliers in this status."),
    }),
    run: async (_ctx, input) => {
      const [rows, catalog] = await Promise.all([listSuppliers(), listCatalogProducts()]);
      return {
        data: rows
          .filter((supplier) => !input.status || supplier.status === input.status)
          .map((supplier) =>
            presentSupplier(supplier, catalog.filter((item) => item.supplierId === supplier.id).length),
          ),
      };
    },
  }),
  defineAdmin({
    id: "createSupplier",
    method: "POST",
    path: "/suppliers",
    summary: "Add a supplier for review",
    description:
      "Adds a supplier in pending_review. Stores cannot select it until it is approved with setSupplierStatus. API-integrated suppliers start with inventory, order submission and tracking capabilities.",
    status: 201,
    actions: ["admin#addSupplier"],
    input: z.object({
      name: z.string().describe("At least 2 characters."),
      website: z.string().describe("The supplier's website, starting https://."),
      summary: z.string().describe("At least 20 characters: what the supplier makes and how it works."),
      kind: z.enum(["print_on_demand", "manufacturer", "sourcing_marketplace"]).default("print_on_demand"),
      integration: z.enum(["api", "manual"]).default("api").describe("api: orders are submitted automatically; manual: by the operations team."),
      regions: regions.describe("At least one fulfilment region."),
    }),
    run: async (ctx, input) => presentSupplier(await createSupplier(ctx, input), 0),
  }),
  defineAdmin({
    id: "setSupplierStatus",
    method: "PUT",
    path: "/suppliers/{supplierId}/status",
    summary: "Approve, disable or return a supplier to review",
    description:
      "approved makes the supplier selectable by stores; disabled withdraws it; pending_review returns it to commercial review. Setting the status it already has changes nothing.",
    actions: ["admin#setSupplierStatus"],
    input: z.object({
      supplierId: id("supplier"),
      status: z.enum(SUPPLIER_STATUSES),
    }),
    run: async (ctx, input) => {
      const supplier = await changeSupplierStatus(ctx, input.supplierId, input.status);
      return presentSupplier(supplier, await catalogCount(supplier.id));
    },
  }),
  defineAdmin({
    id: "updateSupplierRegions",
    method: "PUT",
    path: "/suppliers/{supplierId}/regions",
    summary: "Set a supplier's fulfilment regions",
    description: "Replaces the regions a supplier fulfils to, and optionally the operator notes on it. Notes left out keep their value.",
    actions: ["admin#saveSupplierRegions"],
    input: z.object({
      supplierId: id("supplier"),
      regions: regions.describe("At least one fulfilment region. Replaces the current list."),
      notes: z.string().optional().describe("Operator notes on the supplier."),
    }),
    run: async (ctx, input) => {
      const supplier = await updateSupplierRegions(ctx, input.supplierId, { regions: input.regions, notes: input.notes });
      return presentSupplier(supplier, await catalogCount(supplier.id));
    },
  }),
];

/* --------------------------------------------------------- shared catalog */

const printAreaRow = z.object({
  id: z.string().optional().describe("An existing print area's id, to keep it (and its placement). Left out: a new area."),
  name: z.string().describe("Such as Front chest; at least 2 characters."),
  view: z.enum(["front", "back", "left", "right"]),
  widthMm: z.number().describe("10 to 2000."),
  heightMm: z.number().describe("10 to 2000."),
  minDpi: z.number().describe("72 to 1200."),
});

const variantRow = z.object({
  id: z.string().optional().describe("An existing variant's id, to keep it. Left out: a new variant."),
  sku: z.string().describe("2 to 40 letters, numbers, dots, dashes or underscores; unique within the product."),
  colour: z.string().default(""),
  colourHex: z.string().default("").describe("Such as #1f2937."),
  size: z.string().default(""),
  baseCost: money("The supplier's cost for this variant").refine((value) => value > 0, "Must be more than 0."),
  availability: z.enum(["in_stock", "low_stock", "out_of_stock"]).default("in_stock"),
});

const catalogFields = {
  supplierId: id("supplier").describe("The supplier that makes the product (listPlatformSuppliers)."),
  productType: z.string().describe("Such as “T-shirt, 180 gsm”; at least 3 characters."),
  category: z.enum(PRODUCT_CATEGORIES),
  name: z.string().describe("At least 3 characters, unique among the supplier's products."),
  description: z.string().describe("At least 20 characters."),
  baseCost: money("The supplier's base cost").refine((value) => value > 0, "Must be more than 0."),
  customizationCostPerArea: money("Customisation cost per print area").refine((value) => value >= 0, "Cannot be negative."),
  shippingEstimate: money("Estimated shipping cost").refine((value) => value >= 0, "Cannot be negative."),
  availability: z.enum(["available", "limited", "discontinued"]),
  status: z.enum(["active", "retired"]).describe("retired: no longer offered to stores."),
  fulfillmentRegions: regions.describe("At least one region the product ships to."),
  printAreas: z.array(printAreaRow).describe("1 to 8 print areas. Replaces the current list: an area left out is removed."),
  variants: z.array(variantRow).describe("1 to 200 variants. Replaces the current list: a variant left out is removed."),
};

async function catalogItem(catalogId: string) {
  return (await getCatalogProduct(catalogId)) ?? notFound("Catalog product");
}

async function presentItem(item: CatalogProduct) {
  const supplier = (await listSuppliers()).find((row) => row.id === item.supplierId);
  return presentCatalogItem(item, supplier?.name ?? null);
}

const catalog = [
  defineAdmin({
    id: "listCatalogItems",
    method: "GET",
    path: "/catalog",
    summary: "List the shared supplier catalog",
    description:
      "Every product in the shared catalog stores copy from, retired ones included, with costs in minor units, variants, print areas and file requirements. Quote-only (bulk sourcing) listings are priced per enquiry.",
    input: z.object({
      supplierId: z.string().optional().describe("Only this supplier's products."),
      category: z.enum(PRODUCT_CATEGORIES).optional(),
      status: z.enum(["active", "retired"]).optional(),
    }),
    run: async (_ctx, input) => {
      const [items, supplierRows] = await Promise.all([listCatalogProducts(), listSuppliers()]);
      return {
        data: items
          .filter(
            (item) =>
              (!input.supplierId || item.supplierId === input.supplierId) &&
              (!input.category || item.category === input.category) &&
              (!input.status || item.status === input.status),
          )
          .map((item) =>
            presentCatalogItem(item, supplierRows.find((row) => row.id === item.supplierId)?.name ?? null),
          ),
      };
    },
  }),
  defineAdmin({
    id: "getCatalogItem",
    method: "GET",
    path: "/catalog/{catalogId}",
    summary: "Get a shared catalog product",
    description: "One shared catalog product with its supplier, costs, variants, print areas, mockups and file requirements.",
    input: z.object({ catalogId: id("catalog product") }),
    run: async (_ctx, input) => presentItem(await catalogItem(input.catalogId)),
  }),
  defineAdmin({
    id: "createCatalogItem",
    method: "POST",
    path: "/catalog",
    summary: "Add a product to the shared catalog",
    description:
      "Adds a product every store can copy from. Amounts are in minor units of the product's currency, which is fixed once the product exists. A supplier cannot have two products with the same name.",
    status: 201,
    actions: ["admin#saveCatalogItem"],
    input: z.object({
      ...catalogFields,
      currency: z
        .enum(CURRENCY_OPTIONS.map((option) => option.code) as [string, ...string[]])
        .default("USD")
        .describe("The currency the supplier invoices in."),
      availability: catalogFields.availability.default("available"),
      status: catalogFields.status.default("active"),
    }),
    run: async (ctx, input) => {
      const { item } = await saveCatalogProduct(ctx, { ...input, catalogId: null });
      return presentItem(item);
    },
  }),
  defineAdmin({
    id: "updateCatalogItem",
    method: "PATCH",
    path: "/catalog/{catalogId}",
    summary: "Update a shared catalog product",
    description:
      "Changes a shared catalog product. Fields left out keep their value; printAreas and variants, when sent, replace the whole list (send an existing row's id to keep it). The currency cannot change. Quote-only listings are priced through quote requests and cannot be edited here. Adding or removing print areas or variants is recorded in its own right in the audit log.",
    actions: ["admin#saveCatalogItem"],
    input: z.object({
      catalogId: id("catalog product"),
      ...Object.fromEntries(Object.entries(catalogFields).map(([key, schema]) => [key, schema.optional()])),
    }) as unknown as z.ZodObject<
      { catalogId: z.ZodString } & { [K in keyof typeof catalogFields]: z.ZodOptional<(typeof catalogFields)[K]> }
    >,
    run: async (ctx, input) => {
      const item = await catalogItem(input.catalogId);
      const { item: saved } = await saveCatalogProduct(ctx, {
        catalogId: item.id,
        currency: item.currency,
        supplierId: input.supplierId ?? item.supplierId,
        productType: input.productType ?? item.productType,
        category: input.category ?? item.category,
        name: input.name ?? item.name,
        description: input.description ?? item.description,
        baseCost: input.baseCost ?? item.baseCost,
        customizationCostPerArea: input.customizationCostPerArea ?? item.customizationCostPerArea,
        shippingEstimate: input.shippingEstimate ?? item.shippingEstimate,
        availability: input.availability,
        status: input.status,
        fulfillmentRegions: input.fulfillmentRegions ?? item.fulfillmentRegions,
        printAreas:
          input.printAreas ??
          item.printAreas.map(({ id: areaId, name, view, widthMm, heightMm, minDpi }) => ({
            id: areaId,
            name,
            view,
            widthMm,
            heightMm,
            minDpi,
          })),
        variants:
          input.variants ??
          item.variants.map(({ id: variantId, sku, colour, colourHex, size, baseCost, availability }) => ({
            id: variantId,
            sku,
            colour,
            colourHex,
            size,
            baseCost,
            availability,
          })),
      });
      return presentItem(saved);
    },
  }),
];

/* ------------------------------------------------------------ tax brackets */

const bracketFields = {
  name: z.string().describe("At least 3 characters."),
  code: z.string().describe("2 to 12 letters, numbers, dots or dashes; stored upper case."),
  description: z.string().default(""),
  rate: z.number().describe("Percent, 0 to 50."),
  regions: regions.describe("At least one region the bracket applies to."),
};

const taxBrackets = [
  defineAdmin({
    id: "listPlatformTaxBrackets",
    method: "GET",
    path: "/tax-brackets",
    summary: "List global tax brackets",
    description: "The tax brackets every store files its products under, lowest rate first, with how many store products use each. A bracket in use cannot be deleted.",
    input: z.object({}),
    run: async () => {
      const brackets = await listTaxBrackets();
      return {
        data: await Promise.all(
          brackets.map(async (bracket) => presentTaxBracket(bracket, await taxBracketUsage(bracket.id))),
        ),
      };
    },
  }),
  defineAdmin({
    id: "createTaxBracket",
    method: "POST",
    path: "/tax-brackets",
    summary: "Create a global tax bracket",
    description: "Adds a tax bracket stores can file products under.",
    status: 201,
    actions: ["admin#saveTaxBracket"],
    input: z.object(bracketFields),
    run: async (ctx, input) => {
      const { bracket } = await saveTaxBracket(ctx, { ...input, bracketId: null });
      return presentTaxBracket(bracket, 0);
    },
  }),
  defineAdmin({
    id: "updateTaxBracket",
    method: "PUT",
    path: "/tax-brackets/{bracketId}",
    summary: "Update a global tax bracket",
    description: "Replaces a bracket's name, code, description, rate and regions. A new rate applies to every store product filed under it.",
    actions: ["admin#saveTaxBracket"],
    input: z.object({ bracketId: id("tax bracket"), ...bracketFields }),
    run: async (ctx, input) => {
      const { bracket } = await saveTaxBracket(ctx, input);
      return presentTaxBracket(bracket, await taxBracketUsage(bracket.id));
    },
  }),
  defineAdmin({
    id: "deleteTaxBracket",
    method: "DELETE",
    path: "/tax-brackets/{bracketId}",
    summary: "Delete an unused tax bracket",
    description: "Deletes a bracket no store product is filed under. A bracket in use is refused with a conflict.",
    destructive: true,
    actions: ["admin#deleteTaxBracket"],
    input: z.object({ bracketId: id("tax bracket") }),
    run: async (ctx, input) => {
      await removeTaxBracket(ctx, input.bracketId);
      return { id: input.bracketId, deleted: true };
    },
  }),
];

/* --------------------------------------------------------------- agencies */

async function agencyView(agencyId: string) {
  const [agencies, stores, users] = await Promise.all([listAgencies(), listAllStores(), listUsers()]);
  const agency = agencies.find((row) => row.id === agencyId) ?? notFound("Agency");
  return presentAgency(
    agency,
    stores.filter((store) => store.agencyId === agency.id),
    users.filter((user) => user.agencyId === agency.id).length,
  );
}

const agencies = [
  defineAdmin({
    id: "listAgencies",
    method: "GET",
    path: "/agencies",
    summary: "List agencies",
    description:
      "Every agency with its plan, status, contact, how many stores it runs (live stores against the plan's limit) and how many people it has.",
    input: z.object({
      status: z.enum(AGENCY_STATUSES).optional().describe("Only agencies in this status."),
    }),
    run: async (_ctx, input) => {
      const [rows, stores, users] = await Promise.all([listAgencies(), listAllStores(), listUsers()]);
      return {
        data: rows
          .filter((agency) => !input.status || agency.status === input.status)
          .map((agency) =>
            presentAgency(
              agency,
              stores.filter((store) => store.agencyId === agency.id),
              users.filter((user) => user.agencyId === agency.id).length,
            ),
          ),
      };
    },
  }),
  defineAdmin({
    id: "setAgencyStatus",
    method: "PUT",
    path: "/agencies/{agencyId}/status",
    summary: "Suspend or reactivate an agency",
    description: "suspended shuts the agency out of the workspace; active lets it back in. Setting the status it already has changes nothing.",
    actions: ["admin#setAgencyStatus"],
    input: z.object({ agencyId: id("agency"), status: z.enum(AGENCY_STATUSES) }),
    run: async (ctx, input) => {
      await changeAgencyStatus(ctx, input.agencyId, input.status);
      return agencyView(input.agencyId);
    },
  }),
  defineAdmin({
    id: "setAgencyPlan",
    method: "PUT",
    path: "/agencies/{agencyId}/plan",
    summary: "Move an agency to another plan",
    description:
      "Changes the agency's plan and with it the number of live stores it may run. Stores above a lower plan's limit stay live. Setting the plan it already has changes nothing.",
    actions: ["admin#setAgencyPlan"],
    input: z.object({ agencyId: id("agency"), plan: z.enum(AGENCY_PLANS) }),
    run: async (ctx, input) => {
      await changeAgencyPlan(ctx, input.agencyId, input.plan);
      return agencyView(input.agencyId);
    },
  }),
];

/* ------------------------------------------------------------- sourcing desk */

const quoteStatus = z.enum(["submitted", "quoted", "accepted", "declined", "withdrawn"]);

async function quoteRequest(requestId: string) {
  return (await getQuoteRequest(requestId)) ?? notFound("Quote request");
}

const quotes = [
  defineAdmin({
    id: "listPlatformQuoteRequests",
    method: "GET",
    path: "/quote-requests",
    summary: "List bulk sourcing enquiries",
    description:
      "The sourcing desk's queue: every bulk sourcing enquiry any store has raised, newest first, with the run, the buyer's contact and the quotes recorded so far. Amounts are in minor units of the enquiry's currency.",
    input: z.object({
      status: quoteStatus.optional().describe("Only enquiries in this status; submitted ones await quotes."),
      storeId: z.string().optional().describe("Only this store's enquiries."),
      ...paging,
    }),
    run: async (_ctx, input) =>
      page(
        await pageRecords<QuoteRequest>(
          COLLECTIONS.quoteRequests,
          { ...(input.status ? { status: input.status } : {}), ...(input.storeId ? { storeId: input.storeId } : {}) },
          "createdAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        presentQuoteRequest,
      ),
  }),
  defineAdmin({
    id: "getPlatformQuoteRequest",
    method: "GET",
    path: "/quote-requests/{requestId}",
    summary: "Get a bulk sourcing enquiry",
    description: "One enquiry with its run, the buyer's contact, the quotes recorded and the store's decision.",
    input: z.object({ requestId: id("quote request") }),
    run: async (_ctx, input) => presentQuoteRequest(await quoteRequest(input.requestId)),
  }),
  defineAdmin({
    id: "recordSupplierQuote",
    method: "POST",
    path: "/quote-requests/{requestId}/quotes",
    summary: "Record a supplier's quote",
    description:
      "Records one supplier's price against an enquiry and tells the store. The enquiry moves to quoted. Withdrawn and accepted enquiries take no more quotes. An enquiry that named no catalog item needs baseCatalogProductId: the shared listing the store copy is built on.",
    status: 201,
    actions: ["sourcing#recordSupplierQuote"],
    input: z.object({
      requestId: id("quote request"),
      supplierLabel: z.string().describe("The factory or seller that quoted, as named on the marketplace."),
      unitCost: money("Quoted cost per unit"),
      minimumOrderQuantity: z.number().int().positive().optional().describe("Left out: the quantity the store asked for."),
      leadTimeDays: z.number().int().describe("Days from a confirmed purchase order to goods leaving the factory, 1 to 365."),
      validUntil: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
        .optional()
        .describe("The day the quote lapses, YYYY-MM-DD. Left out: no expiry."),
      notes: z.string().default(""),
      baseCatalogProductId: z.string().default("").describe("The shared catalog product the quoted product is closest to (listCatalogItems)."),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const { request, quote, alreadyRecorded } = await addSupplierQuote(ctx, {
        ...input,
        quoteId: input.idempotencyKey ?? newId("quote"),
        minimumOrderQuantity: input.minimumOrderQuantity ?? null,
        validUntil: input.validUntil ?? "",
      });
      return { quote, alreadyRecorded, request: presentQuoteRequest(request) };
    },
  }),
  defineAdmin({
    id: "declineQuoteRequest",
    method: "POST",
    path: "/quote-requests/{requestId}/decline",
    summary: "Decline a bulk sourcing enquiry",
    description: "No supplier took the run on. The store is told, with the reason. Only submitted and quoted enquiries can be declined; a declined one can still be quoted later.",
    actions: ["sourcing#declineQuoteRequest"],
    input: z.object({
      requestId: id("quote request"),
      reason: z.string().describe("At least 5 characters; shown to the store."),
    }),
    run: async (ctx, input) => presentQuoteRequest(await declineEnquiry(ctx, input.requestId, input.reason)),
  }),
];

/* ---------------------------------------------------------- plan enquiries */

const enquiries = [
  defineAdmin({
    id: "listPlanEnquiries",
    method: "GET",
    path: "/plan-enquiries",
    summary: "List plan enquiries",
    description: "Plan and enterprise enquiries left on the public pricing page, newest first: who asked, for which plan, and what they wrote.",
    input: z.object({ ...paging }),
    run: async (_ctx, input) =>
      page(
        await pageRecords<PlanEnquiry>(
          COLLECTIONS.planEnquiries,
          {},
          "createdAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        presentPlanEnquiry,
      ),
  }),
  defineAdmin({
    id: "getPlanEnquiry",
    method: "GET",
    path: "/plan-enquiries/{enquiryId}",
    summary: "Get a plan enquiry",
    description: "One enquiry from the pricing page: contact, company, plan, billing currency, language, whether they asked for a call, and their message.",
    input: z.object({ enquiryId: id("plan enquiry") }),
    run: async (_ctx, input) => presentPlanEnquiry((await getPlanEnquiry(input.enquiryId)) ?? notFound("Plan enquiry")),
  }),
];

/* --------------------------------------------------------- platform admins */

const platformAdmins = [
  defineAdmin({
    id: "listPlatformAdmins",
    method: "GET",
    path: "/platform-admins",
    summary: "List platform administrators",
    description:
      "Every platform administrator with name, email, when they last signed in (null when not known) and whether they have set a password. Changes nothing.",
    input: z.object({}),
    run: async () => ({ data: await listPlatformAdmins() }),
  }),
  defineAdmin({
    id: "addPlatformAdmin",
    method: "POST",
    path: "/platform-admins",
    summary: "Add a platform administrator",
    description: `Gives a person platform administration and emails them a single-use link to choose their password, valid for ${INVITE_LINK_DAYS} days. A new account is created when the email has none. An email that belongs to an agency's account is refused with a conflict. The link is returned once as invitationUrl, to pass on by hand if the email does not arrive.`,
    status: 201,
    actions: ["platform-admins#addPlatformAdmin"],
    input: z.object({
      name: z.string().describe("2 to 80 characters."),
      email: z.string().describe("The person's email address."),
    }),
    run: async (ctx, input) => addPlatformAdmin(ctx, input),
  }),
  defineAdmin({
    id: "resendPlatformAdminInvitation",
    method: "POST",
    path: "/platform-admins/{userId}/resend-invitation",
    summary: "Resend a platform administrator's invitation",
    description: `Emails a fresh ${INVITE_LINK_DAYS}-day link to choose a password and returns it once as invitationUrl. Earlier links stop working. Refused with a conflict once the person has set a password.`,
    actions: ["platform-admins#resendPlatformAdminInvitation"],
    input: z.object({ userId: id("user") }),
    run: async (ctx, input) => resendPlatformAdminInvitation(ctx, input.userId),
  }),
  defineAdmin({
    id: "removePlatformAdmin",
    method: "DELETE",
    path: "/platform-admins/{userId}",
    summary: "Remove a platform administrator",
    description:
      "Takes platform administration away and closes the account: its password is replaced, outstanding links stop working and its platform keys stop working. Removing the person this key acts for, or the last administrator with a password, is refused with a conflict.",
    destructive: true,
    actions: ["platform-admins#removePlatformAdmin"],
    input: z.object({ userId: id("user") }),
    run: async (ctx, input) => ({ ...(await removePlatformAdmin(ctx, input.userId)), removed: true }),
  }),
];

/* ---------------------------------------------------------------- audit log */

const auditLog = [
  defineAdmin({
    id: "listPlatformAuditLog",
    method: "GET",
    path: "/audit-log",
    summary: "Read the platform-wide audit log",
    description:
      "Changes across every store and the platform itself, newest first, as platform access reads them: shopper names and order values are withheld, before any filter runs. Filter by date range, person, category and free text (every word must appear). Up to 2000 entries are read per request; truncated says older matching entries were left out, so narrow the dates to reach them.",
    input: z.object({
      ...dateRange,
      category: z
        .enum(Object.keys(AUDIT_CATEGORY_LABELS) as [AuditCategory, ...AuditCategory[]])
        .optional()
        .describe("Only this category."),
      actorId: z.string().optional().describe("Only changes made by this person or key (an id from actors)."),
      q: z.string().optional().describe("Words to look for in the summary, action, person and detail."),
      ...paging,
    }),
    run: async (_ctx, input) => {
      const filters = parseAuditFilters({
        from: input.from,
        to: input.to,
        category: input.category,
        actor: input.actorId,
        q: input.q,
      });
      const log = await platformAuditLog(filters, AUDIT_EXPORT_CAP);
      const storeName = (storeId: string | null) =>
        storeId ? (log.stores.find((store) => store.id === storeId)?.name ?? storeId) : null;
      const detail = {
        currency: (entry: { storeId: string | null }) =>
          log.stores.find((store) => store.id === entry.storeId)?.defaultCurrency,
        supplierName: (supplierId: string) => log.suppliers.find((supplier) => supplier.id === supplierId)?.name,
      };
      const rows = offsetPage(log.entries, input.limit, input.cursor);
      return {
        data: rows.data.map((entry) => presentPlatformAuditEntry(entry, storeName(entry.storeId), detail)),
        nextCursor: rows.nextCursor,
        total: log.entries.length,
        actors: log.actors,
        coveredFrom: log.coveredFrom,
        truncated: log.truncated,
      };
    },
  }),
];

export const adminOperations: ApiOperation[] = [
  ...suppliers,
  ...catalog,
  ...taxBrackets,
  ...agencies,
  ...quotes,
  ...enquiries,
  ...platformAdmins,
  ...auditLog,
];
