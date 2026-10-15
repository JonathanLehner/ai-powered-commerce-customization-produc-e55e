import "server-only";
import { getFormatter } from "next-intl/server";
import { z } from "zod";
import { formatMinorUnits } from "@/i18n/format";
import { shopperTranslator } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { createPublishableKey } from "../../api-keys";
import { isLive } from "../../artwork";
import { basketTotals, cartDiscountCode } from "../../basket";
import { collectionProducts, localizeCollection } from "../../collections";
import { contentPath, entrySummary, localizeEntry } from "../../content";
import { listPublishedContent } from "../../content-data";
import { isCountryCode } from "../../countries";
import { presentmentAmount, presentmentPrice, storeFxTable } from "../../currency";
import {
  COLLECTIONS,
  getCart,
  getCatalogProduct,
  getStoreProduct,
  getStoreProductBySlug,
  getStorefront,
  listProductCollections,
  listPublishedProducts,
  listShippingZones,
} from "../../data";
import { siteOrigin } from "../../email";
import { getGiftCardByCode } from "../../gift-card-data";
import { basketGiftCardCover, giftCardRefusal } from "../../gift-cards";
import { levelsForProducts } from "../../inventory";
import { inventorySettings, levelId, shopperStock } from "../../inventory-rules";
import { db } from "../../mongo";
import { ApiError } from "../auth";
import { readStoredAsset } from "../../operations/artwork";
import { OperationError } from "../../operations/context";
import {
  addCartLine as addLine,
  applyDiscount,
  applyGiftCard,
  attachLinePreview,
  lookupOrder as findOrder,
  openCart,
  placeOrder,
  readPlacement,
  removeCartLine as removeLine,
  removeDiscount,
  removeGiftCard,
  searchShop as search,
  submitReview as recordReview,
  subscribeToNewsletter,
  updateCartLine as updateLine,
  type ShopRefusal,
  type ShopperCopy,
  type ShopperSession,
} from "../../operations/shop";
import {
  deleteAddress,
  requestSignInLink,
  saveAddress,
  setMarketing,
  shopperFromToken,
  signedInShopper,
  type SignedInShopper,
} from "../../operations/shopper-account";
import { paymentMode } from "../../payment-mode";
import { POLICY_KEYS } from "../../policies";
import { productRating } from "../../review-data";
import { REVIEW_LIMITS } from "../../reviews";
import { SEARCH_KINDS, SEARCH_LIMITS } from "../../search";
import { SITE_ORIGIN, storeLinkBase, storeUrl } from "../../seo";
import { EMAIL_DELIVERY_RATE_ID, shippingCountries } from "../../shipping";
import { shipDays } from "../../shipping-promise";
import { storePolicies } from "../../storefront-data";
import { storeSupport } from "../../support";
import { localizeProduct } from "../../translations";
import type { Cart, ContentEntry, Order, StoreProduct } from "../../types";
import { isStoredAsset } from "../../uploads";
import { newId } from "../../util";
import {
  define,
  defineShop,
  idempotencyKey,
  locale,
  notFound,
  offsetPage,
  type ApiOperation,
  type ShopContext,
} from "../define";

/**
 * The Storefront API: what a shopper can do in a store, for headless
 * storefronts and AI shopping agents. Every operation runs the storefront's own
 * code (`src/lib/operations/shop.ts` and `shopper-account.ts`), so the API
 * prices, holds stock, judges codes and takes payment exactly as the
 * storefront does, and refuses in the shopper's language.
 *
 * A cart is identified by the opaque `cartId` createCart returns, which is
 * the cart's session id: knowing it is what opens the cart, so it is never
 * shown to anyone else.
 */

/* ------------------------------------------------------------------ inputs */

const shopLocale = locale.optional().describe("The shopper's language, such as de. Falls back to the store's default language when the store does not offer it. Messages and product names come back in it.");
const currency = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code.")
  .optional()
  .describe("The ISO currency to show prices in, such as EUR. Must be one of the currencies getShop lists; the store's own currency when left out.");
const cartId = z
  .string()
  .regex(/^shp_[a-z0-9]{12}$/, "Use the cartId createCart returned.")
  .describe("The cart token createCart returned. Keep it private: whoever holds it can read and change the cart.");
const lineId = z.string().min(1).describe("The cart line's id, from getCart's lines.");
const customerAccessToken = z
  .string()
  .min(10)
  .describe(
    "The shopper's signed-in session token for this store's storefront (the value of their parcelith-shopper.session-token cookie, issued after they open the emailed sign-in link). May be sent as the X-Customer-Access-Token header instead.",
  );
const handle = (what: string) => z.string().min(1).max(200).describe(`The ${what}'s id or its handle (the address segment, such as field-tee).`);
const shopPaging = {
  limit: z.coerce.number().int().min(1).max(100).default(24).describe("Records per page, 1 to 100."),
  cursor: z.string().optional().describe("The nextCursor of the previous page."),
};

/* ----------------------------------------------------------------- helpers */

/** The shopper copy in the request's language, with absolute storefront links. */
async function copyOf(ctx: ShopContext): Promise<ShopperCopy> {
  const [t, format, origin] = await Promise.all([
    shopperTranslator(ctx.store, ctx.locale),
    getFormatter({ locale: ctx.locale }),
    siteOrigin(),
  ]);
  return { locale: ctx.locale, t, format, base: storeLinkBase(ctx.store, ctx.locale, origin || SITE_ORIGIN) };
}

/** The shared shop operations' view of an API cart: found by its token, in this store only. */
function session(ctx: ShopContext, token: string): ShopperSession {
  return {
    cart: (storeId) => (storeId === ctx.store.id ? getCart(storeId, token) : Promise.resolve(null)),
    copy: () => copyOf(ctx),
    currency: async () => ctx.currency,
    // An API cart is shown by whoever asked for it; no page holds it.
    basketChanged: () => {},
  };
}

/** A refusal from the shared operations, thrown the way the API reports it, with every field to fix when there are several. */
function fail(result: ShopRefusal): never {
  if (result.issues) {
    throw new ApiError(
      422,
      "invalid_request",
      result.issues.map((issue) => `\`${issue.field}\`: ${issue.message}`).join(" "),
      result.field,
      { issues: result.issues },
    );
  }
  throw new OperationError(result.code ?? "invalid", result.message, result.field);
}

/**
 * A rate's delivery estimate in business days. A rate with none set takes the
 * store's "Ships within" days, and with that unset too the estimate is null
 * rather than 0 to 0. Email delivery is immediate, so 0 is its real estimate.
 */
function deliveryDays(rate: { rateId: string; minDays: number; maxDays: number }, shipsWithin: number | null) {
  if (rate.maxDays > 0 || rate.rateId === EMAIL_DELIVERY_RATE_ID) return { minDays: rate.minDays, maxDays: rate.maxDays };
  return shipsWithin ? { minDays: 1, maxDays: shipsWithin } : { minDays: null, maxDays: null };
}

/** The business days the store's published storefront says an order ships within. */
async function storeShipDays(storeId: string): Promise<number | null> {
  return shipDays((await getStorefront(storeId))?.published);
}

async function cartOf(ctx: ShopContext, token: string): Promise<Cart> {
  return (await getCart(ctx.store.id, token)) ?? notFound("Cart");
}

const productUrl = (ctx: ShopContext, slug: string) => storeUrl(ctx.store, ctx.locale, `/products/${encodeURIComponent(slug)}`);

/** A product as a list shows it, in the shopper's language and currency. */
function presentListing(ctx: ShopContext, stored: StoreProduct) {
  const product = localizeProduct(stored, ctx.locale, storeLanguages(ctx.store).defaultLocale);
  const prices = product.variants.filter((v) => v.enabled).map((v) => presentmentPrice(ctx.store, v.price, product.currency, ctx.currency));
  return {
    id: product.id,
    handle: product.slug,
    name: product.name,
    url: productUrl(ctx, product.slug),
    imageUrl: product.mockups[0]?.url ?? null,
    priceFrom: prices.length > 0 ? Math.min(...prices) : presentmentPrice(ctx.store, product.price, product.currency, ctx.currency),
    currency: ctx.currency,
    tags: product.tags,
    giftCard: Boolean(product.giftCard),
    personalisable: product.shopperCustomization.textLine || product.shopperCustomization.artworkUpload,
  };
}

/** Looks a product on sale up by id or slug, with the catalogue record it is made from. */
async function liveProduct(ctx: ShopContext, key: string) {
  const product =
    (await getStoreProductBySlug(ctx.store.id, key)) ??
    (await getStoreProduct(key).then((found) => (found?.storeId === ctx.store.id ? found : null)));
  const catalog = product ? await getCatalogProduct(product.catalogProductId) : null;
  if (!product || !isLive(product, catalog)) notFound("Product");
  return { product, catalog };
}

function presentEntry(ctx: ShopContext, stored: ContentEntry, withBody: boolean) {
  const entry = localizeEntry(stored, ctx.locale, storeLanguages(ctx.store).defaultLocale);
  return {
    id: entry.id,
    kind: entry.kind,
    handle: entry.handle,
    title: entry.title,
    summary: entrySummary(entry, 300),
    url: storeUrl(ctx.store, ctx.locale, contentPath(entry.kind, entry.handle)),
    coverImageUrl: entry.coverImageUrl,
    authorName: entry.kind === "post" ? entry.authorName : null,
    publishedAt: entry.publishedAt,
    ...(withBody ? { bodyHtml: entry.body } : {}),
  };
}

/**
 * The cart priced as checkout prices it: lines, discount, gift card, the
 * shipping rates to `country` and the totals. `country` defaults to where the
 * storefront's basket page prices it.
 */
async function presentCart(ctx: ShopContext, cart: Cart, country?: string, rateId?: string, message?: string) {
  const { store, currency: shown } = ctx;
  const [zones, discountCode, card, copy, shipsWithin] = await Promise.all([
    listShippingZones(store.id),
    cartDiscountCode(store.id, cart),
    cart.giftCardCode ? getGiftCardByCode(store.id, cart.giftCardCode) : null,
    copyOf(ctx),
    storeShipDays(store.id),
  ]);
  const { t, format } = copy;
  const money = (minor: number) => formatMinorUnits(format, minor, shown);
  const shippable = shippingCountries(zones);
  const home = isCountryCode(store.stripe.country) ? store.stripe.country.toUpperCase() : "US";
  const destination = country ?? (zones.length === 0 || shippable.includes(home) ? home : shippable[0]);
  const totals = await basketTotals(store, cart.items, shown, discountCode, undefined, { zones, country: destination, rateId });
  const mode = paymentMode(store);
  const usable = card && !giftCardRefusal(card) ? card : null;
  const cover = usable
    ? basketGiftCardCover(usable, totals, shown, mode === "stripe" ? "stripe" : "demo", storeFxTable(store))
    : null;
  const optionName = (option: { name: string; rateId: string }) =>
    option.name || (option.rateId === EMAIL_DELIVERY_RATE_ID ? t("checkout.emailDelivery") : t("checkout.standardShipping"));
  return {
    cartId: cart.sessionId,
    ...(message ? { message } : {}),
    currency: shown,
    lines: totals.lines.map(({ item, unit }) => ({
      id: item.id,
      productId: item.storeProductId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: unit,
      amount: unit * item.quantity,
      text: item.text,
      artworkUrl: item.artworkUrl,
      artworkPlacement: item.artworkPlacement ?? null,
      previewUrl: item.previewUrl,
    })),
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: totals.subtotal,
    discount: totals.discount ? { code: totals.discount.code, amount: totals.discount.amount } : null,
    discountProblem:
      discountCode && totals.discountRefusal
        ? t(`discount.${totals.discountRefusal}`, { amount: money(totals.discountMinimum) })
        : null,
    giftCard: card
      ? {
          last4: card.last4,
          balance: presentmentAmount(store, card.balance, card.currency, shown),
          usable: Boolean(usable),
          applied: cover?.amount ?? 0,
          coversAll: cover?.coversAll ?? false,
        }
      : null,
    shipping: {
      country: destination,
      shipsTo: shippable,
      digitalOnly: totals.digitalOnly,
      options: totals.options.map((option) => ({
        rateId: option.rateId,
        name: optionName(option),
        amount: option.amount,
        ...deliveryDays(option, shipsWithin),
      })),
      selectedRateId: totals.shippingOption?.rateId ?? null,
      amount: totals.shipping,
    },
    tax: {
      amount: totals.taxAmount,
      includedInPrices: store.pricesIncludeTax,
      calculatedAtPayment: totals.stripeTax,
      unavailableForCountry: totals.taxUnavailable,
    },
    total: totals.total,
    amountDue: totals.total - (cover?.amount ?? 0),
  };
}

/** An order as the shopper who placed it may see it. */
function presentShopperOrder(order: Order, statusUrl: string, shipsWithin: number | null) {
  return {
    code: order.code,
    status: order.status,
    placedAt: order.createdAt,
    currency: order.currency,
    lines: order.items.map((item) => ({
      productId: item.storeProductId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      text: item.customization.text,
    })),
    subtotal: order.subtotal,
    discount: order.discount ? { code: order.discount.code, amount: order.discount.amount } : null,
    giftCard: order.giftCard ? { last4: order.giftCard.last4, amount: order.giftCard.amount } : null,
    shipping: order.shipping,
    shippingRate: order.shippingRate ? { name: order.shippingRate.name, ...deliveryDays(order.shippingRate, shipsWithin) } : null,
    taxAmount: order.taxAmount,
    total: order.total,
    refunded: order.refunds.reduce((sum, refund) => sum + refund.amount, 0),
    tracking: order.fulfillment.trackingNumber
      ? { carrier: order.fulfillment.carrier, number: order.fulfillment.trackingNumber, url: order.fulfillment.trackingUrl }
      : null,
    statusUrl,
  };
}

/** The signed-in shopper the token belongs to, or the refusal the storefront shows a signed-out one. */
async function shopper(ctx: ShopContext, token: string): Promise<SignedInShopper> {
  const found = await signedInShopper(ctx.store, await shopperFromToken(token));
  if (found) return found;
  const t = await shopperTranslator(ctx.store, ctx.locale);
  throw new OperationError("invalid", t("account.signedOut"), "customerAccessToken");
}

function presentAddresses(found: SignedInShopper) {
  return {
    email: found.account.email,
    addresses: found.customer.addresses ?? [],
    marketing: { subscribed: found.customer.marketing?.subscribed ?? false },
  };
}

const ADDRESS_FIELDS = {
  name: z.string().max(200).describe("The recipient's full name."),
  line1: z.string().max(200).describe("Street and number."),
  line2: z.string().max(200).optional().describe("Optional. Flat, suite or building."),
  city: z.string().max(200).describe("Town or city."),
  region: z.string().max(200).optional().describe("State, province or county. Needed for countries that use one (US, CA, AU and others); ignored elsewhere."),
  postalCode: z.string().max(200).describe("Postal or ZIP code."),
  country: z.string().max(2).describe("Two-letter ISO country code, such as DE."),
  phone: z.string().max(200).optional().describe("Optional. A phone number for the carrier."),
};

/* -------------------------------------------------------------- operations */

export const shopOperations: ApiOperation[] = [
  /* -------------------------------------------------- the publishable key */
  define({
    id: "createPublishableKey",
    method: "POST",
    path: "/api-keys/publishable",
    scope: "keys:write",
    tag: "API keys",
    summary: "Create a publishable Storefront API key",
    description:
      "Creates a publishable key for this store's public Storefront API (/api/v1/shop/{storeHandle}) and its shop MCP server, and returns the secret once; it is never shown again. A publishable key holds no Admin scope and is refused by the Admin API: it only raises the Storefront API rate limit above the anonymous one and names the caller. Send it as X-Storefront-Key. Revoke it with revokeApiKey.",
    status: 201,
    input: z.object({
      name: z.string().trim().min(1).max(60).describe("A name to tell the key apart, such as Headless storefront."),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const result = await createPublishableKey(ctx.store, ctx.actor, { name: input.name, submissionKey: input.idempotencyKey ?? null });
      if (result.status === "duplicate") {
        throw new ApiError(409, "conflict", "This key was already created with this idempotencyKey. If its secret was not kept, revoke it and create a new one.", "idempotencyKey");
      }
      const { id, name, last4, createdAt } = result.key;
      return { key: { id, name, last4, publishable: true, createdAt }, secret: result.secret };
    },
  }),

  /* --------------------------------------------------------------- reading */
  defineShop({
    id: "getShop",
    method: "GET",
    path: "/",
    scope: "shop:read",
    summary: "Get the shop",
    description:
      "The store's name and storefront address, the languages and currencies it sells in, where it ships, how it takes payment (stripe: the shopper pays on a Stripe Checkout page; demo: a demonstration store, or one in test mode (testMode true), where test card 4242 4242 4242 4242 is accepted and nobody is charged; unavailable: no orders), its support contacts and its policies (refunds, shipping, terms, privacy) in the shopper's language. Read-only. Call it first to learn which locale and currency values to pass to the other operations, then listShopProducts or searchShop.",
    actions: ["shop#readCurrency", "shop#setCurrency"],
    input: z.object({ locale: shopLocale, currency }),
    run: async (ctx) => {
      const { store, locale: active } = ctx;
      const { locales, defaultLocale } = storeLanguages(store);
      const [zones, policies] = await Promise.all([listShippingZones(store.id), storePolicies(store, active, defaultLocale)]);
      const support = storeSupport(store);
      return {
        id: store.id,
        handle: store.slug,
        name: store.name,
        url: storeUrl(store, active),
        logoUrl: store.logoUrl,
        locale: active,
        defaultLanguage: defaultLocale,
        languages: locales,
        currency: ctx.currency,
        defaultCurrency: store.defaultCurrency,
        currencies: store.currencies,
        pricesIncludeTax: store.pricesIncludeTax,
        shipsTo: shippingCountries(zones),
        shipsEverywhere: zones.length === 0,
        payment: paymentMode(store),
        testMode: Boolean(store.testMode),
        support: { email: support.email, phone: support.phone },
        policies: POLICY_KEYS.filter((key) => policies[key]).map((key) => ({
          kind: key,
          url: storeUrl(store, active, `/policies/${key}`),
          text: policies[key],
        })),
      };
    },
  }),
  defineShop({
    id: "subscribeToNewsletter",
    method: "POST",
    path: "/newsletter",
    scope: "shop:write",
    summary: "Sign up for the store's email",
    description:
      "Signs an email address up for the store's newsletter, as the storefront footer and Email capture section do. Only call it when the shopper asked to. Signing the same address up again changes nothing.",
    actions: ["shop#subscribeNewsletter"],
    input: z.object({
      email: z.string().min(3).max(254).describe("The shopper's email address."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const t = await shopperTranslator(ctx.store, ctx.locale);
      const result = await subscribeToNewsletter(ctx.store, { t, locale: ctx.locale }, { email: input.email, source: "api" });
      if (result.status === "error") fail(result);
      return { message: result.message, subscribed: true };
    },
  }),
  defineShop({
    id: "listShopProducts",
    method: "GET",
    path: "/products",
    scope: "shop:read",
    summary: "List products on sale",
    description:
      "The products on sale in the store, newest first, in the shopper's language with prices (priceFrom, the cheapest variant) in minor units of the chosen currency. Read-only. Call getShopProduct for a product's variants, stock and personalisation options before adding it to a cart.",
    input: z.object({
      locale: shopLocale,
      currency,
      tag: z.string().max(100).optional().describe("Optional. Only products carrying this tag."),
      collection: z.string().max(200).optional().describe("Optional. Only products in this collection (its id or handle)."),
      ...shopPaging,
    }),
    run: async (ctx, input) => {
      let products = await listPublishedProducts(ctx.store.id);
      if (input.tag) products = products.filter((p) => p.tags.includes(input.tag as string));
      if (input.collection) {
        const collection = (await listProductCollections(ctx.store.id)).find(
          (c) => c.id === input.collection || c.handle === input.collection,
        );
        if (!collection) notFound("Collection");
        products = collectionProducts(collection.productIds, products);
      }
      const paged = offsetPage(products, input.limit, input.cursor);
      return { data: paged.data.map((product) => presentListing(ctx, product)), nextCursor: paged.nextCursor };
    },
  }),
  defineShop({
    id: "getShopProduct",
    method: "GET",
    path: "/products/{productHandle}",
    scope: "shop:read",
    summary: "Get a product",
    description:
      "One product on sale, by id or handle: description, images, every variant with its price in the chosen currency and whether it can be bought now (available, and unitsLeft when the store shows low stock), the rating, and how it can be personalised: a line of text (customisation.text, with its label and maximum length) and/or the shopper's own artwork (customisation.artwork: upload the image to uploadUrl, then pass the returned url as artworkUrl to addCartLine). Read-only. Next: createCart, then addCartLine with productId and a variantId.",
    input: z.object({ productHandle: handle("product"), locale: shopLocale, currency }),
    run: async (ctx, input) => {
      const { product: stored, catalog } = await liveProduct(ctx, input.productHandle);
      const [levels, rating, origin] = await Promise.all([
        levelsForProducts([stored.id]),
        productRating(ctx.store.id, stored.id),
        siteOrigin(),
      ]);
      const settings = inventorySettings(ctx.store);
      const product = localizeProduct(stored, ctx.locale, storeLanguages(ctx.store).defaultLocale);
      const area = catalog?.printAreas[0] ?? null;
      const custom = product.shopperCustomization;
      const uploadUrl = `${origin || SITE_ORIGIN}/api/uploads?scope=shopperArtwork&storeId=${encodeURIComponent(ctx.store.id)}&productId=${encodeURIComponent(stored.id)}`;
      return {
        ...presentListing(ctx, stored),
        description: product.description,
        images: product.mockups.map((m) => ({ url: m.url, view: m.view, colour: m.colour })),
        variants: product.variants
          .filter((v) => v.enabled)
          .map((v) => {
            const stock = shopperStock(levels.find((level) => level.id === levelId(stored.id, v.id)), settings);
            return {
              id: v.id,
              name: v.name,
              colour: v.colour,
              colourHex: v.colourHex,
              size: v.size,
              price: presentmentPrice(ctx.store, v.price, product.currency, ctx.currency),
              available: v.availability !== "out_of_stock" && !stock.soldOut,
              unitsLeft: stock.left,
            };
          }),
        rating: { average: rating.average, count: rating.count },
        customisation: {
          text: custom.textLine ? { label: custom.textLabel, maxLength: custom.maxTextLength } : null,
          artwork:
            custom.artworkUpload && area && catalog
              ? {
                  uploadUrl,
                  upload: "POST the image's raw bytes to uploadUrl with its Content-Type (PNG, JPG or WEBP); the answer's url is the artworkUrl for addCartLine.",
                  printArea: { name: area.name, view: area.view, widthMm: area.widthMm, heightMm: area.heightMm, minDpi: area.minDpi },
                  fileRequirements: catalog.fileRequirements,
                }
              : null,
        },
      };
    },
  }),
  defineShop({
    id: "listShopCollections",
    method: "GET",
    path: "/collections",
    scope: "shop:read",
    summary: "List collections",
    description:
      "The store's collections that hold at least one product on sale, in the order the store arranged them, in the shopper's language. Read-only. Next: getShopCollection, or listShopProducts with collection.",
    input: z.object({ locale: shopLocale, ...shopPaging }),
    run: async (ctx, input) => {
      const [collections, products] = await Promise.all([listProductCollections(ctx.store.id), listPublishedProducts(ctx.store.id)]);
      const shown = collections
        .map((stored) => ({ stored, count: collectionProducts(stored.productIds, products).length }))
        .filter((entry) => entry.count > 0)
        .map(({ stored, count }) => {
          const collection = localizeCollection(stored, ctx.locale, storeLanguages(ctx.store).defaultLocale);
          return {
            id: collection.id,
            handle: collection.handle,
            name: collection.name,
            description: collection.description,
            imageUrl: collection.imageUrl,
            url: storeUrl(ctx.store, ctx.locale, `/collections/${encodeURIComponent(collection.handle)}`),
            productCount: count,
          };
        });
      return offsetPage(shown, input.limit, input.cursor);
    },
  }),
  defineShop({
    id: "getShopCollection",
    method: "GET",
    path: "/collections/{collectionHandle}",
    scope: "shop:read",
    summary: "Get a collection with its products",
    description:
      "One collection, by id or handle, with the products on sale in it in the store's order, priced in the chosen currency. Read-only. Next: getShopProduct for one of them.",
    input: z.object({ collectionHandle: handle("collection"), locale: shopLocale, currency, ...shopPaging }),
    run: async (ctx, input) => {
      const [collections, products] = await Promise.all([listProductCollections(ctx.store.id), listPublishedProducts(ctx.store.id)]);
      const stored = collections.find((c) => c.id === input.collectionHandle || c.handle === input.collectionHandle);
      const inside = stored ? collectionProducts(stored.productIds, products) : [];
      if (!stored || inside.length === 0) notFound("Collection");
      const collection = localizeCollection(stored, ctx.locale, storeLanguages(ctx.store).defaultLocale);
      const paged = offsetPage(inside, input.limit, input.cursor);
      return {
        id: collection.id,
        handle: collection.handle,
        name: collection.name,
        description: collection.description,
        imageUrl: collection.imageUrl,
        url: storeUrl(ctx.store, ctx.locale, `/collections/${encodeURIComponent(collection.handle)}`),
        products: { data: paged.data.map((product) => presentListing(ctx, product)), nextCursor: paged.nextCursor },
      };
    },
  }),
  defineShop({
    id: "listShopPages",
    method: "GET",
    path: "/pages",
    scope: "shop:read",
    summary: "List pages and blog posts",
    description:
      "The store's published pages (About, FAQ, Contact…) and blog posts, posts newest first, in the shopper's language, with a short summary each. Read-only. Next: getShopPage for the full text.",
    input: z.object({
      kind: z.enum(["page", "post"]).optional().describe("Optional. page or post; both when left out."),
      locale: shopLocale,
      ...shopPaging,
    }),
    run: async (ctx, input) => {
      const entries = await listPublishedContent(ctx.store.id, input.kind);
      const paged = offsetPage(entries, input.limit, input.cursor);
      return { data: paged.data.map((entry) => presentEntry(ctx, entry, false)), nextCursor: paged.nextCursor };
    },
  }),
  defineShop({
    id: "getShopPage",
    method: "GET",
    path: "/pages/{pageHandle}",
    scope: "shop:read",
    summary: "Get a page or blog post",
    description:
      "One published page or blog post, by id or handle, with its full text as HTML (bodyHtml) in the shopper's language. Read-only. Pass kind when a page and a post share a handle.",
    input: z.object({
      pageHandle: handle("page or post"),
      kind: z.enum(["page", "post"]).optional().describe("Optional. page or post, when the handle is used by both."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const entries = await listPublishedContent(ctx.store.id, input.kind);
      const entry =
        entries.find((e) => e.id === input.pageHandle) ??
        entries.find((e) => e.kind === "page" && e.handle === input.pageHandle) ??
        entries.find((e) => e.handle === input.pageHandle);
      if (!entry) notFound("Page");
      return presentEntry(ctx, entry, true);
    },
  }),
  defineShop({
    id: "searchShop",
    method: "GET",
    path: "/search",
    scope: "shop:read",
    summary: "Search the shop",
    description:
      "Searches the products, collections, pages and blog posts on show, in the shopper's language, forgiving typos, best match first. Each word has to match, so blue hoodie finds blue hoodies. Product results carry their lowest price in the chosen currency. Read-only. Next: getShopProduct, getShopCollection or getShopPage with the result's id.",
    actions: ["search#instantSearch"],
    input: z.object({
      query: z.string().min(2).max(SEARCH_LIMITS.query).describe("What the shopper is looking for, at least two characters."),
      kind: z.enum(SEARCH_KINDS).optional().describe("Optional. Only results of this kind: product, collection, page or post."),
      limit: z.coerce.number().int().min(1).max(SEARCH_LIMITS.page).default(SEARCH_LIMITS.instant).describe(`How many results, 1 to ${SEARCH_LIMITS.page}.`),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      const found = await search(ctx.store, ctx.locale, input.query, ctx.currency, input.kind ? SEARCH_LIMITS.page : input.limit);
      return {
        data: found
          .filter((doc) => !input.kind || doc.kind === input.kind)
          .slice(0, input.limit)
          .map((doc) => ({
            kind: doc.kind,
            id: doc.id,
            title: doc.title,
            summary: doc.text.slice(0, 200),
            url: storeUrl(ctx.store, ctx.locale, doc.path),
            imageUrl: doc.imageUrl,
            price: doc.displayPrice,
            currency: doc.displayPrice === null ? null : ctx.currency,
          })),
      };
    },
  }),

  /* ------------------------------------------------------------------ cart */
  defineShop({
    id: "createCart",
    method: "POST",
    path: "/carts",
    scope: "shop:write",
    summary: "Create a cart",
    description:
      "Starts an empty cart and returns its cartId, the token every other cart operation takes; keep it private, as whoever holds it can change the cart. Creates nothing else and needs no undo: an unused cart simply stays empty. Call addCartLine next.",
    status: 201,
    input: z.object({ locale: shopLocale, currency }),
    run: async (ctx) => {
      const cart = await openCart(ctx.store.id, newId("shp"), true);
      if (!cart) throw new Error("The cart could not be created");
      return presentCart(ctx, cart);
    },
  }),
  defineShop({
    id: "getCart",
    method: "GET",
    path: "/carts/{cartId}",
    scope: "shop:read",
    summary: "Get a cart with its totals",
    description:
      "The cart priced exactly as checkout will charge it: each line, the subtotal, the discount code and what it takes off (or discountProblem, the reason it no longer applies), the gift card and how much of the order it covers, the shipping rates to country with the one selected, tax and the total; amountDue is what is left to pay after the gift card. All amounts in minor units of the chosen currency. Read-only. Pass country (and shippingRate) to see the rates and tax for the shopper's address before startCheckout.",
    actions: ["shop#readShopperSession"],
    input: z.object({
      cartId,
      country: z.string().regex(/^[A-Za-z]{2}$/, "Use a two-letter country code.").optional().describe("Optional. Two-letter ISO code of the delivery country, for its shipping rates and tax. The store's own country when left out."),
      shippingRate: z.string().max(100).optional().describe("Optional. The rateId of the shipping option to price the cart with; the cheapest when left out."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => presentCart(ctx, await cartOf(ctx, input.cartId), input.country?.toUpperCase(), input.shippingRate),
  }),
  defineShop({
    id: "addCartLine",
    method: "POST",
    path: "/carts/{cartId}/lines",
    scope: "shop:write",
    summary: "Add a product to the cart",
    description:
      "Adds quantity of one variant to the cart, with the same checks as the storefront's Add to basket: the product must be on sale, the variant enabled and in stock, and personalisation allowed by the product (see getShopProduct's customisation). An identical line without personalisation is topped up instead of repeated. Personalise with text, and/or with artworkUrl (an image uploaded to the product's uploadUrl) placed with placement; previewUrl is an optional finished preview. Send the same lineId again to retry safely: an add already stored changes nothing. Reversible with updateCartLine or removeCartLine. Returns the cart; next, getCart with the shopper's country, or startCheckout.",
    status: 201,
    actions: ["shop#addToCart"],
    input: z.object({
      cartId,
      productId: z.string().min(1).describe("The product's id, from getShopProduct."),
      variantId: z.string().min(1).describe("The variant's id, from getShopProduct's variants."),
      quantity: z.number().int().min(1).max(50).default(1).describe("How many, 1 to 50."),
      text: z.string().max(500).optional().describe("Optional. The personalisation text, for a product whose customisation.text is set; at most its maxLength."),
      artworkUrl: z.string().optional().describe("Optional. The shopper's artwork, as the url the product's uploadUrl returned, for a product whose customisation.artwork is set."),
      artworkFileName: z.string().max(120).optional().describe("Optional. The artwork's original file name, shown to the store."),
      placement: z
        .object({
          x: z.number().optional().describe("The artwork's centre across the print area, 0 to 1; 0.5 is centred."),
          y: z.number().optional().describe("The artwork's centre down the print area, 0 to 1; 0.5 is centred."),
          scale: z.number().optional().describe("The artwork's width as a fraction of the print area's width, 0.05 to 2."),
          rotation: z.number().optional().describe("Rotation in degrees, -180 to 180."),
        })
        .optional()
        .describe("Optional. Where the artwork sits in the print area; centred when left out."),
      previewUrl: z.string().optional().describe("Optional. A finished preview image of the personalised product, already uploaded to the asset storage."),
      lineId: z
        .string()
        .regex(/^cit_[a-z0-9]{12}$/, "Use cit_ followed by 12 lowercase letters or digits.")
        .optional()
        .describe("Optional. An id for the new line (cit_ and 12 lowercase letters or digits), so a retried add lands once."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      if (input.previewUrl && !isStoredAsset(input.previewUrl)) {
        throw new OperationError("invalid", "Use an image already uploaded to the store's asset storage.", "previewUrl");
      }
      const artwork = input.artworkUrl ? await readStoredAsset(input.artworkUrl, "shopperArtwork", "artworkUrl", input.artworkFileName) : null;
      const placement = input.placement ?? {};
      const result = await addLine(session(ctx, input.cartId), {
        storeId: ctx.store.id,
        productId: input.productId,
        variantId: input.variantId,
        quantity: input.quantity,
        text: (input.text ?? "").trim(),
        lineId: input.lineId ?? "",
        artwork,
        placement: readPlacement(
          (key) =>
            ({ artworkX: placement.x, artworkY: placement.y, artworkScale: placement.scale, artworkRotation: placement.rotation })[key],
        ),
        preview: input.previewUrl ? { url: input.previewUrl } : null,
      });
      if (result.status === "error") fail(result.field === "artwork" ? { ...result, field: "artworkUrl" } : result);
      return { lineId: result.lineId, ...(await presentCart(ctx, await cartOf(ctx, input.cartId), undefined, undefined, result.message)) };
    },
  }),
  defineShop({
    id: "updateCartLine",
    method: "PATCH",
    path: "/carts/{cartId}/lines/{lineId}",
    scope: "shop:write",
    summary: "Change a cart line",
    description:
      "Sets a line's quantity (at most 50; 0 removes the line) and/or attaches a finished preview image (previewUrl) to a personalised line. Reversible: set the quantity back. Returns the cart.",
    actions: ["shop#updateCartItem", "shop#attachLinePreview"],
    input: z.object({
      cartId,
      lineId,
      quantity: z.number().int().min(0).max(50).optional().describe("Optional. The new quantity, 0 to 50; 0 removes the line."),
      previewUrl: z.string().optional().describe("Optional. A finished preview of the personalised line, already uploaded to the asset storage. Ignored for a line without personalisation."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      const cart = await cartOf(ctx, input.cartId);
      if (!cart.items.some((item) => item.id === input.lineId)) notFound("Cart line");
      if (input.previewUrl !== undefined && !isStoredAsset(input.previewUrl)) {
        throw new OperationError("invalid", "Use an image already uploaded to the store's asset storage.", "previewUrl");
      }
      const shopperSession = session(ctx, input.cartId);
      if (input.previewUrl) await attachLinePreview(shopperSession, ctx.store.id, input.lineId, { url: input.previewUrl });
      if (input.quantity !== undefined) await updateLine(shopperSession, ctx.store.id, input.lineId, input.quantity);
      return presentCart(ctx, await cartOf(ctx, input.cartId));
    },
  }),
  defineShop({
    id: "removeCartLine",
    method: "DELETE",
    path: "/carts/{cartId}/lines/{lineId}",
    scope: "shop:write",
    summary: "Remove a cart line",
    description:
      "Takes a line out of the cart. A personalised line's text and artwork go with it; add it again with addCartLine to undo. Returns the cart.",
    actions: ["shop#removeCartItem"],
    input: z.object({ cartId, lineId, locale: shopLocale, currency }),
    run: async (ctx, input) => {
      const cart = await cartOf(ctx, input.cartId);
      if (!cart.items.some((item) => item.id === input.lineId)) notFound("Cart line");
      await removeLine(session(ctx, input.cartId), ctx.store.id, input.lineId);
      return presentCart(ctx, await cartOf(ctx, input.cartId));
    },
  }),
  defineShop({
    id: "applyCartDiscount",
    method: "PUT",
    path: "/carts/{cartId}/discount",
    scope: "shop:write",
    summary: "Apply a discount code",
    description:
      "Puts a discount code on the cart, replacing any other, once it is checked against this cart: an unknown, expired or used-up code, or a basket below the code's minimum, is refused with field code and the reason in the shopper's language. What it takes off is worked out again on every read and at checkout, so a code that stops applying shows as discountProblem in getCart. Reversible with removeCartDiscount. Returns the cart and a confirmation message.",
    actions: ["shop#applyDiscount"],
    input: z.object({
      cartId,
      code: z.string().max(100).describe("The discount code as the shopper typed it."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      const result = await applyDiscount(session(ctx, input.cartId), ctx.store.id, input.code);
      if (result.status === "error") fail(result);
      return presentCart(ctx, await cartOf(ctx, input.cartId), undefined, undefined, result.message);
    },
  }),
  defineShop({
    id: "removeCartDiscount",
    method: "DELETE",
    path: "/carts/{cartId}/discount",
    scope: "shop:write",
    summary: "Remove the discount code",
    description: "Takes the discount code off the cart; apply it again with applyCartDiscount. Returns the cart.",
    actions: ["shop#removeDiscount"],
    input: z.object({ cartId, locale: shopLocale, currency }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      await removeDiscount(session(ctx, input.cartId), ctx.store.id);
      return presentCart(ctx, await cartOf(ctx, input.cartId));
    },
  }),
  defineShop({
    id: "applyCartGiftCard",
    method: "PUT",
    path: "/carts/{cartId}/gift-card",
    scope: "shop:write",
    summary: "Apply a gift card",
    description:
      "Puts one of the store's gift cards on the cart, replacing any other. Nothing is taken off the card yet: its balance is checked again at startCheckout and held then, and released if the order is not paid. An unknown, used-up or expired card is refused with field code. Reversible with removeCartGiftCard. Returns the cart (giftCard shows the balance and what it covers) and a confirmation message.",
    actions: ["shop#applyGiftCard"],
    input: z.object({
      cartId,
      code: z.string().max(100).describe("The gift card code as printed on the card or email."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      const result = await applyGiftCard(session(ctx, input.cartId), ctx.store.id, input.code);
      if (result.status === "error") fail(result);
      return presentCart(ctx, await cartOf(ctx, input.cartId), undefined, undefined, result.message);
    },
  }),
  defineShop({
    id: "removeCartGiftCard",
    method: "DELETE",
    path: "/carts/{cartId}/gift-card",
    scope: "shop:write",
    summary: "Remove the gift card",
    description: "Takes the gift card off the cart; its balance is untouched. Apply it again with applyCartGiftCard. Returns the cart.",
    actions: ["shop#removeGiftCard"],
    input: z.object({ cartId, locale: shopLocale, currency }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      await removeGiftCard(session(ctx, input.cartId), ctx.store.id);
      return presentCart(ctx, await cartOf(ctx, input.cartId));
    },
  }),

  /* -------------------------------------------------------------- checkout */
  defineShop({
    id: "startCheckout",
    method: "POST",
    path: "/carts/{cartId}/checkout",
    scope: "shop:write",
    summary: "Place the order and start payment",
    description:
      "Places the cart as an order for the given address and shipping rate (see getCart's shipping.options for that country), holding the stock, one use of the discount code and the gift card's share. Returns orderCode and paymentUrl. On a live store (getShop payment stripe) the order waits for payment: hand paymentUrl, a Stripe Checkout page, to the shopper; never pay it yourself. When the gift card covers everything, or on a demo store (payment demo, pass test card 4242 4242 4242 4242, any future expiry such as 12/34, any CVC), the order is paid at once and paymentUrl is the signed order status page. Not reversible through this API: an unpaid order releases its holds when the Checkout session expires; a paid one is cancelled or refunded by the store. Send the same idempotencyKey to retry safely: a repeat returns the first order. Ask the shopper to confirm before calling. To test checkout, pass dryRun true: every check runs and the order is priced, but nothing is placed, held or charged, on any store. It answers status dry_run with orderCode null, payment (stripe, demo or gift_card: how the order would be paid), the order summary, and paymentUrl, the store's checkout page. Every missing or invalid field is refused together: field names the first, error.issues lists each field with its message.",
    status: 201,
    actions: ["shop#placeOrder"],
    input: z.object({
      cartId,
      email: z.string().max(200).describe("The shopper's email address, for the confirmation and order lookups."),
      ...ADDRESS_FIELDS,
      shippingRate: z.string().max(100).default("").describe("The rateId from getCart's shipping.options for this country; the cheapest when left empty."),
      marketingConsent: z.boolean().default(false).describe("Whether the shopper agreed to marketing email from the store. Only true when they said so."),
      idempotencyKey: z.string().min(8).max(100).describe("Any unique string for this checkout attempt. Retrying with the same key returns the first order instead of placing a second."),
      cardNumber: z.string().max(30).optional().describe("Demo stores only: a test card number such as 4242 4242 4242 4242. Ignored by live stores, which take payment on Stripe Checkout."),
      expiry: z.string().max(10).optional().describe("Demo stores only: the test card's expiry, MM/YY."),
      cvc: z.string().max(4).optional().describe("Demo stores only: the test card's CVC."),
      dryRun: z.boolean().default(false).describe("Check and price the order without placing it: no order, no stock or code held, no payment. For testing checkout."),
      locale: shopLocale,
      currency,
    }),
    run: async (ctx, input) => {
      await cartOf(ctx, input.cartId);
      const result = await placeOrder(session(ctx, input.cartId), {
        storeId: ctx.store.id,
        idempotencyKey: input.idempotencyKey,
        name: input.name,
        email: input.email,
        line1: input.line1,
        line2: input.line2 ?? "",
        city: input.city,
        postalCode: input.postalCode,
        country: input.country,
        region: input.region ?? "",
        phone: input.phone ?? "",
        currency: ctx.currency,
        shippingRate: input.shippingRate,
        marketingConsent: input.marketingConsent,
        cardNumber: input.cardNumber ?? "",
        expiry: input.expiry ?? "",
        cvc: input.cvc ?? "",
        dryRun: input.dryRun,
      });
      if (result.status === "error") fail(result);
      if (result.status === "preview") {
        const shipsWithin = await storeShipDays(ctx.store.id);
        const { shippingRate, ...order } = result.order;
        return {
          dryRun: true,
          orderCode: null,
          status: "dry_run",
          payment: result.payment,
          paymentUrl: result.to,
          paid: false,
          order: {
            ...order,
            shippingRate: shippingRate
              ? { rateId: shippingRate.rateId, name: shippingRate.name, amount: shippingRate.amount, ...deliveryDays(shippingRate, shipsWithin) }
              : null,
          },
        };
      }
      const placed = await db.findOne<Order>(COLLECTIONS.orders, { storeId: ctx.store.id, code: result.orderCode });
      return {
        orderCode: result.orderCode,
        status: placed?.status ?? "awaiting_payment",
        paymentUrl: result.to,
        paid: placed ? placed.status !== "awaiting_payment" : false,
      };
    },
  }),
  defineShop({
    id: "lookupOrder",
    method: "POST",
    path: "/orders/lookup",
    scope: "shop:read",
    summary: "Look an order up",
    description:
      "Finds an order by its code and the email address it was placed with, and returns its status, lines, totals, tracking and the signed order status page (statusUrl, which also holds the review form once delivered; its t parameter is the token submitReview takes). An unknown code and a wrong email get the same refusal, so it cannot be used to discover orders. Read-only.",
    actions: ["shop#lookupOrder"],
    input: z.object({
      code: z.string().max(40).describe("The order code from the confirmation, such as PX-7K2M9Q."),
      email: z.string().max(200).describe("The email address the order was placed with."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const result = await findOrder(ctx.store, await copyOf(ctx), input.code, input.email);
      if (result.status === "error") fail(result);
      return presentShopperOrder(result.order, result.to, await storeShipDays(ctx.store.id));
    },
  }),
  defineShop({
    id: "submitReview",
    method: "POST",
    path: "/reviews",
    scope: "shop:write",
    summary: "Review a product from an order",
    description:
      "Records a verified buyer's review of a product on one of their delivered orders, proved by the order code and the signed token from the order status link (the t parameter of lookupOrder's statusUrl). One review per product per order; the store moderates it before it shows. Cannot be edited or withdrawn through this API.",
    status: 201,
    actions: ["product-reviews#submitReview"],
    input: z.object({
      code: z.string().max(40).describe("The order code."),
      token: z.string().max(100).describe("The signed token from the order status link (its t parameter)."),
      productId: z.string().min(1).describe("The reviewed product's id, as on the order's lines."),
      rating: z.number().int().min(1).max(5).describe("Stars, 1 to 5."),
      title: z.string().max(REVIEW_LIMITS.title).default("").describe(`Optional. A headline, at most ${REVIEW_LIMITS.title} characters.`),
      body: z.string().max(REVIEW_LIMITS.body).describe(`The review, ${REVIEW_LIMITS.minBody} to ${REVIEW_LIMITS.body} characters.`),
      authorName: z.string().max(REVIEW_LIMITS.name).describe("The name shown with the review, such as Anna K."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const t = await shopperTranslator(ctx.store, ctx.locale);
      const result = await recordReview(ctx.store, { t, locale: ctx.locale }, {
        code: input.code.trim().toUpperCase(),
        token: input.token,
        productId: input.productId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        authorName: input.authorName,
      });
      if (result.status === "error") fail(result);
      return { message: result.message };
    },
  }),

  /* -------------------------------------------------------- shopper account */
  defineShop({
    id: "requestCustomerSignInLink",
    method: "POST",
    path: "/customer/sign-in-link",
    scope: "shop:write",
    summary: "Email the shopper a sign-in link",
    description:
      "Emails the shopper a one-time link that signs them in to their account in this store's storefront, valid for 30 minutes. The answer is the same whether or not the address has ordered before. Signing in happens in the shopper's browser; the session it starts is the customerAccessToken the account operations take. Sends an email; nothing else changes.",
    actions: ["account#requestSignInLink"],
    input: z.object({ email: z.string().max(200).describe("The shopper's email address."), locale: shopLocale }),
    run: async (ctx, input) => {
      const t = await shopperTranslator(ctx.store, ctx.locale);
      const result = await requestSignInLink(ctx.store, { locale: ctx.locale, t }, input.email);
      if (result.status === "error") fail(result);
      return { message: result.message };
    },
  }),
  defineShop({
    id: "listCustomerAddresses",
    method: "GET",
    path: "/customer/addresses",
    scope: "shop:read",
    summary: "List the shopper's saved addresses",
    description:
      "The signed-in shopper's address book in this store (the default one first fills checkout) and whether they receive marketing email. Read-only. Next: startCheckout with one of the addresses, or saveCustomerAddress.",
    input: z.object({ customerAccessToken, locale: shopLocale }),
    run: async (ctx, input) => presentAddresses(await shopper(ctx, input.customerAccessToken)),
  }),
  defineShop({
    id: "saveCustomerAddress",
    method: "POST",
    path: "/customer/addresses",
    scope: "shop:write",
    summary: "Save an address",
    description:
      "Adds an address to the signed-in shopper's address book (at most 10), or replaces the one with addressId. The same checks as checkout run, refused with the field that is wrong. Reversible with deleteCustomerAddress. Returns the address book.",
    actions: ["account#saveAddress"],
    input: z.object({
      customerAccessToken,
      addressId: z.string().max(40).optional().describe("Optional. The id of the address to replace; a new address when left out."),
      ...ADDRESS_FIELDS,
      isDefault: z.boolean().default(false).describe("Make this the default address checkout starts from."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const found = await shopper(ctx, input.customerAccessToken);
      const t = await shopperTranslator(ctx.store, ctx.locale);
      const result = await saveAddress(found, t, input, input.addressId ?? "", input.isDefault);
      if (result.status === "error") fail(result);
      return { message: result.message, addressId: result.addressId, ...presentAddresses(await shopper(ctx, input.customerAccessToken)) };
    },
  }),
  defineShop({
    id: "deleteCustomerAddress",
    method: "DELETE",
    path: "/customer/addresses/{addressId}",
    scope: "shop:write",
    summary: "Delete a saved address",
    description:
      "Takes an address out of the signed-in shopper's address book; another becomes the default if it was. Not reversible except by saving it again. Returns the address book.",
    destructive: true,
    actions: ["account#deleteAddress"],
    input: z.object({ customerAccessToken, addressId: z.string().min(1).describe("The address's id, from listCustomerAddresses."), locale: shopLocale }),
    run: async (ctx, input) => {
      const found = await shopper(ctx, input.customerAccessToken);
      if (!(found.customer.addresses ?? []).some((address) => address.id === input.addressId)) notFound("Address");
      await deleteAddress(found, input.addressId);
      return presentAddresses(await shopper(ctx, input.customerAccessToken));
    },
  }),
  defineShop({
    id: "setCustomerMarketingConsent",
    method: "PUT",
    path: "/customer/marketing",
    scope: "shop:write",
    summary: "Set the shopper's marketing choice",
    description:
      "Records whether the signed-in shopper wants marketing email from this store. Only change it when the shopper asked to. Reversible: call again with the other value.",
    actions: ["account#setMarketing"],
    input: z.object({
      customerAccessToken,
      subscribed: z.boolean().describe("true to receive marketing email, false to stop it."),
      locale: shopLocale,
    }),
    run: async (ctx, input) => {
      const found = await shopper(ctx, input.customerAccessToken);
      const t = await shopperTranslator(ctx.store, ctx.locale);
      const result = await setMarketing(found, t, input.subscribed);
      if (result.status === "error") fail(result);
      return { message: result.message, subscribed: input.subscribed };
    },
  }),
];
