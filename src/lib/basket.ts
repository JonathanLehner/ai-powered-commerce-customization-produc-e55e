import { getStoreProduct, getTaxBracket } from "./data";
import { convert, taxRowsFor, type TaxRow } from "./pricing";
import type { CartItem, Store, StoreProduct } from "./types";

export interface BasketTotals {
  /** The store product behind each cart item, in cart order. */
  products: (StoreProduct | null)[];
  lines: { item: CartItem; unit: number }[];
  subtotal: number;
  shipping: number;
  /** One row per distinct tax rate in the basket, highest rate first. */
  taxRows: TaxRow[];
  taxAmount: number;
  total: number;
}

/**
 * The single place basket money is worked out. The basket page, the checkout
 * page and the order that gets charged all read these numbers, so what the
 * shopper is shown is what they pay and what the store records.
 */
export async function basketTotals(store: Store, items: CartItem[], currency: string): Promise<BasketTotals> {
  const products = await Promise.all(items.map((i) => getStoreProduct(i.storeProductId)));
  const bracketIds = [...new Set(products.map((p) => p?.taxBracketId).filter(Boolean))] as string[];
  const brackets = new Map(
    await Promise.all(bracketIds.map(async (id) => [id, (await getTaxBracket(id))?.rate ?? 0] as const)),
  );

  const lines = items.map((item, index) => ({
    item,
    unit: convert(item.unitPrice, products[index]?.currency ?? store.defaultCurrency, currency),
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.unit * line.item.quantity, 0);
  const shipping = items.length
    ? convert(items.some((i) => i.productName.toLowerCase().includes("mug")) ? 690 : 590, "USD", currency)
    : 0;

  const taxRows = taxRowsFor(
    lines.map((line, index) => ({
      amount: line.unit * line.item.quantity,
      // A published product always has a bracket, so this only falls back to
      // zero for a product pulled from sale mid-basket.
      rate: brackets.get(products[index]?.taxBracketId ?? "") ?? 0,
    })),
    shipping,
    store.pricesIncludeTax,
  );
  const taxAmount = taxRows.reduce((sum, row) => sum + row.amount, 0);
  const total = store.pricesIncludeTax ? subtotal + shipping : subtotal + shipping + taxAmount;

  return { products, lines, subtotal, shipping, taxRows, taxAmount, total };
}
