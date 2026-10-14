import "server-only";
import { z } from "zod";
import { COLLECTIONS, getCatalogProduct, listCatalogProducts, listSuppliers, pageRecords } from "../../data";
import type { OperationContext } from "../../operations/context";
import {
  acceptSupplierQuote,
  copyQuoteIntoCatalog,
  findQuoteRequest,
  raiseQuoteRequest,
  withdrawEnquiry,
} from "../../operations/sourcing";
import { isQuoteOnly } from "../../sourcing";
import { PRODUCT_CATEGORIES, type QuoteRequest } from "../../types";
import { toMajorString } from "../../util";
import { decodeCursor, define, id, notFound, page, paging, type ApiOperation } from "../define";
import { presentProduct } from "../present";
import { presentQuoteRequest, presentSourcingListing } from "../present-sourcing";

const QUOTE_REQUEST_STATUSES = ["submitted", "quoted", "accepted", "declined", "withdrawn"] as const;

async function enquiry(ctx: OperationContext, requestId: string) {
  return (await findQuoteRequest(ctx.store.id, requestId)) ?? notFound("Enquiry");
}

export const sourcingOperations: ApiOperation[] = [
  define({
    id: "listSourcingListings",
    method: "GET",
    path: "/sourcing/listings",
    scope: "sourcing:read",
    tag: "Sourcing",
    summary: "List quote-only sourcing listings",
    description:
      "Active catalog listings from approved suppliers that are priced per enquiry rather than per unit, with their minimum run, indicative unit cost band (minor units, never a promise), usual response time and delivery markets. Ask for a price with createQuoteRequest.",
    input: z.object({
      category: z.enum(PRODUCT_CATEGORIES).optional(),
      region: z.string().optional().describe("Only listings that deliver to this market, such as European Union."),
    }),
    run: async (_ctx, input) => {
      const [catalog, suppliers] = await Promise.all([listCatalogProducts(), listSuppliers()]);
      const approved = new Set(suppliers.filter((s) => s.status === "approved").map((s) => s.id));
      return {
        data: catalog
          .filter(isQuoteOnly)
          .filter(
            (c) =>
              c.status === "active" &&
              approved.has(c.supplierId) &&
              (!input.category || c.category === input.category) &&
              (!input.region || c.fulfillmentRegions.includes(input.region)),
          )
          .map(presentSourcingListing),
      };
    },
  }),
  define({
    id: "listQuoteRequests",
    method: "GET",
    path: "/sourcing/enquiries",
    scope: "sourcing:read",
    tag: "Sourcing",
    summary: "List bulk sourcing enquiries",
    description: "The store's requests for quote, newest first, each with the supplier quotes recorded against it so far.",
    input: z.object({
      status: z.enum(QUOTE_REQUEST_STATUSES).optional().describe("Only enquiries in this status."),
      ...paging,
    }),
    run: async (ctx, input) =>
      page(
        await pageRecords<QuoteRequest>(
          COLLECTIONS.quoteRequests,
          { storeId: ctx.store.id, ...(input.status ? { status: input.status } : {}) },
          "createdAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        presentQuoteRequest,
      ),
  }),
  define({
    id: "getQuoteRequest",
    method: "GET",
    path: "/sourcing/enquiries/{requestId}",
    scope: "sourcing:read",
    tag: "Sourcing",
    summary: "Get a bulk sourcing enquiry",
    description: "One enquiry with its supplier quotes. A quote with `acceptable: true` can be accepted with acceptQuote.",
    input: z.object({ requestId: id("enquiry") }),
    run: async (ctx, input) => presentQuoteRequest(await enquiry(ctx, input.requestId)),
  }),
  define({
    id: "createQuoteRequest",
    method: "POST",
    path: "/sourcing/enquiries",
    scope: "sourcing:write",
    tag: "Sourcing",
    summary: "Ask suppliers for a bulk quote",
    description:
      "Sends a request for quote to the supplier marketplace: for a quote-only listing (see listSourcingListings), a catalog product to source in bulk, or a product described from scratch (leave catalogId out and give productName and description). Suppliers' quotes appear on the enquiry over the following working days.",
    status: 201,
    actions: ["sourcing#requestQuote"],
    input: z.object({
      catalogId: z.string().optional().describe("The catalog listing the enquiry refers to. Leave out to describe the product instead."),
      productName: z.string().optional().describe("What the product is, when no catalogId is given. Ignored otherwise."),
      description: z
        .string()
        .optional()
        .describe("The material and weight, sizes or capacity. At least 20 characters when no catalogId is given."),
      quantity: z.number().int().positive().describe("Units in the run, at least the listing's minimum order quantity."),
      destination: z.string().describe("The market the run is delivered to, one of the listing's or supplier's regions."),
      targetUnitCost: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("What you hope to pay per unit, in minor units of the listing's currency (USD when described)."),
      neededBy: z.string().optional().describe("Date the goods are needed by, YYYY-MM-DD, not in the past."),
      customisation: z.string().describe("Decoration, packaging and material notes for the factory, or “none”."),
      contactName: z.string().describe("Who the supplier replies to."),
      contactEmail: z.string().describe("The email address the supplier replies to."),
      idempotencyKey: z
        .string()
        .min(8)
        .max(40)
        .optional()
        .describe("Any unique string. Sending the same enquiry again with the same key returns the first one instead of asking twice."),
    }),
    run: async (ctx, input) => {
      // The target is entered in the listing's currency, as the form takes it.
      const listing = input.catalogId ? await getCatalogProduct(input.catalogId) : null;
      const currency = listing?.currency ?? "USD";
      const { request, alreadySent } = await raiseQuoteRequest(ctx, input.catalogId ?? "", {
        productName: input.productName ?? "",
        description: input.description ?? "",
        quantity: String(input.quantity),
        destination: input.destination,
        targetUnitCost: input.targetUnitCost === undefined ? "" : toMajorString(input.targetUnitCost, currency),
        neededBy: input.neededBy ?? "",
        customisation: input.customisation,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        submissionKey: input.idempotencyKey ?? "",
      });
      return { alreadySent, enquiry: presentQuoteRequest(request) };
    },
  }),
  define({
    id: "withdrawQuoteRequest",
    method: "POST",
    path: "/sourcing/enquiries/{requestId}/withdraw",
    scope: "sourcing:write",
    tag: "Sourcing",
    summary: "Withdraw a bulk sourcing enquiry",
    description:
      "Cancels an enquiry the store no longer needs. The record is kept. Only an enquiry awaiting or holding quotes can be withdrawn; an accepted or declined one is refused with 409.",
    destructive: true,
    actions: ["sourcing#withdrawQuoteRequest"],
    input: z.object({ requestId: id("enquiry") }),
    run: async (ctx, input) => presentQuoteRequest(await withdrawEnquiry(ctx, input.requestId)),
  }),
  define({
    id: "acceptQuote",
    method: "POST",
    path: "/sourcing/enquiries/{requestId}/quotes/{quoteId}/accept",
    scope: "sourcing:write",
    tag: "Sourcing",
    summary: "Accept a supplier quote",
    description:
      "Picks the quote the store will go with; the others stay on record. The enquiry must hold quotes and the quote must not have lapsed. A store accepts one quote per enquiry, and that choice cannot be changed from the API. Then copy it into the catalog with copyAcceptedQuote.",
    destructive: true,
    actions: ["sourcing#acceptQuote"],
    input: z.object({ requestId: id("enquiry"), quoteId: id("quote") }),
    run: async (ctx, input) => presentQuoteRequest(await acceptSupplierQuote(ctx, input.requestId, input.quoteId)),
  }),
  define({
    id: "copyAcceptedQuote",
    method: "POST",
    path: "/sourcing/enquiries/{requestId}/copy",
    scope: "sourcing:write",
    tag: "Sourcing",
    summary: "Copy an accepted quote into the catalog",
    description:
      "Creates a draft product built on the quote's base listing, at the quoted unit cost, flagged for manual fulfilment. Done once per enquiry: calling again returns the product the first call made, with `created: false`.",
    actions: ["sourcing#copyAcceptedQuote"],
    input: z.object({ requestId: id("enquiry") }),
    run: async (ctx, input) => {
      const { product, created } = await copyQuoteIntoCatalog(ctx, input.requestId);
      return { created, product: presentProduct(product, ctx.store) };
    },
  }),
];
