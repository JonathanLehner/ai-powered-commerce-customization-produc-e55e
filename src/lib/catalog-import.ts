import "server-only";
import { COLLECTIONS, getCatalogProduct, getTaxBracket, listStoreProducts, recordAudit } from "./data";
import { db } from "./platform";
import { breakdownFor } from "./pricing";
import { baseStoreSku, nextFreeName, nextFreeSku, storeSku } from "./sku";
import type { Store, StoreProduct, StoreVariant, User } from "./types";
import { newId, slugify } from "./util";

export interface CopyResult {
  product: StoreProduct;
  /** 1 for the first copy of this supplier product, 2 for the next, and so on. */
  copyNumber: number;
}

/**
 * Copies a shared-catalog product into a store as an independent draft.
 * The shared record is never mutated — this is a copy, not a reference.
 *
 * A store may hold several copies of the same supplier product, so the new
 * record is given a name, slug and SKU that no other product in the store has:
 * two rows called "Organic Cotton Tee" with identical prices are impossible to
 * tell apart once the page is closed.
 */
export async function copyCatalogProductIntoStore(
  store: Store,
  catalogId: string,
  actor: User,
  importKey: string | null = null,
): Promise<CopyResult> {
  const [catalog, existing] = await Promise.all([getCatalogProduct(catalogId), listStoreProducts(store.id)]);
  if (!catalog) throw new Error("That catalog product no longer exists.");

  const copyNumber = existing.filter((p) => p.catalogProductId === catalog.id).length + 1;
  const name = nextFreeName(
    catalog.name,
    existing.map((p) => p.name),
  );
  const sku = nextFreeSku(
    baseStoreSku(store.channelCode, catalog.name),
    existing.map((p) => storeSku(p, store.channelCode)),
  );

  let slug = slugify(name);
  if (existing.some((p) => p.slug === slug)) slug = `${slug}-${newId("x").slice(2, 5)}`;

  const variants: StoreVariant[] = catalog.variants.map((v) => ({
    id: newId("svar"),
    catalogVariantId: v.id,
    name: v.name,
    colour: v.colour,
    colourHex: v.colourHex,
    size: v.size,
    sku: `${store.channelCode.slice(0, 6).toUpperCase()}-${v.sku}`,
    baseCost: v.baseCost,
    price: Math.round(v.baseCost * 2.6),
    enabled: true,
    availability: v.availability,
  }));

  const suggestedPrice = Math.round(Math.min(...variants.map((v) => v.baseCost)) * 2.6);
  const bracket = store.defaultTaxBracketId ? await getTaxBracket(store.defaultTaxBracketId) : null;
  const now = new Date().toISOString();

  const product: StoreProduct = {
    id: newId("prd"),
    storeId: store.id,
    catalogProductId: catalog.id,
    supplierId: catalog.supplierId,
    name,
    slug,
    sku,
    description: catalog.description,
    tags: [catalog.category, catalog.productType.split(",")[0].toLowerCase()],
    category: catalog.category,
    status: "draft",
    visibility: "public",
    price: suggestedPrice,
    currency: store.defaultCurrency,
    taxBracketId: store.defaultTaxBracketId,
    variants,
    artworks: [],
    mockups: [],
    shopperCustomization: {
      artworkUpload: false,
      textLine: false,
      textLabel: "Personalisation",
      maxTextLength: 18,
    },
    costs: {
      supplierCost: Math.min(...variants.map((v) => v.baseCost)),
      customizationCost: 0,
      shippingEstimate: catalog.shippingEstimate,
      taxBracketId: store.defaultTaxBracketId,
      taxRate: bracket?.rate ?? 0,
      taxAmount: 0,
      sellingPrice: suggestedPrice,
      marginAmount: 0,
      marginPct: 0,
      currency: store.defaultCurrency,
    },
    importedBy: actor.name,
    importedAt: now,
    importKey,
    updatedAt: now,
    publishedAt: null,
  };
  product.costs = breakdownFor(product, catalog, bracket, store.pricesIncludeTax);

  await db.insertOne(COLLECTIONS.storeProducts, product as unknown as Record<string, unknown>);
  recordAudit({
    category: "product_import",
    action: "product.imported",
    summary:
      copyNumber > 1
        ? `Imported “${catalog.name}” from the shared catalog as “${name}” (copy ${copyNumber})`
        : `Imported “${catalog.name}” from the shared catalog`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "store_product",
    entityId: product.id,
    meta: { catalogId: catalog.id, supplier: catalog.supplierId, sku, copyNumber },
  });

  return { product, copyNumber };
}
