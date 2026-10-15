import "server-only";
import { z } from "zod";
import { validateArtwork } from "../../artwork";
import { BULK_PRODUCT_LIMIT } from "../../bulk-products";
import { getCatalogProduct, getStorefront } from "../../data";
import {
  generateMockups,
  readStoredAsset,
  rejectMockups,
  saveArtworkPlacement,
  type RenderedMockup,
} from "../../operations/artwork";
import type { OperationContext } from "../../operations/context";
import {
  attachArtwork,
  bulkUpdateProducts,
  deleteProduct,
  findProduct,
  productPublishBlockers,
  removeArtwork,
} from "../../operations/products";
import { translateMissing } from "../../operations/translations";
import type { StoreProduct } from "../../types";
import { storeUpload, UPLOAD_SCOPES } from "../../uploads";
import { ApiError } from "../auth";
import { assetUrl, define, id, locale, notFound, type ApiOperation } from "../define";
import { presentProduct } from "../present";

/**
 * Products beyond the first API: artwork and mockups, what blocks publishing,
 * bulk changes, deletion, and machine translation of what is missing.
 */

async function product(ctx: OperationContext, productId: string): Promise<StoreProduct> {
  return (await findProduct(ctx.store.id, productId)) ?? notFound("Product");
}

/** The product as it is after a write, which may have moved it back to review. */
async function reread(ctx: OperationContext, productId: string) {
  return presentProduct(await product(ctx, productId), ctx.store);
}

const ARTWORK_GUARD =
  "Changing artwork clears the product's mockups; a published product whose mockups are no longer all approved goes back to in_review until new ones are generated and approved.";

export const catalogOperations: ApiOperation[] = [
  /* ---------------------------------------------------------------- uploads */
  define({
    id: "uploadFile",
    method: "POST",
    path: "/uploads",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Upload a file",
    description:
      "Stores an image in the store's asset storage and returns its URL, for attachProductArtwork, generateProductMockups and collection images. Send the file base64-encoded. The same type, size and pixel checks run as for a workspace upload.",
    status: 201,
    input: z.object({
      kind: z.enum(["artwork", "mockup", "collection"]).describe("What the file is for: print artwork (25 MB), a mockup or a collection image (8 MB)."),
      contentType: z.string().min(1).describe("The file's MIME type, such as image/png."),
      fileName: z.string().max(200).default("").describe("Optional. The original file name."),
      data: z
        .string()
        .min(1)
        .max(Math.ceil((UPLOAD_SCOPES.artwork.maxBytes * 4) / 3) + 4)
        .describe("The file's bytes, base64-encoded."),
    }),
    run: async (_ctx, input) => {
      const bytes = new Uint8Array(Buffer.from(input.data, "base64"));
      const result = await storeUpload(input.kind, bytes, input.contentType, input.fileName);
      if (!result.ok) throw new ApiError(422, "invalid_request", result.message, "data");
      return result.image;
    },
  }),

  /* ------------------------------------------------------ artwork and mockups */
  define({
    id: "getProductPrintAreas",
    method: "GET",
    path: "/products/{productId}/print-areas",
    scope: "products:read",
    tag: "Artwork and mockups",
    summary: "List a product's print areas and artwork",
    description:
      "The supplier's print areas for the product (ids for attachProductArtwork), the supplier's file requirements, and the artwork placed in each area with the pre-flight issues found. Issues of severity error block publishing.",
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const catalog = await getCatalogProduct(current.catalogProductId);
      if (!catalog) return { fileRequirements: null, data: [] };
      return {
        fileRequirements: catalog.fileRequirements,
        data: catalog.printAreas.map((area) => {
          const artwork = current.artworks.find((a) => a.printAreaId === area.id) ?? null;
          return {
            id: area.id,
            name: area.name,
            view: area.view,
            widthMm: area.widthMm,
            heightMm: area.heightMm,
            minDpi: area.minDpi,
            artwork,
            issues: artwork ? validateArtwork(artwork, area, catalog.fileRequirements) : [],
          };
        }),
      };
    },
  }),
  define({
    id: "attachProductArtwork",
    method: "POST",
    path: "/products/{productId}/artwork",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Place artwork in a print area",
    description: `Places an image already uploaded to the store's asset storage in one of the product's print areas (see getProductPrintAreas), replacing any artwork there, centred at 60% of the area's width. The file is read back and checked as the workspace upload checks it: PNG, JPG or WEBP, at most 25 MB, measurable pixel dimensions, and the supplier's accepted formats and size limit (see fileRequirements from getProductPrintAreas). blockingIssues counts the pre-flight problems that would stop publishing. ${ARTWORK_GUARD}`,
    status: 201,
    actions: ["products#attachArtwork"],
    input: z.object({
      productId: id("product"),
      printAreaId: id("print area"),
      url: assetUrl.describe("The artwork's URL, as returned by uploadFile."),
      fileName: z.string().max(120).optional().describe("The name shown in the workspace and the activity history."),
    }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const stored = await readStoredAsset(input.url, "artwork", "url", input.fileName);
      const { artwork, blockingIssues: blocking } = await attachArtwork(ctx, current, input.printAreaId, stored);
      return { artwork, blockingIssues: blocking, product: await reread(ctx, input.productId) };
    },
  }),
  define({
    id: "updateArtworkPlacement",
    method: "PATCH",
    path: "/products/{productId}/artwork",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Move, scale or rotate placed artwork",
    description: `Changes where artwork sits in its print area. x and y are the artwork's centre as fractions of the print area (0.5 is centred), scale is its width as a fraction of the area's width (0.05 to 2), rotation is in degrees (-180 to 180). Fields left out keep their value. A placement that has not moved changes nothing. ${ARTWORK_GUARD}`,
    actions: ["products#saveArtworkPlacement", "products#persistPlacement"],
    input: z.object({
      productId: id("product"),
      placements: z
        .array(
          z.object({
            artworkId: id("artwork"),
            x: z.number().optional(),
            y: z.number().optional(),
            scale: z.number().optional(),
            rotation: z.number().optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const unknown = input.placements.find((p) => !current.artworks.some((a) => a.id === p.artworkId));
      if (unknown) notFound(`Artwork ${unknown.artworkId}`);
      const { moved } = await saveArtworkPlacement(
        ctx,
        current,
        Object.fromEntries(input.placements.map(({ artworkId, ...change }) => [artworkId, change])),
      );
      return { moved, product: await reread(ctx, input.productId) };
    },
  }),
  define({
    id: "deleteProductArtwork",
    method: "DELETE",
    path: "/products/{productId}/artwork/{artworkId}",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Remove artwork from a product",
    description: `Removes one placed artwork. ${ARTWORK_GUARD}`,
    destructive: true,
    actions: ["products#removeArtwork"],
    input: z.object({ productId: id("product"), artworkId: id("artwork") }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      if (!current.artworks.some((a) => a.id === input.artworkId)) notFound("Artwork");
      await removeArtwork(ctx, current, input.artworkId);
      return { deleted: true, id: input.artworkId, product: await reread(ctx, input.productId) };
    },
  }),
  define({
    id: "generateProductMockups",
    method: "POST",
    path: "/products/{productId}/mockups",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Record a product's mockups",
    description:
      "Saves rendered previews of the product's placed artwork, one per print area that has artwork, replacing the current mockups. Each image must already be uploaded to the store's asset storage and is checked as the workspace checks it (PNG, JPG or WEBP, at most 8 MB). New mockups are unapproved, so a published product goes back to in_review until they are approved with approveProductMockups.",
    status: 201,
    destructive: true,
    actions: ["products#generateMockups"],
    input: z.object({
      productId: id("product"),
      mockups: z
        .array(
          z.object({
            printAreaId: id("print area"),
            url: assetUrl.describe("The rendered preview in the asset storage."),
            shareUrl: assetUrl.optional().describe("A version for link previews and sharing."),
          }),
        )
        .min(1)
        .max(20),
    }),
    run: async (ctx, input) => {
      const current = await product(ctx, input.productId);
      const rendered: Record<string, RenderedMockup> = {};
      for (const [index, mockup] of input.mockups.entries()) {
        rendered[mockup.printAreaId] = {
          image: await readStoredAsset(mockup.url, "mockup", `mockups.${index}.url`),
          share: mockup.shareUrl ? await readStoredAsset(mockup.shareUrl, "mockup", `mockups.${index}.shareUrl`) : null,
        };
      }
      const { count } = await generateMockups(ctx, current, rendered);
      return { count, product: await reread(ctx, input.productId) };
    },
  }),
  define({
    id: "rejectProductMockups",
    method: "POST",
    path: "/products/{productId}/mockups/reject",
    scope: "products:write",
    tag: "Artwork and mockups",
    summary: "Reject a product's mockups",
    description:
      "Clears the product's mockups and returns it for changes. A published product goes back to in_review until new mockups are generated and approved.",
    destructive: true,
    actions: ["products#rejectMockups"],
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => {
      await rejectMockups(ctx, await product(ctx, input.productId));
      return reread(ctx, input.productId);
    },
  }),

  /* --------------------------------------------------------------- products */
  define({
    id: "getPublishBlockers",
    method: "GET",
    path: "/products/{productId}/publish-blockers",
    scope: "products:read",
    tag: "Products",
    summary: "List what stops a product being published",
    description:
      "Everything that must be fixed before updateProductStatus can publish the product, each with the reason and the fix. An empty list means it can be published.",
    actions: ["products#publishBlockers"],
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => ({
      data: await productPublishBlockers(await product(ctx, input.productId), ctx.locale),
    }),
  }),
  define({
    id: "bulkUpdateProducts",
    method: "POST",
    path: "/products/bulk",
    scope: "products:write",
    tag: "Products",
    summary: "Change many products at once",
    description: `Applies one action to up to ${BULK_PRODUCT_LIMIT} products and reports each: publish (with the same checks as updateProductStatus), unpublish (back to in_review), archive, bracket (set the tax bracket, see listTaxBrackets), visibility, or price. A price change raises or lowers the product price and every variant price by a percentage, or sets them all to one amount in minor units; no variant may end up at or below its cost; from must give each product's current price, and a product whose price differs is skipped, so a repeated request does not change prices twice. Products that cannot take the change are listed in failed with the reason.`,
    actions: ["products#bulkUpdateProducts"],
    input: z.object({
      productIds: z.array(id("product")).min(1).max(BULK_PRODUCT_LIMIT),
      action: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("publish") }),
        z.object({ kind: z.literal("unpublish") }),
        z.object({ kind: z.literal("archive") }),
        z.object({ kind: z.literal("bracket"), bracketId: id("tax bracket") }),
        z.object({ kind: z.literal("visibility"), visibility: z.enum(["public", "hidden"]) }),
        z.object({
          kind: z.literal("price"),
          change: z.object({
            mode: z.enum(["increase", "decrease", "set"]),
            value: z
              .number()
              .positive()
              .describe("A percentage for increase (up to 1000) and decrease (under 100); minor units for set."),
          }),
          from: z
            .record(z.string(), z.number().int())
            .describe("Each product's current price in minor units, by product id, as read from getProduct."),
        }),
      ]),
    }),
    run: (ctx, input) => bulkUpdateProducts(ctx, input.productIds, input.action),
  }),
  define({
    id: "deleteProduct",
    method: "DELETE",
    path: "/products/{productId}",
    scope: "products:write",
    tag: "Products",
    summary: "Delete a product",
    description: "Removes the product from the store's catalog for good. To take it off sale but keep it, archive it with updateProductStatus.",
    destructive: true,
    actions: ["products#deleteProduct"],
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => {
      await deleteProduct(ctx, await product(ctx, input.productId));
      return { deleted: true, id: input.productId };
    },
  }),

  /* ----------------------------------------------------------- translations */
  define({
    id: "translateMissing",
    method: "POST",
    path: "/translations/{language}/translate-missing",
    scope: "storefront:write",
    tag: "Translations",
    summary: "Machine-translate everything missing in one language",
    description:
      "Fills every untranslated field in one of the store's other languages with the platform text model: the storefront page draft (saved as the new draft), product names, descriptions and options, collection names and descriptions, and gift portal intros. Results are marked machine-translated; fields that already have a translation are never changed, so running it twice changes nothing the first run wrote. count is 0 when nothing was missing.",
    actions: ["translations#translateMissing"],
    input: z.object({
      language: locale,
      tree: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("A page tree to translate instead of the saved draft, as getStorefront returns it."),
    }),
    run: async (ctx, input) => {
      const tree = input.tree ?? (await getStorefront(ctx.store.id))?.draft ?? null;
      const outcome = await translateMissing(ctx, { locale: input.language, tree });
      return {
        count: outcome.count,
        tree: outcome.tree,
        products: outcome.products ?? {},
        catalogues: outcome.catalogues ?? {},
        collections: outcome.collections ?? {},
      };
    },
  }),
];
