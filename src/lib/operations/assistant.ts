import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/locales";
import { suggestCopy, suggestPrice, suggestProductIdeas, suggestSupplier, type DraftSuggestion } from "../ai";
import { copyCatalogProductIntoStore } from "../catalog-import";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStoreProduct,
  getSuggestion,
  getTaxBracket,
  listCatalogProducts,
  listStoreProducts,
  listSuppliers,
  recordAudit,
  updateStoreProduct,
} from "../data";
import { db } from "../mongo";
import { supersededIds, supersedes } from "../suggestions";
import { breakdownFor } from "../pricing";
import type { AiSuggestion, StoreProduct } from "../types";
import { formatMoney, minorFactor, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * The commerce assistant. Asking for a suggestion stores it as pending, with
 * the assistant's reasoning; nothing is written to a product until a person or
 * key applies the suggestion explicitly, and that decision is audited. The
 * workspace's assistant page and the Admin API both run these.
 */

async function storeDrafts(
  ctx: OperationContext,
  drafts: DraftSuggestion[],
  productId: string | null,
  productName: string | null,
): Promise<AiSuggestion[]> {
  const now = new Date().toISOString();
  const docs: AiSuggestion[] = drafts.map((draft) => ({
    id: newId("sug"),
    storeId: ctx.store.id,
    productId,
    kind: draft.kind,
    title: draft.title,
    rationale: draft.rationale,
    payload: draft.payload,
    status: "pending",
    createdBy: ctx.actor.name,
    createdAt: now,
    decidedBy: null,
    decidedAt: null,
    productName,
    supersededBy: null,
    supersededAt: null,
  }));
  if (docs.length) {
    await db.insertMany(COLLECTIONS.suggestions, docs as unknown as Record<string, unknown>[]);
  }
  // Older pending suggestions of the same kind for the same product are marked
  // as replaced; they stay pending until someone applies or dismisses them.
  await Promise.all(
    docs
      .filter((doc) => supersedes(doc.kind, doc.productId))
      .map((doc) =>
        db.updateMany(
          COLLECTIONS.suggestions,
          {
            storeId: ctx.store.id,
            productId: doc.productId,
            kind: doc.kind,
            status: "pending",
            createdAt: { $lte: doc.createdAt },
            id: { $ne: doc.id },
          },
          { $set: { supersededBy: doc.id, supersededAt: now } },
        ),
      ),
  );
  revalidatePath(`/app/stores/${ctx.store.id}/assistant`);
  return docs;
}

/**
 * A failed assistant call in words a person can act on. The assistant's own
 * error is logged, never shown.
 */
export async function assistantFailure(locale: Locale, error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  const t = await getTranslations({ locale, namespace: "actions.ai" });
  if (message.includes("not valid JSON")) return t("unexpected");
  console.error("Assistant request failed", error);
  return t("failed");
}

/** The suggestion, provided it belongs to the store. */
export async function findSuggestion(storeId: string, suggestionId: string): Promise<AiSuggestion | null> {
  const suggestion = await getSuggestion(suggestionId);
  return suggestion && suggestion.storeId === storeId ? suggestion : null;
}

async function storeProduct(ctx: OperationContext, productId: string): Promise<StoreProduct> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.ai" });
  const product = productId ? await getStoreProduct(productId) : null;
  if (!product || product.storeId !== ctx.store.id) {
    throw new OperationError("not_found", t("chooseProduct"), "productId");
  }
  return product;
}

/** Up to three product ideas, each built on an active listing from an approved supplier. */
export async function draftProductIdeas(ctx: OperationContext, brief: string): Promise<AiSuggestion[]> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.ai" });
  const [catalog, existing, suppliers] = await Promise.all([
    listCatalogProducts(),
    listStoreProducts(ctx.store.id),
    listSuppliers(),
  ]);
  const approved = new Set(suppliers.filter((s) => s.status === "approved").map((s) => s.id));
  const available = catalog.filter((c) => c.status === "active" && approved.has(c.supplierId));
  const drafts = await suggestProductIdeas(ctx.store, available, existing, brief.trim());
  const valid = drafts.filter((d) => available.some((c) => c.id === d.payload.catalogId));
  if (valid.length === 0) throw new OperationError("invalid", t("noMatches"), "brief");
  return storeDrafts(ctx, valid, null, null);
}

/** A description and a set of tags for one of the store's products. */
export async function draftCopy(
  ctx: OperationContext,
  productId: string,
): Promise<{ product: StoreProduct; suggestions: AiSuggestion[] }> {
  const product = await storeProduct(ctx, productId);
  const { description, tags } = await suggestCopy(product, ctx.store);
  return { product, suggestions: await storeDrafts(ctx, [description, tags], product.id, product.name) };
}

/** A retail price for one of the store's products, from its landed cost. */
export async function draftPrice(
  ctx: OperationContext,
  productId: string,
): Promise<{ product: StoreProduct; suggestions: AiSuggestion[] }> {
  const product = await storeProduct(ctx, productId);
  const landed = product.costs.supplierCost + product.costs.customizationCost + product.costs.shippingEstimate;
  const draft = await suggestPrice(product, ctx.store, landed);
  return { product, suggestions: await storeDrafts(ctx, [draft], product.id, product.name) };
}

/** Which approved supplier should produce a catalog product for a destination. */
export async function draftSupplier(
  ctx: OperationContext,
  catalogId: string,
  destination: string,
): Promise<{ catalogName: string; suggestions: AiSuggestion[] }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.ai" });
  const catalog = catalogId ? await getCatalogProduct(catalogId) : null;
  if (!catalog) throw new OperationError("not_found", t("chooseCatalog"), "catalogId");
  const suppliers = (await listSuppliers()).filter((s) => s.status === "approved");
  const draft = await suggestSupplier(catalog, suppliers, destination);
  return { catalogName: catalog.name, suggestions: await storeDrafts(ctx, [draft], null, catalog.name) };
}

/** Moves a pending suggestion to its decision, once: a second decision finds it already taken. */
async function decide(ctx: OperationContext, suggestionId: string, status: "applied" | "dismissed" | "pending") {
  const result = (await db.updateOne(
    COLLECTIONS.suggestions,
    { id: suggestionId, storeId: ctx.store.id, status: status === "pending" ? { $ne: "pending" } : "pending" },
    {
      $set:
        status === "pending"
          ? { status, decidedBy: null, decidedAt: null }
          : { status, decidedBy: ctx.actor.name, decidedAt: new Date().toISOString() },
    },
  )) as { matchedCount?: number } | null;
  return (result?.matchedCount ?? 0) > 0;
}

async function pendingSuggestion(ctx: OperationContext, suggestionId: string): Promise<AiSuggestion> {
  const suggestion = await findSuggestion(ctx.store.id, suggestionId);
  if (!suggestion) throw new OperationError("not_found", "That suggestion is not in this store.");
  if (suggestion.status !== "pending") {
    throw new OperationError("conflict", `That suggestion was already ${suggestion.status}.`);
  }
  return suggestion;
}

/**
 * Applying a suggestion is always an explicit, audited decision. A product
 * idea is imported as a draft; a description, tags or price is written to its
 * product. A supplier recommendation is recorded as accepted and changes
 * nothing else.
 */
export async function applyAssistantSuggestion(
  ctx: OperationContext,
  suggestionId: string,
): Promise<{ suggestion: AiSuggestion; productId: string | null }> {
  const { store, actor } = ctx;
  const storeId = store.id;
  const suggestion = await pendingSuggestion(ctx, suggestionId);

  // Claimed before anything is written, so two applies at once write once.
  if (!(await decide(ctx, suggestion.id, "applied"))) {
    throw new OperationError("conflict", "That suggestion was already decided.");
  }

  let summary = `Applied AI suggestion “${suggestion.title}”`;
  let productId: string | null = null;
  try {
    if (suggestion.kind === "product_idea") {
      const catalogId = String(suggestion.payload.catalogId ?? "");
      const catalog = await getCatalogProduct(catalogId);
      if (catalog) {
        const { product: created } = await copyCatalogProductIntoStore(store, catalogId, actor);
        const price = Number(suggestion.payload.suggestedPriceMajor ?? 0);
        const patch: Record<string, unknown> = {
          name: String(suggestion.payload.name ?? created.name),
          description: String(suggestion.payload.description ?? created.description),
          tags: Array.isArray(suggestion.payload.tags) ? (suggestion.payload.tags as string[]) : created.tags,
        };
        if (price > 0) patch.price = Math.round(price * minorFactor(created.currency));

        // The record that was just written is already in hand, so the costs are
        // recalculated from it and everything lands in a single write instead of
        // update, read back, update again.
        const updated = { ...created, ...(patch as Partial<StoreProduct>) };
        const bracket = updated.taxBracketId ? await getTaxBracket(updated.taxBracketId) : null;
        await updateStoreProduct(created.id, {
          ...(patch as Partial<StoreProduct>),
          costs: breakdownFor(updated, catalog, bracket, store.pricesIncludeTax),
        });
        productId = created.id;
        // History links the product the idea became.
        await db.updateOne(
          COLLECTIONS.suggestions,
          { id: suggestion.id },
          { $set: { productId: created.id, productName: String(patch.name) } },
        );
        summary = `Applied AI product idea “${suggestion.title}”: imported ${catalog.name} as a draft`;
      }
    } else if (suggestion.productId) {
      const product = await getStoreProduct(suggestion.productId);
      if (product && product.storeId === storeId) {
        productId = product.id;
        if (suggestion.kind === "description") {
          await updateStoreProduct(product.id, { description: String(suggestion.payload.description ?? "") });
          summary = `Applied the AI description to “${product.name}”`;
        } else if (suggestion.kind === "tags") {
          const tags = Array.isArray(suggestion.payload.tags) ? (suggestion.payload.tags as string[]) : [];
          await updateStoreProduct(product.id, { tags });
          summary = `Applied ${tags.length} AI tags to “${product.name}”`;
        } else if (suggestion.kind === "price") {
          const major = Number(suggestion.payload.priceMajor ?? 0);
          if (major > 0) {
            const price = Math.round(major * minorFactor(product.currency));
            const catalog = await getCatalogProduct(product.catalogProductId);
            const bracket = product.taxBracketId ? await getTaxBracket(product.taxBracketId) : null;
            const costs = breakdownFor({ ...product, price }, catalog, bracket, store.pricesIncludeTax);
            await updateStoreProduct(product.id, { price, costs });
            summary = `Applied the AI price ${formatMoney(price, product.currency)} to “${product.name}” (was ${formatMoney(product.price, product.currency)})`;
          }
        }
        revalidatePath(`/app/stores/${storeId}/catalog/${product.id}`);
      }
    }
  } catch (error) {
    // Nothing was applied, so the suggestion goes back to waiting for a decision.
    await decide(ctx, suggestion.id, "pending");
    throw error;
  }

  recordAudit({
    category: "ai",
    action: "ai.suggestion_applied",
    summary,
    storeId,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "ai_suggestion",
    entityId: suggestion.id,
    meta: { kind: suggestion.kind },
  });

  revalidatePath(`/app/stores/${storeId}/assistant`);
  revalidatePath(`/app/stores/${storeId}/catalog`);
  return { suggestion: (await getSuggestion(suggestion.id)) ?? suggestion, productId };
}

export async function dismissAssistantSuggestion(ctx: OperationContext, suggestionId: string): Promise<AiSuggestion> {
  const { store, actor } = ctx;
  const suggestion = await pendingSuggestion(ctx, suggestionId);
  if (!(await decide(ctx, suggestion.id, "dismissed"))) {
    throw new OperationError("conflict", "That suggestion was already decided.");
  }
  recordAudit({
    category: "ai",
    action: "ai.suggestion_dismissed",
    summary: `Dismissed AI suggestion “${suggestion.title}”`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "ai_suggestion",
    entityId: suggestion.id,
    meta: { kind: suggestion.kind },
  });
  revalidatePath(`/app/stores/${store.id}/assistant`);
  return (await getSuggestion(suggestion.id)) ?? suggestion;
}

/**
 * Dismisses a product's superseded suggestions in one step. Only suggestions
 * still pending and superseded are dismissed, and when `only` is given, only
 * those of them the caller saw, so a suggestion that arrived since is kept.
 * Running it again dismisses nothing more.
 */
export async function dismissOlderSuggestions(
  ctx: OperationContext,
  productId: string,
  only?: string[],
): Promise<AiSuggestion[]> {
  const { store, actor } = ctx;
  const product = await storeProduct(ctx, productId);
  const pending = await db.find<AiSuggestion>(COLLECTIONS.suggestions, {
    storeId: store.id,
    productId: product.id,
    status: "pending",
  });
  const ids = supersededIds(pending, only);
  const dismissed: string[] = [];
  for (const id of ids) {
    if (await decide(ctx, id, "dismissed")) dismissed.push(id);
  }
  if (dismissed.length) {
    recordAudit({
      category: "ai",
      action: "ai.suggestions_dismissed_older",
      summary: `Dismissed ${dismissed.length} older AI suggestions for “${product.name}”`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: actor.id,
      actorName: actor.name,
      entity: "store_product",
      entityId: product.id,
      meta: { count: dismissed.length, suggestionIds: dismissed.join(",") },
    });
  }
  revalidatePath(`/app/stores/${store.id}/assistant`);
  return pending
    .filter((s) => dismissed.includes(s.id))
    .map((s) => ({ ...s, status: "dismissed" as const, decidedBy: actor.name, decidedAt: new Date().toISOString() }));
}
