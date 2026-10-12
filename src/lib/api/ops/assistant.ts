import "server-only";
import { z } from "zod";
import { COLLECTIONS, pageRecords } from "../../data";
import {
  applyAssistantSuggestion,
  assistantFailure,
  dismissAssistantSuggestion,
  draftCopy,
  draftPrice,
  draftProductIdeas,
  draftSupplier,
  findSuggestion,
} from "../../operations/assistant";
import { isOperationError, type OperationContext } from "../../operations/context";
import type { AiSuggestion } from "../../types";
import { ApiError } from "../auth";
import { decodeCursor, define, id, notFound, page, paging, type ApiOperation } from "../define";
import { presentSuggestion } from "../present-sourcing";

const SUGGESTION_KINDS = ["product_idea", "supplier", "description", "tags", "price"] as const;
const PENDING_NOTE =
  "Suggestions are stored as pending with the assistant's reasoning; nothing changes in the store until one is applied with applySuggestion.";

/**
 * Runs an assistant request. A refusal passes through; the assistant itself
 * failing is reported as 502 in the caller's words, its own error logged.
 */
async function ask<T>(ctx: OperationContext, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isOperationError(error)) throw error;
    throw new ApiError(502, "internal_error", await assistantFailure(ctx.locale, error));
  }
}

async function suggestion(ctx: OperationContext, suggestionId: string) {
  return (await findSuggestion(ctx.store.id, suggestionId)) ?? notFound("Suggestion");
}

export const assistantOperations: ApiOperation[] = [
  define({
    id: "listSuggestions",
    method: "GET",
    path: "/assistant/suggestions",
    scope: "assistant:read",
    tag: "Assistant",
    summary: "List assistant suggestions",
    description: "The assistant's suggestions for the store, newest first, with their reasoning, payload and decision.",
    input: z.object({
      status: z.enum(["pending", "applied", "dismissed"]).optional().describe("Only suggestions with this decision."),
      kind: z.enum(SUGGESTION_KINDS).optional().describe("Only suggestions of this kind."),
      productId: z.string().optional().describe("Only suggestions for this product."),
      ...paging,
    }),
    run: async (ctx, input) =>
      page(
        await pageRecords<AiSuggestion>(
          COLLECTIONS.suggestions,
          {
            storeId: ctx.store.id,
            ...(input.status ? { status: input.status } : {}),
            ...(input.kind ? { kind: input.kind } : {}),
            ...(input.productId ? { productId: input.productId } : {}),
          },
          "createdAt",
          input.limit,
          decodeCursor(input.cursor),
        ),
        presentSuggestion,
      ),
  }),
  define({
    id: "getSuggestion",
    method: "GET",
    path: "/assistant/suggestions/{suggestionId}",
    scope: "assistant:read",
    tag: "Assistant",
    summary: "Get an assistant suggestion",
    description: "One suggestion with its reasoning, payload and decision.",
    input: z.object({ suggestionId: id("suggestion") }),
    run: async (ctx, input) => presentSuggestion(await suggestion(ctx, input.suggestionId)),
  }),
  define({
    id: "requestProductIdeas",
    method: "POST",
    path: "/assistant/product-ideas",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Ask the assistant for product ideas",
    description: `Up to three product ideas for the store, each built on an active supplier catalog listing, with a name, copy, tags and a suggested price. ${PENDING_NOTE}`,
    status: 201,
    actions: ["ai#requestProductIdeas"],
    input: z.object({
      brief: z.string().max(2000).default("").describe("What the store wants to launch, in a sentence or two. Optional."),
    }),
    run: async (ctx, input) => ({
      data: (await ask(ctx, () => draftProductIdeas(ctx, input.brief))).map(presentSuggestion),
    }),
  }),
  define({
    id: "requestProductCopy",
    method: "POST",
    path: "/assistant/copy",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Ask the assistant for product copy",
    description: `A rewritten description and a set of search tags for one of the store's products, as two suggestions. ${PENDING_NOTE}`,
    status: 201,
    actions: ["ai#requestCopy"],
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => ({
      data: (await ask(ctx, () => draftCopy(ctx, input.productId))).suggestions.map(presentSuggestion),
    }),
  }),
  define({
    id: "requestPriceSuggestion",
    method: "POST",
    path: "/assistant/price",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Ask the assistant for a price",
    description: `A retail price for one of the store's products, reasoned from its landed cost. ${PENDING_NOTE}`,
    status: 201,
    actions: ["ai#requestPrice"],
    input: z.object({ productId: id("product") }),
    run: async (ctx, input) => ({
      data: (await ask(ctx, () => draftPrice(ctx, input.productId))).suggestions.map(presentSuggestion),
    }),
  }),
  define({
    id: "requestSupplierSuggestion",
    method: "POST",
    path: "/assistant/supplier",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Ask the assistant which supplier to use",
    description: `Which approved supplier should produce a catalog product for a destination market, and the trade-off. ${PENDING_NOTE}`,
    status: 201,
    actions: ["ai#requestSupplier"],
    input: z.object({
      catalogId: id("catalog product"),
      destination: z.string().max(80).default("North America").describe("The market most orders ship to."),
    }),
    run: async (ctx, input) => ({
      data: (await ask(ctx, () => draftSupplier(ctx, input.catalogId, input.destination))).suggestions.map(
        presentSuggestion,
      ),
    }),
  }),
  define({
    id: "applySuggestion",
    method: "POST",
    path: "/assistant/suggestions/{suggestionId}/apply",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Apply an assistant suggestion",
    description:
      "Applies a pending suggestion, audited under the key's name: a product idea is imported into the catalog as a draft product; a description, tags or price overwrites that field on its product; a supplier recommendation is recorded as accepted. A suggestion is decided once: one already applied or dismissed is refused with 409.",
    destructive: true,
    actions: ["ai#applySuggestion"],
    input: z.object({ suggestionId: id("suggestion") }),
    run: async (ctx, input) => {
      const result = await applyAssistantSuggestion(ctx, input.suggestionId);
      return { productId: result.productId, suggestion: presentSuggestion(result.suggestion) };
    },
  }),
  define({
    id: "dismissSuggestion",
    method: "POST",
    path: "/assistant/suggestions/{suggestionId}/dismiss",
    scope: "assistant:write",
    tag: "Assistant",
    summary: "Dismiss an assistant suggestion",
    description: "Sets a pending suggestion aside without changing anything in the store. One already decided is refused with 409.",
    actions: ["ai#dismissSuggestion"],
    input: z.object({ suggestionId: id("suggestion") }),
    run: async (ctx, input) => presentSuggestion(await dismissAssistantSuggestion(ctx, input.suggestionId)),
  }),
];
