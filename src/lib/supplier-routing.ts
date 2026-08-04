/**
 * Which suppliers could produce a given order.
 *
 * The rules are pure and live away from the routing engine on purpose: they run
 * against records passed in, so the order detail page, the routing action and
 * the self-check all judge a supplier by exactly the same test.
 */
import type { CatalogProduct, ItemRequirement, Order, StoreProduct, Supplier, SupplierChoice } from "./types";

/**
 * The product family a supplier product belongs to — "t-shirt", "hoodie",
 * "mug". Every supplier writes its own product type ("T-shirt, 180 gsm" against
 * "T-shirt, GOTS certified 180 gsm"), so the part before the first comma is the
 * most two of them making the same thing will ever agree on. Catalog imports
 * already tag products off the same slice.
 */
export function productFamily(productType: string): string {
  return productType.split(",")[0].trim().toLowerCase();
}

/**
 * What the order needs produced, worked out from the shared catalog product
 * each line was imported from. An item whose product or catalog record has gone
 * falls back to its category, and failing that to "anything this supplier
 * makes" — never to a silent match, which would offer a mug printer a hoodie.
 */
export function orderRequirements(
  order: Order,
  storeProducts: StoreProduct[],
  catalog: CatalogProduct[],
): ItemRequirement[] {
  const byKey = new Map<string, ItemRequirement>();
  for (const item of order.items) {
    const product = storeProducts.find((p) => p.id === item.storeProductId) ?? null;
    const source = product ? (catalog.find((c) => c.id === product.catalogProductId) ?? null) : null;
    const family = source ? productFamily(source.productType) : null;
    const category = source?.category ?? product?.category ?? null;
    const label = source ? source.productType.split(",")[0].trim() : item.productName;
    const key = `${family ?? ""}|${category ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, { label, family, category });
  }
  return Array.from(byKey.values());
}

/** The requirements a supplier's catalog cannot cover. Empty means it can make the order. */
export function unmetBy(catalog: CatalogProduct[], requirements: ItemRequirement[]): ItemRequirement[] {
  return requirements.filter(
    (req) =>
      !catalog.some(
        (product) =>
          (req.family === null || productFamily(product.productType) === req.family) &&
          (req.category === null || product.category === req.category),
      ),
  );
}

function toChoice(supplier: Supplier, currentSupplierId: string | null): SupplierChoice {
  return {
    id: supplier.id,
    name: supplier.name,
    kind: supplier.kind,
    leadTimeDays: supplier.leadTimeDays,
    current: supplier.id === currentSupplierId,
  };
}

/**
 * Splits the supplier list into the partners that could take this job and the
 * ones that cover the destination but have to be ordered from by hand. A
 * supplier qualifies only if the platform has approved it, it produces in the
 * destination's region, and its catalog covers everything on the order.
 */
export function routingChoices(input: {
  suppliers: Supplier[];
  catalog: CatalogProduct[];
  requirements: ItemRequirement[];
  region: string;
  currentSupplierId: string | null;
}): { available: SupplierChoice[]; manualOnly: SupplierChoice[] } {
  const available: SupplierChoice[] = [];
  const manualOnly: SupplierChoice[] = [];

  for (const supplier of input.suppliers) {
    if (supplier.status !== "approved") continue;
    if (!supplier.regions.includes(input.region)) continue;
    const theirs = input.catalog.filter((product) => product.supplierId === supplier.id);
    if (unmetBy(theirs, input.requirements).length > 0) continue;

    const choice = toChoice(supplier, input.currentSupplierId);
    if (supplier.integration === "api" && supplier.capabilities.orderSubmission) available.push(choice);
    else manualOnly.push(choice);
  }

  return { available, manualOnly };
}
