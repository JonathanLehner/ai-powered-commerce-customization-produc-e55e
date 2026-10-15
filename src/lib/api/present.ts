import { storeLanguages } from "@/i18n/storefront-routing";
import { storeUrl } from "../seo";
import { storeSku } from "../sku";
import { isQuoteOnly } from "../sourcing";
import { storeSupport } from "../support";
import { contentPath } from "../content";
import type {
  CatalogProduct,
  ContentEntry,
  GiftCard,
  Order,
  ProductCollection,
  ProductReview,
  ShippingZone,
  Store,
  StoreProduct,
} from "../types";

/**
 * Records as the API returns them. The keys that make a resubmitted form land
 * once are bookkeeping, and a store's payment account belongs to its
 * administrators, so neither goes out.
 */

export function presentStore(store: Store) {
  const { locales, defaultLocale } = storeLanguages(store);
  const support = storeSupport(store);
  return {
    id: store.id,
    name: store.name,
    clientName: store.clientName,
    slug: store.slug,
    status: store.status,
    storefrontUrl: storeUrl(store, defaultLocale),
    customDomain: store.customDomain,
    domainStatus: store.domainStatus,
    theme: store.theme,
    logoUrl: store.logoUrl,
    defaultLanguage: defaultLocale,
    languages: locales,
    defaultCurrency: store.defaultCurrency,
    currencies: store.currencies,
    pricesIncludeTax: store.pricesIncludeTax,
    supportEmail: support.email,
    supportPhone: support.phone,
    paymentsEnabled: store.stripe.chargesEnabled,
    setup: store.setup,
    createdAt: store.createdAt,
  };
}

export function presentProduct(product: StoreProduct, store: Pick<Store, "channelCode">) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { importKey: _importKey, ...rest } = product;
  return { ...rest, sku: storeSku(product, store.channelCode) };
}

export function presentCatalogProduct(product: CatalogProduct) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    productType: product.productType,
    description: product.description,
    currency: product.currency,
    baseCost: product.baseCost,
    customizationCostPerArea: product.customizationCostPerArea,
    shippingEstimate: product.shippingEstimate,
    leadTimeDays: product.leadTimeDays,
    fulfillmentRegions: product.fulfillmentRegions,
    availability: product.availability,
    quoteOnly: isQuoteOnly(product),
    printAreas: product.printAreas.map((area) => ({ id: area.id, name: area.name, view: area.view })),
    variants: product.variants,
  };
}

export function presentCollection(collection: ProductCollection) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { submissionKey: _submissionKey, ...rest } = collection;
  return rest;
}

export function presentOrder(order: Order) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { idempotencyKey: _idempotencyKey, cartId: _cartId, ...rest } = order;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { checkoutUrl: _checkoutUrl, stripeAccountId: _stripeAccountId, ...payment } = rest.payment;
  return {
    ...rest,
    test: Boolean(order.test),
    payment,
    refundedTotal: order.refunds.reduce((sum, refund) => sum + refund.amount, 0),
  };
}

export function presentShippingZone(zone: ShippingZone) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { submissionKey: _submissionKey, rates, ...rest } = zone;
  return {
    ...rest,
    rates: rates.map((rate) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { submissionKey: _key, ...plain } = rate;
      return plain;
    }),
  };
}

export function presentContentEntry(entry: ContentEntry) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { submissionKey: _submissionKey, ...rest } = entry;
  return { ...rest, path: contentPath(entry.kind, entry.handle), translations: entry.translations ?? {} };
}

/** A gift card without its code: only the last four characters ever go out after it is issued. */
export function presentGiftCard(card: GiftCard) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { code: _code, submissionKey: _submissionKey, orderItemKey: _orderItemKey, holds, ...rest } = card;
  return { ...rest, held: holds.reduce((sum, hold) => sum + hold.amount, 0) };
}

export function presentReview(review: ProductReview) {
  return review;
}
