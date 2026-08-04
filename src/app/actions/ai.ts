"use server";

import { revalidatePath } from "next/cache";
import { suggestCopy, suggestPrice, suggestProductIdeas, suggestSupplier, type DraftSuggestion } from "@/lib/ai";
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
} from "@/lib/data";
import { copyCatalogProductIntoStore } from "@/lib/catalog-import";
import { db } from "@/lib/platform";
import { breakdownFor } from "@/lib/pricing";
import { assertStoreAccess } from "@/lib/session";
import type { AiSuggestion, StoreProduct } from "@/lib/types";
import { formatMoney, minorFactor, newId } from "@/lib/util";
import type { ActionState } from "./stores";

async function store(storeId: string, drafts: DraftSuggestion[], productId: string | null, actorName: string) {
  const now = new Date().toISOString();
  const docs: AiSuggestion[] = drafts.map((draft) => ({
    id: newId("sug"),
    storeId,
    productId,
    kind: draft.kind,
    title: draft.title,
    rationale: draft.rationale,
    payload: draft.payload,
    status: "pending",
    createdBy: actorName,
    createdAt: now,
    decidedBy: null,
    decidedAt: null,
  }));
  if (docs.length) {
    await db.insertMany(COLLECTIONS.suggestions, docs as unknown as Record<string, unknown>[]);
  }
  return docs.length;
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not valid JSON")) {
    return "The assistant replied in an unexpected format. Try again — nothing was applied.";
  }
  return `The assistant could not complete that request: ${message}`;
}

export async function requestProductIdeas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const brief = String(formData.get("brief") ?? "").trim();
  const { user, store: storeDoc } = await assertStoreAccess(storeId, "store.catalog");

  try {
    const [catalog, existing, suppliers] = await Promise.all([
      listCatalogProducts(),
      listStoreProducts(storeId),
      listSuppliers(),
    ]);
    const approved = new Set(suppliers.filter((s) => s.status === "approved").map((s) => s.id));
    const available = catalog.filter((c) => c.status === "active" && approved.has(c.supplierId));
    const drafts = await suggestProductIdeas(storeDoc, available, existing, brief);
    const valid = drafts.filter((d) => available.some((c) => c.id === d.payload.catalogId));
    if (valid.length === 0) {
      return { status: "error", message: "The assistant did not return any product that maps to the approved catalog. Try a more specific brief." };
    }
    const count = await store(storeId, valid, null, user.name);
    revalidatePath(`/app/stores/${storeId}/assistant`);
    return {
      status: "success",
      message: `${count} product idea${count === 1 ? "" : "s"} drafted. Nothing has been created — review each one and apply the ones you want.`,
    };
  } catch (error) {
    return { status: "error", message: friendly(error) };
  }
}

export async function requestCopy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store: storeDoc } = await assertStoreAccess(storeId, "store.catalog");
  const product = await getStoreProduct(productId);
  if (!product || product.storeId !== storeId) {
    return { status: "error", message: "Choose a product in this store first.", field: "productId" };
  }

  try {
    const { description, tags } = await suggestCopy(product, storeDoc);
    await store(storeId, [description, tags], productId, user.name);
    revalidatePath(`/app/stores/${storeId}/assistant`);
    return {
      status: "success",
      message: `Drafted a description and tags for “${product.name}”. Review them below before applying.`,
    };
  } catch (error) {
    return { status: "error", message: friendly(error) };
  }
}

export async function requestPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store: storeDoc } = await assertStoreAccess(storeId, "store.catalog");
  const product = await getStoreProduct(productId);
  if (!product || product.storeId !== storeId) {
    return { status: "error", message: "Choose a product in this store first.", field: "productId" };
  }

  try {
    const landed = product.costs.supplierCost + product.costs.customizationCost + product.costs.shippingEstimate;
    const draft = await suggestPrice(product, storeDoc, landed);
    await store(storeId, [draft], productId, user.name);
    revalidatePath(`/app/stores/${storeId}/assistant`);
    return { status: "success", message: `Price suggestion drafted for “${product.name}”.` };
  } catch (error) {
    return { status: "error", message: friendly(error) };
  }
}

export async function requestSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const destination = String(formData.get("destination") ?? "North America");
  const { user } = await assertStoreAccess(storeId, "store.catalog");

  const catalog = await getCatalogProduct(catalogId);
  if (!catalog) return { status: "error", message: "Choose a supplier product to compare.", field: "catalogId" };

  try {
    const suppliers = (await listSuppliers()).filter((s) => s.status === "approved");
    const draft = await suggestSupplier(catalog, suppliers, destination);
    await store(storeId, [draft], null, user.name);
    revalidatePath(`/app/stores/${storeId}/assistant`);
    return { status: "success", message: `Supplier recommendation drafted for ${catalog.name}.` };
  } catch (error) {
    return { status: "error", message: friendly(error) };
  }
}

/** Applying a suggestion is always an explicit, audited human decision. */
export async function applySuggestion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const { user, store: storeDoc } = await assertStoreAccess(storeId, "store.catalog");

  const suggestion = await getSuggestion(suggestionId);
  if (!suggestion || suggestion.storeId !== storeId || suggestion.status !== "pending") return;

  let summary = `Applied AI suggestion “${suggestion.title}”`;

  if (suggestion.kind === "product_idea") {
    const catalogId = String(suggestion.payload.catalogId ?? "");
    const catalog = await getCatalogProduct(catalogId);
    if (catalog) {
      const { product: created } = await copyCatalogProductIntoStore(storeDoc, catalogId, user);
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
        costs: breakdownFor(updated, catalog, bracket, storeDoc.pricesIncludeTax),
      });
      summary = `Applied AI product idea “${suggestion.title}” — imported ${catalog.name} as a draft product`;
    }
  } else if (suggestion.productId) {
    const product = await getStoreProduct(suggestion.productId);
    if (product && product.storeId === storeId) {
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
          const costs = breakdownFor({ ...product, price }, catalog, bracket, storeDoc.pricesIncludeTax);
          await updateStoreProduct(product.id, { price, costs });
          summary = `Applied the AI price ${formatMoney(price, product.currency)} to “${product.name}” (was ${formatMoney(product.price, product.currency)})`;
        }
      }
      revalidatePath(`/app/stores/${storeId}/catalog/${product.id}`);
    }
  }

  await db.updateOne(
    COLLECTIONS.suggestions,
    { id: suggestionId },
    { $set: { status: "applied", decidedBy: user.name, decidedAt: new Date().toISOString() } },
  );
  recordAudit({
    category: "ai",
    action: "ai.suggestion_applied",
    summary,
    storeId,
    agencyId: storeDoc.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "ai_suggestion",
    entityId: suggestionId,
    meta: { kind: suggestion.kind },
  });

  revalidatePath(`/app/stores/${storeId}/assistant`);
  revalidatePath(`/app/stores/${storeId}/catalog`);
}

export async function dismissSuggestion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const { user, store: storeDoc } = await assertStoreAccess(storeId, "store.catalog");

  const suggestion = await getSuggestion(suggestionId);
  if (!suggestion || suggestion.storeId !== storeId || suggestion.status !== "pending") return;

  await db.updateOne(
    COLLECTIONS.suggestions,
    { id: suggestionId },
    { $set: { status: "dismissed", decidedBy: user.name, decidedAt: new Date().toISOString() } },
  );
  recordAudit({
    category: "ai",
    action: "ai.suggestion_dismissed",
    summary: `Dismissed AI suggestion “${suggestion.title}”`,
    storeId,
    agencyId: storeDoc.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "ai_suggestion",
    entityId: suggestionId,
    meta: { kind: suggestion.kind },
  });
  revalidatePath(`/app/stores/${storeId}/assistant`);
}
