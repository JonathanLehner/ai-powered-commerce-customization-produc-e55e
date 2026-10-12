import "server-only";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import type { ApiScope } from "../api-scopes";
import { getCustomer } from "../customer-data";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStorefront,
  listCatalogProducts,
  listDiscountCodes,
  listProductCollections,
  listTaxBrackets,
  pageRecords,
  type RecordPage,
} from "../data";
import { addCollectionProducts, createCollection, deleteCollection, findCollection, removeCollectionProduct, reorderCollectionProducts, saveCollectionDetails } from "../operations/collections";
import type { OperationContext } from "../operations/context";
import { addNote, createCustomer, exportCustomer, updateCustomer } from "../operations/customers";
import { createDiscount, findDiscount, updateDiscount } from "../operations/discounts";
import { CARRIERS, findOrder, moveOrder, refundOrder, shipOrder } from "../operations/orders";
import {
  addCatalogVariant,
  approveMockups,
  findProduct,
  importProduct,
  saveProductDetails,
  saveVariants,
  setProductStatus,
} from "../operations/products";
import { renameStore, saveBranding, saveCurrencies, saveLanguages, savePolicies, saveSupport } from "../operations/store-settings";
import {
  publishStorefront,
  saveCollectionTranslation,
  saveProductSeo,
  saveProductTranslation,
  saveShopText,
  saveStorefrontDraft,
  shopperMessages,
} from "../operations/storefront";
import { POLICY_KEYS, storePolicyText } from "../policies";
import { flattenShopText, shopTextEntries } from "../shop-text";
import { shipBlock } from "../bulk-orders";
import { isStoredAsset } from "../uploads";
import { THEMES, type Customer, type DiscountCode, type Order, type StoreProduct, type ThemeKey } from "../types";
import { CURRENCY_OPTIONS } from "../util";
import { ApiError } from "./auth";
import { presentCatalogProduct, presentCollection, presentOrder, presentProduct, presentStore } from "./present";

/**
 * Every operation of the Admin API, described once.
 *
 * Each entry is one REST endpoint under `/api/v1/stores/{storeId}` and one MCP
 * tool at `/api/mcp`, and the OpenAPI document is generated from the same
 * list. `run` calls the store operations in `src/lib/operations` that the
 * workspace's own forms call, so a change made through the API or an AI
 * assistant is checked, recorded and revalidated exactly as one made in the
 * workspace. Inputs are zod schemas: path parameters, query parameters and
 * body fields in one object.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const API_TAGS = [
  "Store",
  "Products",
  "Variants",
  "Collections",
  "Orders",
  "Customers",
  "Discounts",
  "Storefront",
  "Translations",
] as const;

export interface ApiOperation {
  /** The OpenAPI operationId. The MCP tool is the same name in snake_case. */
  id: string;
  method: HttpMethod;
  /** Under `/api/v1/stores/{storeId}`; `{name}` segments are path parameters. */
  path: string;
  scope: ApiScope;
  tag: (typeof API_TAGS)[number];
  summary: string;
  description: string;
  input: z.ZodObject;
  /** The success status; 200 unless given. */
  status?: 200 | 201;
  /** Removes or overwrites something that cannot be brought back from the API. */
  destructive?: boolean;
  run(ctx: OperationContext, input: never): Promise<unknown>;
}

function define<S extends z.ZodObject>(
  operation: Omit<ApiOperation, "input" | "run"> & {
    input: S;
    run(ctx: OperationContext, input: z.output<S>): Promise<unknown>;
  },
): ApiOperation {
  return operation as unknown as ApiOperation;
}

/** The MCP tool for an operation: `listProducts` → `list_products`. */
export function toolName(operation: Pick<ApiOperation, "id">): string {
  return operation.id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** The path parameters an operation's path names, `storeId` excluded. */
export function pathParams(operation: Pick<ApiOperation, "path">): string[] {
  return [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

/* ----------------------------------------------------------------- shared */

const id = (what: string) => z.string().min(1).describe(`The ${what} id.`);
const money = (what: string) =>
  z.number().int().describe(`${what}, in minor units of the currency (cents): 2500 is 25.00.`);
const locale = z.enum(LOCALES).describe("A language code the store has enabled, such as de.");
const idempotencyKey = z
  .string()
  .min(8)
  .max(100)
  .optional()
  .describe("Any unique string. Sending the same request again with the same key returns the first result instead of creating a second record.");
const assetUrl = z
  .string()
  .refine(isStoredAsset, "Use an image already uploaded to the store's asset storage (https://assets.clawcorp.ai/…).");

const paging = {
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Records per page, 1 to 100."),
  cursor: z.string().optional().describe("The nextCursor of the previous page."),
};

function decodeCursor(cursor: string | undefined): [string, string] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string")) {
      return value as [string, string];
    }
  } catch {
    // Reported below.
  }
  throw new ApiError(422, "invalid_request", "`cursor` is not one this API returned.", "cursor");
}

function page<T, R>(rows: RecordPage<T>, present: (row: T) => R) {
  return {
    data: rows.data.map(present),
    nextCursor: rows.next ? Buffer.from(JSON.stringify(rows.next)).toString("base64url") : null,
  };
}

function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} not found.`);
}

async function product(ctx: OperationContext, productId: string): Promise<StoreProduct> {
  return (await findProduct(ctx.store.id, productId)) ?? notFound("Product");
}

async function collection(ctx: OperationContext, collectionId: string) {
  return (await findCollection(ctx.store.id, collectionId)) ?? notFound("Collection");
}

async function order(ctx: OperationContext, orderId: string): Promise<Order> {
  return (await findOrder(ctx.store.id, orderId)) ?? notFound("Order");
}

async function customer(ctx: OperationContext, customerId: string): Promise<Customer> {
  return (await getCustomer(ctx.store.id, customerId)) ?? notFound("Customer");
}

async function discount(ctx: OperationContext, discountId: string): Promise<DiscountCode> {
  return (await findDiscount(ctx.store.id, discountId)) ?? notFound("Discount code");
}

/* ------------------------------------------------------------------ store */

const store = [
  define({
    id: "getStore",
    method: "GET",
    path: "/",
    scope: "store:read",
    tag: "Store",
    summary: "Get the store",
    description:
      "The store's name, storefront address, languages, currencies, theme, support contacts and setup progress. Start here to learn which languages and currency the store uses.",
    input: z.object({}),
    run: async (ctx) => presentStore(ctx.store),
  }),
  define({
    id: "updateStore",
    method: "PATCH",
    path: "/",
    scope: "store:write",
    tag: "Store",
    summary: "Rename the store",
    description: "Changes the store's name and the client it is run for. Fields left out keep their value.",
    input: z.object({
      name: z.string().optional().describe("The store name shoppers see. At least 3 characters."),
      clientName: z.string().optional().describe("The client or brand the store is run for."),
    }),
    run: async (ctx, input) =>
      presentStore(
        await renameStore(ctx, { name: input.name ?? ctx.store.name, clientName: input.clientName ?? ctx.store.clientName }),
      ),
  }),
  define({
    id: "updateSupportContacts",
    method: "PUT",
    path: "/support",
    scope: "store:write",
    tag: "Store",
    summary: "Set the shopper support contacts",
    description: "The email address, and optionally the phone number, shoppers are given in the storefront footer and on their order page.",
    input: z.object({
      supportEmail: z.string().describe("Required. Where shoppers write to the store."),
      supportPhone: z.string().default("").describe("Optional. Empty removes it."),
    }),
    run: async (ctx, input) => presentStore(await saveSupport(ctx, input)),
  }),
  define({
    id: "updateCurrencies",
    method: "PUT",
    path: "/currencies",
    scope: "store:write",
    tag: "Store",
    summary: "Set the selling currencies",
    description: "The currencies shoppers can pay in and the default one prices are written in.",
    input: z.object({
      currencies: z
        .array(z.enum(CURRENCY_OPTIONS.map((option) => option.code) as [string, ...string[]]))
        .min(1)
        .describe("ISO currency codes, such as EUR and USD."),
      defaultCurrency: z.string().describe("One of `currencies`."),
    }),
    run: async (ctx, input) => presentStore(await saveCurrencies(ctx, input)),
  }),
  define({
    id: "updateLanguages",
    method: "PUT",
    path: "/languages",
    scope: "store:write",
    tag: "Store",
    summary: "Set the storefront languages",
    description:
      "The languages the storefront and gift portals are offered in, and the default one. Products, collections and shop text are written in the default language and translated into the others.",
    input: z.object({
      languages: z.array(z.enum(LOCALES)).min(1).describe(`Language codes from ${LOCALES.join(", ")}.`),
      defaultLanguage: z.enum(LOCALES).describe("One of `languages`."),
    }),
    run: async (ctx, input) => presentStore(await saveLanguages(ctx, input)),
  }),
  define({
    id: "getPolicies",
    method: "GET",
    path: "/policies",
    scope: "store:read",
    tag: "Store",
    summary: "Get the store policies",
    description:
      "The refund, shipping, terms of sale and privacy text the store wrote, per enabled language. A null policy shows the built-in text to shoppers.",
    input: z.object({}),
    run: async (ctx) => {
      const { locales, defaultLocale } = storeLanguages(ctx.store);
      return {
        defaultLanguage: defaultLocale,
        policies: Object.fromEntries(
          locales.map((language) => [
            language,
            Object.fromEntries(POLICY_KEYS.map((key) => [key, ctx.store.policies?.[language]?.[key] ?? null])),
          ]),
        ),
        effective: Object.fromEntries(
          locales.map((language) => [
            language,
            Object.fromEntries(POLICY_KEYS.map((key) => [key, storePolicyText(ctx.store, key, language, defaultLocale)])),
          ]),
        ),
      };
    },
  }),
  define({
    id: "updatePolicies",
    method: "PUT",
    path: "/policies/{language}",
    scope: "store:write",
    tag: "Store",
    summary: "Set the store policies in one language",
    description:
      "Replaces the store's policies in one language. A policy left out or empty goes back to the built-in text. Plain text; a line starting with # is a heading.",
    destructive: true,
    input: z.object({
      language: locale,
      ...Object.fromEntries(POLICY_KEYS.map((key) => [key, z.string().optional().describe(`The ${key} policy.`)])),
    }) as z.ZodObject<{ language: typeof locale } & Record<(typeof POLICY_KEYS)[number], z.ZodOptional<z.ZodString>>>,
    run: async (ctx, { language, ...texts }) => presentStore(await savePolicies(ctx, language, texts)),
  }),
  define({
    id: "listTaxBrackets",
    method: "GET",
    path: "/tax-brackets",
    scope: "products:read",
    tag: "Products",
    summary: "List tax brackets",
    description: "The tax brackets a product can be filed under. A product needs one before it can be published.",
    input: z.object({}),
    run: async () => ({ data: await listTaxBrackets() }),
  }),
];

/* --------------------------------------------------------------- products */

const productStatus = z.enum(["draft", "in_review", "published", "archived"]);

const products = [
  define({
    id: "listCatalogProducts",
    method: "GET",
    path: "/catalog",
    scope: "products:read",
    tag: "Products",
    summary: "Search the supplier catalog",
    description:
      "Supplier products the store can copy into its catalog with createProduct. Costs are in minor units. Quote-only listings are priced per enquiry and cannot be copied in directly.",
    input: z.object({
      search: z.string().optional().describe("Words to look for in the name, type or description."),
      category: z.enum(["apparel", "drinkware"]).optional(),
    }),
    run: async (_ctx, input) => {
      const words = (input.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const rows = (await listCatalogProducts()).filter(
        (item) =>
          item.status === "active" &&
          (!input.category || item.category === input.category) &&
          words.every((word) => `${item.name} ${item.productType} ${item.description}`.toLowerCase().includes(word)),
      );
      return { data: rows.map(presentCatalogProduct) };
    },
  }),
  define({
    id: "listProducts",
    method: "GET",
    path: "/products",
    scope: "products:read",
    tag: "Products",
    summary: "List products",
    description: "The store's products, newest first, with prices, variants, costs and status.",
    input: z.object({
      status: productStatus.optional().describe("Only products in this status."),
      ...paging,
    }),
    run: async (ctx, input) =>
      page(
        await pageRecords<StoreProduct>(
          COLLECTIONS.storeProducts,
          { storeId: ctx.store.id, ...(input.status ? { status: input.status } : {}) },
          "importedAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        (row) => presentProduct(row, ctx.store),
      ),
  }),
  define({
    id: "getProduct",
    method: "GET",
    path: "/products/{productId}",
    scope: "products:read",
    tag: "Products",
    summary: "Get a product",
    description: "One product with its variants, artwork, mockups, costs and margin.",
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => presentProduct(await product(ctx, input.productId), ctx.store),
  }),
  define({
    id: "createProduct",
    method: "POST",
    path: "/products",
    scope: "products:write",
    tag: "Products",
    summary: "Copy a supplier product into the store",
    description:
      "Creates a draft product from a supplier catalog product (see listCatalogProducts). If the store already has a copy, the call is refused unless confirmDuplicate is true; the new copy then gets a numbered name and SKU.",
    status: 201,
    input: z.object({
      catalogProductId: id("supplier catalog product"),
      confirmDuplicate: z.boolean().default(false).describe("Copy it again although the store already has it."),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const outcome = await importProduct(ctx, {
        catalogId: input.catalogProductId,
        importKey: input.idempotencyKey ?? null,
        confirmed: input.confirmDuplicate,
      });
      if (outcome.kind === "quote_only") {
        throw new ApiError(409, "conflict", "This listing is priced by quote. Request a quote in the workspace.", "catalogProductId");
      }
      if (outcome.kind === "needs_confirmation") {
        throw new ApiError(
          409,
          "conflict",
          "The store already has a copy of this product. Send confirmDuplicate: true to copy it again.",
          "catalogProductId",
        );
      }
      return presentProduct(outcome.product, ctx.store);
    },
  }),
  define({
    id: "updateProduct",
    method: "PATCH",
    path: "/products/{productId}",
    scope: "products:write",
    tag: "Products",
    summary: "Update a product",
    description:
      "Changes a product's name, description, tags, price, tax bracket, visibility, SKU or shopper personalisation. Fields left out keep their value. Price changes are recorded in the store's activity.",
    input: z.object({
      productId: id("product"),
      name: z.string().optional().describe("At least 3 characters."),
      description: z.string().optional().describe("At least 20 characters."),
      tags: z.array(z.string()).max(12).optional(),
      price: money("The selling price").positive().optional(),
      taxBracketId: z.string().nullable().optional().describe("See listTaxBrackets. Published products need one."),
      visibility: z.enum(["public", "hidden"]).optional().describe("Hidden products are only reachable by link."),
      sku: z.string().optional().describe("2 to 40 letters, digits and hyphens, unique in the store."),
      shopperCustomization: z
        .object({
          artworkUpload: z.boolean().optional().describe("Shoppers may upload their own artwork."),
          textLine: z.boolean().optional().describe("Shoppers may add a line of text."),
          textLabel: z.string().optional().describe("The label of that text field."),
          maxTextLength: z.number().int().min(4).max(40).optional(),
        })
        .optional(),
    }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const saved = await saveProductDetails(ctx, current, {
        name: input.name ?? current.name,
        description: input.description ?? current.description,
        tags: input.tags ?? current.tags,
        price: input.price ?? current.price,
        taxBracketId: input.taxBracketId === undefined ? current.taxBracketId : input.taxBracketId,
        visibility: input.visibility ?? current.visibility,
        shopperCustomization: { ...current.shopperCustomization, ...input.shopperCustomization },
        sku: input.sku,
      });
      return presentProduct(saved, ctx.store);
    },
  }),
  define({
    id: "updateProductStatus",
    method: "POST",
    path: "/products/{productId}/status",
    scope: "products:write",
    tag: "Products",
    summary: "Publish, unpublish or archive a product",
    description:
      "Moves a product to draft, in_review, published or archived. Publishing runs the same checks as the workspace (approved mockups, print-ready artwork, a tax bracket); when any fails, nothing changes and the error lists what to fix.",
    input: z.object({ productId: id("product"), status: productStatus }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const { blockers } = await setProductStatus(ctx, current, input.status);
      if (blockers.length > 0) {
        throw new ApiError(409, "conflict", "The product cannot be published yet.", "status", { blockers });
      }
      return presentProduct({ ...current, status: input.status }, ctx.store);
    },
  }),
  define({
    id: "approveProductMockups",
    method: "POST",
    path: "/products/{productId}/mockups/approve",
    scope: "products:write",
    tag: "Products",
    summary: "Approve a product's mockups",
    description: "Approves every generated mockup of the product, which publishing requires.",
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => presentProduct(await approveMockups(ctx, await product(ctx, input.productId)), ctx.store),
  }),
];

/* --------------------------------------------------------------- variants */

const variants = [
  define({
    id: "listVariants",
    method: "GET",
    path: "/products/{productId}/variants",
    scope: "products:read",
    tag: "Variants",
    summary: "List a product's variants",
    description:
      "The product's variants with price, cost and stock, and the supplier variants it does not carry yet (add one with createVariant).",
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const catalog = await getCatalogProduct(current.catalogProductId);
      const carried = new Set(current.variants.map((v) => v.catalogVariantId));
      return {
        currency: current.currency,
        data: current.variants,
        available: (catalog?.variants ?? []).filter((v) => !carried.has(v.id)),
      };
    },
  }),
  define({
    id: "updateVariants",
    method: "PATCH",
    path: "/products/{productId}/variants",
    scope: "products:write",
    tag: "Variants",
    summary: "Update variant prices and availability",
    description:
      "Switches variants on or off and changes their prices. Variants left out are unchanged. At least one variant stays on, and none may be priced at or below its cost.",
    input: z.object({
      productId: id("product"),
      variants: z
        .array(
          z.object({
            id: id("variant"),
            enabled: z.boolean().optional().describe("Whether shoppers can buy it."),
            price: money("The price").positive().optional(),
          }),
        )
        .min(1),
    }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const unknown = input.variants.find((change) => !current.variants.some((v) => v.id === change.id));
      if (unknown) notFound(`Variant ${unknown.id}`);
      const saved = await saveVariants(
        ctx,
        current,
        Object.fromEntries(input.variants.map(({ id: variantId, ...change }) => [variantId, change])),
      );
      return { currency: saved.currency, data: saved.variants };
    },
  }),
  define({
    id: "createVariant",
    method: "POST",
    path: "/products/{productId}/variants",
    scope: "products:write",
    tag: "Variants",
    summary: "Add a supplier variant to a product",
    description:
      "Adds one of the supplier's variants the product does not carry yet (see the available list of listVariants). Without a price it is priced at 2.6 times its cost.",
    status: 201,
    input: z.object({
      productId: id("product"),
      catalogVariantId: id("supplier variant"),
      price: money("The price").positive().optional(),
    }),
    run: async (ctx, input) => {
      const saved = await addCatalogVariant(ctx, await product(ctx, input.productId), input);
      return { currency: saved.currency, data: saved.variants };
    },
  }),
];

/* ------------------------------------------------------------ collections */

const collections = [
  define({
    id: "listCollections",
    method: "GET",
    path: "/collections",
    scope: "collections:read",
    tag: "Collections",
    summary: "List collections",
    description: "The store's collections in storefront order, each with its product ids in display order.",
    input: z.object({}),
    run: async (ctx) => ({ data: (await listProductCollections(ctx.store.id)).map(presentCollection) }),
  }),
  define({
    id: "getCollection",
    method: "GET",
    path: "/collections/{collectionId}",
    scope: "collections:read",
    tag: "Collections",
    summary: "Get a collection",
    description: "One collection with its handle, description, image and product ids.",
    input: z.object({ collectionId: id("collection") }),
    run: async (ctx, input) => presentCollection(await collection(ctx, input.collectionId)),
  }),
  define({
    id: "createCollection",
    method: "POST",
    path: "/collections",
    scope: "collections:write",
    tag: "Collections",
    summary: "Create a collection",
    description: "Creates an empty collection at the end of the store's list. Add products with addCollectionProducts.",
    status: 201,
    input: z.object({
      name: z.string().describe("2 to 80 characters."),
      description: z.string().default("").describe("Up to 600 characters."),
      idempotencyKey,
    }),
    run: async (ctx, input) =>
      presentCollection(
        (await createCollection(ctx, { ...input, submissionKey: input.idempotencyKey ?? null })).collection,
      ),
  }),
  define({
    id: "updateCollection",
    method: "PATCH",
    path: "/collections/{collectionId}",
    scope: "collections:write",
    tag: "Collections",
    summary: "Update a collection",
    description: "Changes a collection's name, description, address handle or image. Fields left out keep their value.",
    input: z.object({
      collectionId: id("collection"),
      name: z.string().optional(),
      description: z.string().optional(),
      handle: z.string().optional().describe("The address segment: lowercase letters, digits and hyphens."),
      imageUrl: assetUrl.nullable().optional().describe("An uploaded image, or null to remove it."),
    }),
    run: async (ctx, input) => {
      const current = await collection(ctx, input.collectionId);
      return presentCollection(
        await saveCollectionDetails(ctx, current, {
          name: input.name ?? current.name,
          description: input.description ?? current.description,
          handle: input.handle ?? current.handle,
          imageUrl: input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
        }),
      );
    },
  }),
  define({
    id: "deleteCollection",
    method: "DELETE",
    path: "/collections/{collectionId}",
    scope: "collections:write",
    tag: "Collections",
    summary: "Delete a collection",
    description: "Deletes the collection. Its products stay in the store.",
    destructive: true,
    input: z.object({ collectionId: id("collection") }),
    run: async (ctx, input) => {
      await deleteCollection(ctx, await collection(ctx, input.collectionId));
      return { deleted: true, id: input.collectionId };
    },
  }),
  define({
    id: "addCollectionProducts",
    method: "POST",
    path: "/collections/{collectionId}/products",
    scope: "collections:write",
    tag: "Collections",
    summary: "Add products to a collection",
    description: "Adds products to the end of the collection. Products already in it, archived ones and unknown ids are skipped.",
    input: z.object({ collectionId: id("collection"), productIds: z.array(z.string()).min(1).max(250) }),
    run: async (ctx, input) => addCollectionProducts(ctx, input.collectionId, input.productIds),
  }),
  define({
    id: "reorderCollectionProducts",
    method: "PUT",
    path: "/collections/{collectionId}/products",
    scope: "collections:write",
    tag: "Collections",
    summary: "Reorder a collection's products",
    description: "Puts the collection's products in the order given. Products left out keep their place after them.",
    input: z.object({ collectionId: id("collection"), productIds: z.array(z.string()).min(1).max(250) }),
    run: async (ctx, input) => reorderCollectionProducts(ctx, input.collectionId, input.productIds),
  }),
  define({
    id: "removeCollectionProduct",
    method: "DELETE",
    path: "/collections/{collectionId}/products/{productId}",
    scope: "collections:write",
    tag: "Collections",
    summary: "Remove a product from a collection",
    description: "Takes one product out of the collection. The product stays in the store.",
    input: z.object({ collectionId: id("collection"), productId: id("product") }),
    run: async (ctx, input) => removeCollectionProduct(ctx, input.collectionId, input.productId),
  }),
];

/* ----------------------------------------------------------------- orders */

const orderStatus = z.enum(["awaiting_payment", "paid", "in_production", "shipped", "delivered", "cancelled", "exception"]);

const orders = [
  define({
    id: "listOrders",
    method: "GET",
    path: "/orders",
    scope: "orders:read",
    tag: "Orders",
    summary: "List orders",
    description: "The store's orders, newest first, with items, totals, payment, fulfilment and refunds.",
    input: z.object({ status: orderStatus.optional().describe("Only orders in this status."), ...paging }),
    run: async (ctx, input) =>
      page(
        await pageRecords<Order>(
          COLLECTIONS.orders,
          { storeId: ctx.store.id, ...(input.status ? { status: input.status } : {}) },
          "createdAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        presentOrder,
      ),
  }),
  define({
    id: "getOrder",
    method: "GET",
    path: "/orders/{orderId}",
    scope: "orders:read",
    tag: "Orders",
    summary: "Get an order",
    description: "One order with its shopper, items, totals, payment, fulfilment, refunds and history.",
    input: z.object({ orderId: id("order") }),
    run: async (ctx, input) => presentOrder(await order(ctx, input.orderId)),
  }),
  define({
    id: "fulfilOrder",
    method: "POST",
    path: "/orders/{orderId}/fulfilment",
    scope: "orders:write",
    tag: "Orders",
    summary: "Mark an order shipped",
    description:
      "Records the carrier and tracking number, marks the order shipped and emails the shopper their tracking link. The order must be in production. Without a tracking number the carrier's own is used. Repeating the same call changes nothing.",
    input: z.object({
      orderId: id("order"),
      carrier: z.enum(CARRIERS).describe("One of the store's enabled carriers."),
      trackingNumber: z.string().default("").describe("At least 6 characters."),
    }),
    run: async (ctx, input) => {
      const current = await order(ctx, input.orderId);
      const repeat =
        current.status === "shipped" &&
        current.fulfillment.carrier === input.carrier &&
        (!input.trackingNumber || current.fulfillment.trackingNumber === input.trackingNumber.trim());
      if (!repeat) {
        if (shipBlock(current)) {
          throw new ApiError(409, "conflict", `Order ${current.code} is ${current.status.replace("_", " ")} and cannot be shipped.`, "orderId");
        }
        await shipOrder(ctx, current, input.carrier, input.trackingNumber);
      }
      return presentOrder(await order(ctx, input.orderId));
    },
  }),
  define({
    id: "updateOrderStatus",
    method: "POST",
    path: "/orders/{orderId}/status",
    scope: "orders:write",
    tag: "Orders",
    summary: "Move an order to another status",
    description:
      "Moves an order along: paid → in_production → shipped → delivered, or to cancelled or exception. A paid order is cancelled through refundOrder with cancel: true, so the money goes back too.",
    input: z.object({
      orderId: id("order"),
      status: z.enum(["paid", "in_production", "shipped", "delivered", "cancelled", "exception"]),
    }),
    run: async (ctx, input) => {
      const current = await order(ctx, input.orderId);
      if (current.status !== input.status && !(await moveOrder(ctx, current, input.status))) {
        throw new ApiError(
          409,
          "conflict",
          `Order ${current.code} cannot move from ${current.status.replace("_", " ")} to ${input.status.replace("_", " ")}.`,
          "status",
        );
      }
      return presentOrder(await order(ctx, input.orderId));
    },
  }),
  define({
    id: "refundOrder",
    method: "POST",
    path: "/orders/{orderId}/refunds",
    scope: "orders:write",
    tag: "Orders",
    summary: "Refund an order",
    description:
      "Gives money back to the shopper's card, in full or in part, optionally cancelling the order. Refunds together cannot exceed the order total. Nothing is recorded unless the payment provider returns the money.",
    destructive: true,
    status: 201,
    input: z.object({
      orderId: id("order"),
      amount: money("The amount to refund").positive(),
      reason: z.string().describe("Why, in a few words. Shown in the order history."),
      cancel: z.boolean().default(false).describe("Cancel the order as well."),
    }),
    run: async (ctx, input) => {
      const result = await refundOrder(ctx, await order(ctx, input.orderId), input);
      return { amount: result.amount, refundId: result.refundId, order: presentOrder(result.order) };
    },
  }),
];

/* -------------------------------------------------------------- customers */

const customerDetails = {
  name: z.string().optional(),
  country: z.string().optional().describe("Two-letter ISO country code, such as DE."),
  preferredLanguage: z.enum(LOCALES).optional(),
  preferredCurrency: z.string().optional().describe("ISO currency code, such as EUR."),
};

const customers = [
  define({
    id: "listCustomers",
    method: "GET",
    path: "/customers",
    scope: "customers:read",
    tag: "Customers",
    summary: "List customers",
    description: "The store's customers, newest first, with order count, lifetime spend and refunds in minor units.",
    input: z.object({ ...paging }),
    run: async (ctx, input) =>
      page(
        await pageRecords<Customer>(COLLECTIONS.customers, { storeId: ctx.store.id }, "createdAt", input.limit, decodeCursor(input.cursor)),
        (row) => row,
      ),
  }),
  define({
    id: "getCustomer",
    method: "GET",
    path: "/customers/{customerId}",
    scope: "customers:read",
    tag: "Customers",
    summary: "Get a customer",
    description: "One customer with their figures and the store team's notes.",
    input: z.object({ customerId: id("customer") }),
    run: async (ctx, input) => customer(ctx, input.customerId),
  }),
  define({
    id: "exportCustomer",
    method: "GET",
    path: "/customers/{customerId}/export",
    scope: "customers:read",
    tag: "Customers",
    summary: "Export a customer's data",
    description: "Everything the store holds on one customer, their orders included, for a data access request. Each export is recorded in the store's activity.",
    input: z.object({ customerId: id("customer") }),
    run: async (ctx, input) => exportCustomer(ctx, await customer(ctx, input.customerId)),
  }),
  define({
    id: "createCustomer",
    method: "POST",
    path: "/customers",
    scope: "customers:write",
    tag: "Customers",
    summary: "Add a customer",
    description: "Adds a customer who has not ordered yet, such as one moved over from another shop. A store keeps one customer per email address.",
    status: 201,
    input: z.object({ email: z.string().describe("Their email address."), ...customerDetails }),
    run: async (ctx, input) => createCustomer(ctx, input),
  }),
  define({
    id: "updateCustomer",
    method: "PATCH",
    path: "/customers/{customerId}",
    scope: "customers:write",
    tag: "Customers",
    summary: "Update a customer",
    description: "Changes a customer's name, country, language or currency. Fields left out keep their value.",
    input: z.object({ customerId: id("customer"), ...customerDetails }),
    run: async (ctx, { customerId, ...details }) => updateCustomer(ctx, await customer(ctx, customerId), details),
  }),
  define({
    id: "addCustomerNote",
    method: "POST",
    path: "/customers/{customerId}/notes",
    scope: "customers:write",
    tag: "Customers",
    summary: "Add a note to a customer",
    description: "Adds a note the store team sees on the customer's page. Shoppers never see notes.",
    status: 201,
    input: z.object({
      customerId: id("customer"),
      body: z.string().describe("Up to 2,000 characters."),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const current = await customer(ctx, input.customerId);
      await addNote(ctx, current, { body: input.body, submissionKey: input.idempotencyKey ?? "" });
      return customer(ctx, input.customerId);
    },
  }),
];

/* -------------------------------------------------------------- discounts */

const discountTerms = {
  kind: z.enum(["percentage", "fixed"]).describe("percentage: value is whole percent. fixed: value is an amount in minor units."),
  value: z.number().int().positive(),
  minimumSubtotal: z.number().int().min(0).describe("Minimum basket in minor units; 0 for none."),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("Last day the code works, YYYY-MM-DD, or null for no expiry."),
  usageLimit: z.number().int().min(1).nullable().describe("How many times it can be used, or null for no limit."),
  active: z.boolean(),
};

const discounts = [
  define({
    id: "listDiscounts",
    method: "GET",
    path: "/discounts",
    scope: "discounts:read",
    tag: "Discounts",
    summary: "List discount codes",
    description: "The store's discount codes with their terms and how often each was used.",
    input: z.object({}),
    run: async (ctx) => ({ data: await listDiscountCodes(ctx.store.id) }),
  }),
  define({
    id: "getDiscount",
    method: "GET",
    path: "/discounts/{discountId}",
    scope: "discounts:read",
    tag: "Discounts",
    summary: "Get a discount code",
    description: "One discount code with its terms and usage.",
    input: z.object({ discountId: id("discount code") }),
    run: async (ctx, input) => discount(ctx, input.discountId),
  }),
  define({
    id: "createDiscount",
    method: "POST",
    path: "/discounts",
    scope: "discounts:write",
    tag: "Discounts",
    summary: "Create a discount code",
    description: "Creates a code shoppers enter in the basket or at checkout. Amounts are in the store's default currency.",
    status: 201,
    input: z.object({
      code: z.string().describe("What shoppers type, such as SUMMER20. Stored in capitals; unique in the store."),
      ...discountTerms,
      minimumSubtotal: discountTerms.minimumSubtotal.default(0),
      expiresAt: discountTerms.expiresAt.default(null),
      usageLimit: discountTerms.usageLimit.default(null),
      active: discountTerms.active.default(true),
    }),
    run: async (ctx, { code, ...terms }) => createDiscount(ctx, code, terms),
  }),
  define({
    id: "updateDiscount",
    method: "PATCH",
    path: "/discounts/{discountId}",
    scope: "discounts:write",
    tag: "Discounts",
    summary: "Update a discount code",
    description: "Changes a code's terms or switches it on or off. Fields left out keep their value. The code itself cannot change.",
    input: z.object({
      discountId: id("discount code"),
      ...Object.fromEntries(Object.entries(discountTerms).map(([key, schema]) => [key, schema.optional()])),
    }) as z.ZodObject<{ discountId: z.ZodString } & { [K in keyof typeof discountTerms]: z.ZodOptional<(typeof discountTerms)[K]> }>,
    run: async (ctx, { discountId, ...changes }) => {
      const current = await discount(ctx, discountId);
      return updateDiscount(ctx, current, {
        kind: changes.kind ?? current.kind,
        value: changes.value ?? current.value,
        minimumSubtotal: changes.minimumSubtotal ?? current.minimumSubtotal,
        expiresAt: changes.expiresAt === undefined ? current.expiresAt?.slice(0, 10) ?? null : changes.expiresAt,
        usageLimit: changes.usageLimit === undefined ? current.usageLimit : changes.usageLimit,
        active: changes.active ?? current.active,
      });
    },
  }),
];

/* ------------------------------------------------------------- storefront */

const tree = z
  .record(z.string(), z.unknown())
  .describe("The page as a node tree, in the shape getStorefront returns it. Must contain a ROOT node.");

function versionSummary(version: { id: string; label: string; kind?: string; savedAt: string; savedBy: string }) {
  return { id: version.id, label: version.label, kind: version.kind ?? "published", savedAt: version.savedAt, savedBy: version.savedBy };
}

const storefront = [
  define({
    id: "getStorefront",
    method: "GET",
    path: "/storefront",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get the storefront page",
    description:
      "The storefront home page as a node tree: the draft being edited, the version shoppers see, and the saved history. Edit the draft and save it with saveStorefrontDraft.",
    input: z.object({}),
    run: async (ctx) => {
      const current = await getStorefront(ctx.store.id);
      return {
        draft: current?.draft ?? null,
        draftUpdatedAt: current?.draftUpdatedAt ?? null,
        published: current?.published ?? null,
        publishedAt: current?.publishedAt ?? null,
        publishedBy: current?.publishedBy ?? null,
        history: (current?.history ?? []).map(versionSummary),
      };
    },
  }),
  define({
    id: "saveStorefrontDraft",
    method: "PUT",
    path: "/storefront/draft",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Save the storefront draft",
    description: "Saves a new draft of the storefront page. Shoppers keep seeing the published version until publishStorefront.",
    input: z.object({
      tree,
      label: z.string().default("").describe("A name for this version in the history."),
      locale: z.string().default("").describe("The language the copy was edited in, if not the default."),
    }),
    run: async (ctx, input) => {
      await saveStorefrontDraft(ctx, input);
      return { saved: true };
    },
  }),
  define({
    id: "publishStorefront",
    method: "POST",
    path: "/storefront/publish",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Publish the storefront",
    description: "Puts a page live for shoppers. Without a tree, the saved draft is published.",
    input: z.object({ tree: tree.optional(), label: z.string().default("") }),
    run: async (ctx, input) => {
      const page = input.tree ?? (await getStorefront(ctx.store.id))?.draft;
      if (!page) throw new ApiError(409, "conflict", "There is no draft to publish.", "tree");
      await publishStorefront(ctx, { tree: page, label: input.label });
      return { published: true };
    },
  }),
  define({
    id: "getTheme",
    method: "GET",
    path: "/theme",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get the theme",
    description: "The storefront's theme and logo, and the themes it can use.",
    input: z.object({}),
    run: async (ctx) => ({
      theme: ctx.store.theme,
      logoUrl: ctx.store.logoUrl,
      themes: Object.entries(THEMES).map(([key, theme]) => ({ key, name: theme.name, description: theme.description, accent: theme.accent })),
    }),
  }),
  define({
    id: "updateTheme",
    method: "PUT",
    path: "/theme",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Set the theme and logo",
    description: "Changes the storefront theme and logo. Fields left out keep their value.",
    input: z.object({
      theme: z.enum(Object.keys(THEMES) as [ThemeKey, ...ThemeKey[]]).optional(),
      logoUrl: assetUrl.nullable().optional().describe("An uploaded image, or null to remove the logo."),
    }),
    run: async (ctx, input) => {
      const saved = await saveBranding(ctx, {
        theme: input.theme ?? ctx.store.theme,
        logoUrl: input.logoUrl === undefined ? ctx.store.logoUrl : input.logoUrl,
      });
      return { theme: saved.theme, logoUrl: saved.logoUrl };
    },
  }),
];

/* ----------------------------------------------------------- translations */

const translations = [
  define({
    id: "listShopText",
    method: "GET",
    path: "/shop-text/{language}",
    scope: "storefront:read",
    tag: "Translations",
    summary: "List the shop text in one language",
    description:
      "Every built-in string shoppers read (buttons, checkout labels, order messages) in one language, with the store's own wording where it has one.",
    input: z.object({ language: locale }),
    run: async (ctx, input) => {
      const own = flattenShopText(ctx.store.shopText?.[input.language]);
      return {
        language: input.language,
        data: shopTextEntries(await shopperMessages(input.language)).map((entry) => ({
          key: entry.key,
          page: entry.page,
          default: entry.text,
          value: own[entry.key] ?? null,
        })),
      };
    },
  }),
  define({
    id: "updateShopText",
    method: "PUT",
    path: "/shop-text/{language}/{key}",
    scope: "storefront:write",
    tag: "Translations",
    summary: "Change one shop text string",
    description:
      "Sets the store's wording of one built-in string, such as checkout.pay, in one language. Keep any {placeholders} the default has. An empty value goes back to the default.",
    input: z.object({
      language: locale,
      key: z.string().describe("The string's key from listShopText, such as checkout.pay."),
      value: z.string(),
    }),
    run: async (ctx, { language, key, value }) => ({
      key,
      language,
      value: await saveShopText(ctx, { locale: language, key, value }),
    }),
  }),
  define({
    id: "getProductTranslations",
    method: "GET",
    path: "/products/{productId}/translations",
    scope: "storefront:read",
    tag: "Translations",
    summary: "Get a product's translations",
    description: "The product's translated name, description, options and colours per language, and its search title and description.",
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      return {
        translations: current.translations ?? {},
        seoTitle: current.seoTitle ?? "",
        seoDescription: current.seoDescription ?? "",
      };
    },
  }),
  define({
    id: "updateProductTranslation",
    method: "PUT",
    path: "/products/{productId}/translations/{language}",
    scope: "storefront:write",
    tag: "Translations",
    summary: "Translate a product",
    description:
      "Saves a product's fields in one of the store's other languages. Keys are name, description, textLabel, colour:<Colour> and tag:<tag>. An empty value removes that translation.",
    input: z.object({
      productId: id("product"),
      language: locale,
      values: z.record(z.string(), z.string()).describe('Such as { "name": "Kapuzenpulli" }.'),
    }),
    run: async (ctx, input) => ({
      translations: await saveProductTranslation(ctx, await product(ctx, input.productId), input.language, input.values),
    }),
  }),
  define({
    id: "updateProductSeo",
    method: "PUT",
    path: "/products/{productId}/seo",
    scope: "storefront:write",
    tag: "Translations",
    summary: "Set a product's search title and description",
    description: "The title and description search engines and link previews show. Empty uses the product's name and description.",
    input: z.object({
      productId: id("product"),
      seoTitle: z.string().default("").describe("Up to 120 characters."),
      seoDescription: z.string().default("").describe("Up to 320 characters."),
    }),
    run: async (ctx, input) => saveProductSeo(ctx, await product(ctx, input.productId), input),
  }),
  define({
    id: "getCollectionTranslations",
    method: "GET",
    path: "/collections/{collectionId}/translations",
    scope: "storefront:read",
    tag: "Translations",
    summary: "Get a collection's translations",
    description: "The collection's translated name and description per language.",
    input: z.object({ collectionId: id("collection") }),
    run: async (ctx, input) => ({ translations: (await collection(ctx, input.collectionId)).translations ?? {} }),
  }),
  define({
    id: "updateCollectionTranslation",
    method: "PUT",
    path: "/collections/{collectionId}/translations/{language}",
    scope: "storefront:write",
    tag: "Translations",
    summary: "Translate a collection",
    description: "Saves a collection's name and description in one of the store's other languages. An empty value removes that translation.",
    input: z.object({
      collectionId: id("collection"),
      language: locale,
      values: z.record(z.string(), z.string()).describe('Keys name and description, such as { "name": "Neuheiten" }.'),
    }),
    run: async (ctx, input) => ({
      translations: await saveCollectionTranslation(ctx, await collection(ctx, input.collectionId), input.language, input.values),
    }),
  }),
];

export const API_OPERATIONS: ApiOperation[] = [
  ...store,
  ...products,
  ...variants,
  ...collections,
  ...orders,
  ...customers,
  ...discounts,
  ...storefront,
  ...translations,
];

export function findOperation(operationId: string): ApiOperation {
  const operation = API_OPERATIONS.find((candidate) => candidate.id === operationId);
  if (!operation) throw new Error(`No API operation ${operationId}`);
  return operation;
}
