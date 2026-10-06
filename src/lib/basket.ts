import { getDiscountCodeByCode, getStoreProductsByIds, getTaxBracket } from "./data";
import { allocateDiscount, checkDiscount, type DiscountRefusal } from "./discounts";
import { convert, parcelShipping, taxRowsFor, type TaxRow } from "./pricing";
import type { Cart, CartItem, DiscountCode, Store, StoreProduct } from "./types";

/**
 * The stored code behind whatever the shopper typed into the basket. Read fresh
 * on every render, so a code switched off in the workspace stops applying to the
 * baskets already holding it.
 */
export async function cartDiscountCode(
  storeId: string,
  cart: Pick<Cart, "discountCode"> | null,
): Promise<DiscountCode | null> {
  if (!cart?.discountCode) return null;
  return (await getDiscountCodeByCode(storeId, cart.discountCode)) ?? null;
}

export interface AppliedDiscount {
  codeId: string;
  code: string;
  kind: DiscountCode["kind"];
  value: number;
  /** Taken off the goods subtotal, in the basket currency. */
  amount: number;
}

export interface BasketTotals {
  /** The store product behind each cart item, in cart order. */
  products: (StoreProduct | null)[];
  lines: { item: CartItem; unit: number }[];
  subtotal: number;
  /** The code that was actually applied, null when there is none or it was refused. */
  discount: AppliedDiscount | null;
  /** Why the code on the basket was not applied, null when it was or there is none. */
  discountRefusal: DiscountRefusal | null;
  /** The basket the refused code needs, in the basket currency. Zero when there is none. */
  discountMinimum: number;
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
 *
 * A discount code is passed in as the stored record and judged here, against
 * this basket, every single time — so a code that expires, is switched off or
 * runs out while it is sitting in someone's basket simply stops applying, and
 * the reason comes back for the page to explain.
 */
export async function basketTotals(
  store: Store,
  items: CartItem[],
  currency: string,
  discountCode: DiscountCode | null = null,
): Promise<BasketTotals> {
  // One read for the whole basket. A read per line meant a fetch per line, and
  // the platform runs only a handful at a time, so a large basket priced itself
  // one wave of lines after another.
  const byId = await getStoreProductsByIds(items.map((i) => i.storeProductId));
  const products = items.map((i) => byId.get(i.storeProductId) ?? null);
  const bracketIds = [...new Set(products.map((p) => p?.taxBracketId).filter(Boolean))] as string[];
  const brackets = new Map(
    await Promise.all(bracketIds.map(async (id) => [id, (await getTaxBracket(id))?.rate ?? 0] as const)),
  );

  const lines = items.map((item, index) => ({
    item,
    unit: convert(item.unitPrice, products[index]?.currency ?? store.defaultCurrency, currency),
  }));
  const lineAmounts = lines.map((line) => line.unit * line.item.quantity);
  const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);
  const shipping = parcelShipping(
    items.map((i) => i.productName),
    currency,
  );

  const verdict = discountCode ? checkDiscount(discountCode, subtotal, currency) : null;
  const applied: AppliedDiscount | null =
    discountCode && verdict && !verdict.refusal
      ? {
          codeId: discountCode.id,
          code: discountCode.code,
          kind: discountCode.kind,
          value: discountCode.value,
          amount: verdict.amount,
        }
      : null;
  // Spread across the lines so each rate is charged on the discounted value of
  // the goods it covers, not on the list price.
  const shares = allocateDiscount(lineAmounts, applied?.amount ?? 0);

  const taxRows = taxRowsFor(
    lines.map((line, index) => ({
      amount: lineAmounts[index] - shares[index],
      // A published product always has a bracket, so this only falls back to
      // zero for a product pulled from sale mid-basket.
      rate: brackets.get(products[index]?.taxBracketId ?? "") ?? 0,
    })),
    shipping,
    store.pricesIncludeTax,
  );
  const taxAmount = taxRows.reduce((sum, row) => sum + row.amount, 0);
  const goods = subtotal - (applied?.amount ?? 0);
  const total = store.pricesIncludeTax ? goods + shipping : goods + shipping + taxAmount;

  return {
    products,
    lines,
    subtotal,
    discount: applied,
    discountRefusal: verdict?.refusal ?? null,
    discountMinimum: verdict?.minimum ?? 0,
    shipping,
    taxRows,
    taxAmount,
    total,
  };
}
