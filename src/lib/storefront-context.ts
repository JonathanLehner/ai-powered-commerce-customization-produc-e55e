import type { StorefrontContext } from "@/components/storefront/kit";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { localizeCollection } from "./collections";
import { resolveDesign } from "./store-design";
import { productCard } from "./storefront-cards";
import { localizeProduct } from "./translations";
import type { ProductCollection, Store, StoreProduct } from "./types";

/**
 * What every section is drawn with: the store, its design, its published
 * products as cards and its collections, in one language. The home page, the
 * draft preview and the editor canvas all build it here, so a section looks
 * the same in all three.
 */
export function storefrontContext(input: {
  store: Store;
  products: StoreProduct[];
  collections: ProductCollection[];
  locale: string;
  defaultLocale: string;
  base: string;
  preview: boolean;
  t: ShopperMessages["sections"];
  /** A product's price, formatted for the shopper. */
  price: (product: StoreProduct) => string;
}): StorefrontContext {
  const { store, locale, defaultLocale } = input;
  return {
    storeId: store.id,
    storeName: store.name,
    clientName: store.clientName,
    base: input.base,
    logoUrl: store.logoUrl,
    design: resolveDesign(store),
    preview: input.preview,
    t: input.t,
    locale,
    products: input.products.map((stored) => productCard(stored, localizeProduct(stored, locale, defaultLocale), input.price(stored))),
    collections: input.collections.map((c) => ({
      id: c.id,
      handle: c.handle,
      productIds: c.productIds,
      name: localizeCollection(c, locale, defaultLocale).name,
      imageUrl: c.imageUrl,
    })),
  };
}
