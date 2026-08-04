import "server-only";

/**
 * What a gift campaign costs, and the orders it becomes.
 *
 * Each recipient is a parcel of their own: their own address, their own
 * shipping charge and their own tax, worked out with the same helpers the
 * basket uses so a gifted hoodie is priced exactly like a bought one. Prices
 * are re-read from the live product at quote time, because a list approved on
 * Monday may be paid for on Friday.
 */

import { getStoreProduct, getTaxBracket } from "./data";
import { convert, parcelShipping, taxRowsFor, type TaxRow } from "./pricing";
import type { CampaignRecipient, GiftCatalogue, Store, StoreProduct } from "./types";
import type { GiftProductOption } from "./gift-recipients";
import { storeSku } from "./sku";

/** The most recipients one campaign may carry. */
export const MAX_RECIPIENTS = 100;
/** The most units one recipient may be sent. */
export const MAX_PER_RECIPIENT = 10;

export interface CampaignLine {
  recipient: CampaignRecipient;
  /** Live unit price in the campaign currency. */
  unit: number;
  goods: number;
  shipping: number;
  taxRows: TaxRow[];
  taxAmount: number;
  total: number;
  product: StoreProduct | null;
  /** Set when the recipient can no longer be ordered as listed. */
  problem: string | null;
}

export interface CampaignQuote {
  lines: CampaignLine[];
  subtotal: number;
  shipping: number;
  taxRows: TaxRow[];
  taxAmount: number;
  total: number;
  currency: string;
  /** Recipients that cannot be ordered — a product pulled from sale, a price over the limit. */
  problems: { recipient: CampaignRecipient; problem: string }[];
}

/**
 * Prices a recipient list against the store as it stands right now.
 *
 * `spendLimit` is re-checked here as well as at parse time: a price rise between
 * approval and payment must not quietly push a gift over the company's limit.
 */
export async function quoteCampaign(
  store: Store,
  recipients: CampaignRecipient[],
  currency: string,
  spendLimit: number,
): Promise<CampaignQuote> {
  const productIds = [...new Set(recipients.map((r) => r.storeProductId).filter(Boolean))];
  const loaded = await Promise.all(productIds.map((id) => getStoreProduct(id)));
  const products = new Map(productIds.map((id, index) => [id, loaded[index]]));

  const bracketIds = [
    ...new Set(loaded.map((product) => product?.taxBracketId).filter(Boolean)),
  ] as string[];
  const brackets = new Map(
    await Promise.all(bracketIds.map(async (id) => [id, (await getTaxBracket(id))?.rate ?? 0] as const)),
  );

  const lines: CampaignLine[] = recipients.map((recipient) => {
    const product = products.get(recipient.storeProductId) ?? null;
    const variant = product?.variants.find((v) => v.id === recipient.variantId) ?? null;
    let problem: string | null = null;

    if (!product || product.storeId !== store.id) {
      problem = `${recipient.productName} is no longer in this store's catalogue.`;
    } else if (!variant || !variant.enabled) {
      problem = `${recipient.productName} in ${recipient.size || "that option"} is no longer available.`;
    } else if (variant.availability === "out_of_stock") {
      problem = `${recipient.productName} in ${recipient.size || "that option"} is out of stock.`;
    }

    const unit = variant && product ? convert(variant.price, product.currency, currency) : recipient.unitPrice;
    const goods = unit * recipient.quantity;
    if (!problem && spendLimit > 0 && goods > spendLimit) {
      problem = `${recipient.name} is now over the spend limit for one recipient.`;
    }

    const shipping = parcelShipping([recipient.productName], currency);
    const taxRows = taxRowsFor(
      [{ amount: goods, rate: brackets.get(product?.taxBracketId ?? "") ?? 0 }],
      shipping,
      store.pricesIncludeTax,
    );
    const taxAmount = taxRows.reduce((sum, row) => sum + row.amount, 0);

    return {
      recipient,
      unit,
      goods,
      shipping,
      taxRows,
      taxAmount,
      total: store.pricesIncludeTax ? goods + shipping : goods + shipping + taxAmount,
      product,
      problem,
    };
  });

  const byRate = new Map<number, number>();
  for (const line of lines) {
    for (const row of line.taxRows) byRate.set(row.rate, (byRate.get(row.rate) ?? 0) + row.amount);
  }
  const taxRows = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, amount]) => ({ rate, amount }));

  const subtotal = lines.reduce((sum, line) => sum + line.goods, 0);
  const shipping = lines.reduce((sum, line) => sum + line.shipping, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);

  return {
    lines,
    subtotal,
    shipping,
    taxRows,
    taxAmount,
    total: lines.reduce((sum, line) => sum + line.total, 0),
    currency,
    problems: lines
      .filter((line) => line.problem)
      .map((line) => ({ recipient: line.recipient, problem: line.problem as string })),
  };
}

/** The catalogue's products, shaped for the list parser and the portal grid. */
export function giftProductOptions(
  catalogue: GiftCatalogue,
  published: StoreProduct[],
  channelCode: string,
): GiftProductOption[] {
  const chosen = new Set(catalogue.productIds);
  return published
    .filter((product) => chosen.has(product.id))
    .map((product) => ({
      id: product.id,
      name: product.name,
      sku: storeSku(product, channelCode),
      currency: product.currency,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        size: variant.size,
        colour: variant.colour,
        price: variant.price,
        enabled: variant.enabled,
        availability: variant.availability,
      })),
    }));
}

/** `CMP-4831` — the code a campaign is known by on both sides of the platform. */
export function campaignCode(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return `CMP-${Array.from(bytes)
    .map((b) => b.toString(10).padStart(3, "0"))
    .join("")
    .slice(0, 5)}`;
}
