import "server-only";
import { aiJson } from "./platform";
import type { CatalogProduct, Store, StoreProduct, Supplier, SuggestionKind } from "./types";
import { formatMoney, toMajorString } from "./util";

export interface DraftSuggestion {
  kind: SuggestionKind;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
}

const HOUSE_STYLE =
  "You are the commerce assistant inside Parcelith, a platform agencies use to run branded merch stores. " +
  "Write in plain British-neutral English, concrete and free of hype. Never invent supplier names, prices or product " +
  "specifications that were not supplied to you.";

/** Product ideas grounded in the shared supplier catalog. */
export async function suggestProductIdeas(
  store: Store,
  catalog: CatalogProduct[],
  existing: StoreProduct[],
  brief: string,
): Promise<DraftSuggestion[]> {
  const catalogSummary = catalog
    .map(
      (c) =>
        `- id: ${c.id} | ${c.name} (${c.productType}) | base cost ${toMajorString(c.baseCost, c.currency)} ${c.currency} | print areas: ${c.printAreas
          .map((p) => p.name)
          .join(", ")}`,
    )
    .join("\n");

  const prompt = `${HOUSE_STYLE}

Store: "${store.name}" for client ${store.clientName}. Selling currency ${store.defaultCurrency}.
Products already in this store: ${existing.length ? existing.map((p) => p.name).join(", ") : "none yet"}.
Brief from the store manager: ${brief || "General merchandise range that suits this client."}

Shared supplier catalog available for import:
${catalogSummary}

Propose exactly 3 products this store should launch. Each must map to one catalogId from the list above.
Return JSON: {"ideas":[{"catalogId":"...","name":"...","angle":"one sentence on who buys it and why","description":"2 sentences of storefront copy","tags":["..."],"suggestedPriceMajor":24.00}]}
suggestedPriceMajor is in ${store.defaultCurrency} and must leave a healthy margin over base cost.`;

  const result = await aiJson<{
    ideas: {
      catalogId: string;
      name: string;
      angle: string;
      description: string;
      tags: string[];
      suggestedPriceMajor: number;
    }[];
  }>(prompt);

  return (result.ideas ?? []).slice(0, 3).map((idea) => ({
    kind: "product_idea" as const,
    title: idea.name,
    rationale: idea.angle,
    payload: {
      catalogId: idea.catalogId,
      name: idea.name,
      description: idea.description,
      tags: idea.tags ?? [],
      suggestedPriceMajor: idea.suggestedPriceMajor,
    },
  }));
}

export async function suggestSupplier(
  product: CatalogProduct,
  suppliers: Supplier[],
  destination: string,
): Promise<DraftSuggestion> {
  const list = suppliers
    .map(
      (s) =>
        `- id: ${s.id} | ${s.name} (${s.kind}, ${s.integration} integration) | regions: ${s.regions.join(", ")} | lead time ${s.leadTimeDays[0]}-${s.leadTimeDays[1]} days | order API: ${s.capabilities.orderSubmission ? "yes" : "no"} | tracking: ${s.capabilities.tracking ? "yes" : "no"}`,
    )
    .join("\n");

  const prompt = `${HOUSE_STYLE}

Choose the best production partner for "${product.name}" shipping mainly to ${destination}.
Approved suppliers:
${list}

Return JSON: {"supplierId":"...","supplierName":"...","reason":"2 sentences comparing it to the runner-up","risk":"one sentence on the main trade-off"}`;

  const result = await aiJson<{ supplierId: string; supplierName: string; reason: string; risk: string }>(prompt);
  return {
    kind: "supplier",
    title: `Produce with ${result.supplierName}`,
    rationale: result.reason,
    payload: { supplierId: result.supplierId, supplierName: result.supplierName, risk: result.risk },
  };
}

export async function suggestCopy(
  product: StoreProduct,
  store: Store,
): Promise<{ description: DraftSuggestion; tags: DraftSuggestion }> {
  const prompt = `${HOUSE_STYLE}

Write storefront copy for "${product.name}" (${product.category}) sold by ${store.clientName} in the "${store.name}" store.
Current description: ${product.description || "(none yet)"}
Available variants: ${product.variants.map((v) => `${v.colour} ${v.size}`).join(", ")}

Return JSON: {"description":"90-130 words, two short paragraphs separated by a blank line","tags":["6 lowercase search tags"]}`;

  const result = await aiJson<{ description: string; tags: string[] }>(prompt);
  return {
    description: {
      kind: "description",
      title: "Rewritten product description",
      rationale: "Grounded in the variants and category currently configured on this product.",
      payload: { description: result.description },
    },
    tags: {
      kind: "tags",
      title: `${(result.tags ?? []).length} suggested tags`,
      rationale: "Search and merchandising tags derived from the product's category and colourways.",
      payload: { tags: result.tags ?? [] },
    },
  };
}

export async function suggestPrice(
  product: StoreProduct,
  store: Store,
  landedCost: number,
): Promise<DraftSuggestion> {
  const prompt = `${HOUSE_STYLE}

Recommend a retail price for "${product.name}" (${product.category}).
Landed cost per unit (supplier + customisation + shipping): ${formatMoney(landedCost, product.currency)}.
Current price: ${formatMoney(product.price, product.currency)}. Store currency: ${store.defaultCurrency}.

Return JSON: {"priceMajor": 29.00, "reason":"2 sentences referencing margin and comparable market pricing"}`;

  const result = await aiJson<{ priceMajor: number; reason: string }>(prompt);
  return {
    kind: "price",
    title: `Set price to ${result.priceMajor} ${product.currency}`,
    rationale: result.reason,
    payload: { priceMajor: result.priceMajor },
  };
}
