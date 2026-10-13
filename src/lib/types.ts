/**
 * Domain model. The vocabulary follows Vendure's headless commerce concepts —
 * a Store is a Vendure Channel (its own catalog, customers, orders, currencies
 * and tax settings), products have variants, and tax brackets are global tax
 * rate definitions that a store product simply points at.
 */

import type { NotificationPrefs } from "./notifications";
import type { StorePolicies } from "./policies";
import type { ShopTextOverrides } from "./shop-text";
import type { FieldTranslations } from "./translations";
import type { CurrencyRateSetting, FxSnapshot } from "./currency";

export type StoreRole = "store_admin" | "catalog_manager" | "order_manager" | "viewer";
export type PlatformRole = "platform_admin" | "agency_admin" | "agency_member";

export const STORE_ROLE_LABELS: Record<StoreRole, string> = {
  store_admin: "Store administrator",
  catalog_manager: "Catalog manager",
  order_manager: "Order manager",
  viewer: "Viewer",
};

/**
 * A platform administrator reaches a store through oversight, not membership.
 * Their badge says so, and their pages withhold shopper records — see
 * `PLATFORM_ACCESS_NOTE`.
 */
export const PLATFORM_ACCESS_LABEL = "Platform access";

export const PLATFORM_ACCESS_NOTE =
    "Customer details and order values are hidden with platform access.";

/** What to call the access a person holds over a store, on badges and lists. */
export function storeAccessLabel(role: StoreRole, viaPlatform: boolean): string {
  return viaPlatform ? PLATFORM_ACCESS_LABEL : STORE_ROLE_LABELS[role];
}

export const STORE_ROLE_DESCRIPTIONS: Record<StoreRole, string> = {
  store_admin: "Full access, including settings and team.",
    catalog_manager: "Products, pricing, publishing and gift catalogues.",
  order_manager: "Orders, fulfilment, refunds and supplier exceptions.",
  viewer: "Read-only access.",
};

export interface Agency {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "studio" | "scale";
  contactEmail: string;
  status: "active" | "suspended";
  createdAt: string;
  /**
   * Self-serve subscription. Absent on agencies set up by the platform team,
   * which are billed outside the workspace.
   */
  billing?: AgencyBilling;
  /** The sign-up form that created the agency, so a resubmission finds it again. */
  signupKey?: string;
}

export interface AgencyBilling {
  /**
   * `trialing` from sign-up until payment details are added, with no card on
   * file; `pending` is the older card-first sign-up that has not finished
   * checkout. `past_due` after a failed renewal; `canceled` once the
   * subscription has ended.
   */
  status: "trialing" | "pending" | "active" | "past_due" | "canceled";
  plan: "starter" | "studio";
  cycle: "monthly" | "yearly";
  currency: "USD" | "EUR";
  checkoutSessionId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  activatedAt: string | null;
  /** When a `trialing` agency's free trial ends. */
  trialEndsAt?: string | null;
  /** The trial reminder emails already sent to the owner. */
  trialReminders?: ("three_days" | "one_day" | "ended")[];
  /** When the current period ends, as Stripe last reported it. */
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  platformRole: PlatformRole;
  agencyId: string | null;
  title: string;
  createdAt: string;
  /** The language the workspace is shown in. Unset follows the browser. */
  uiLanguage?: string;
  /** Per event type, where notifications go. Unset types use the defaults. */
  notificationPrefs?: NotificationPrefs;
  /** The sign-up form that created the account, so a resubmission finds it again. */
  signupKey?: string;
}

export interface Membership {
  id: string;
  storeId: string;
  agencyId: string;
  userId: string | null;
  email: string;
  name: string;
  role: StoreRole;
  status: "invited" | "active";
  invitedBy: string;
  invitedAt: string;
  acceptedAt: string | null;
  /** Single-use acceptance token, cleared once the invitation is accepted. */
  inviteToken?: string | null;
  /** The language the invitation is written in, and the new account starts in. */
  language?: string;
}

export interface CarrierAccount {
  carrier: "dhl" | "fedex" | "ups";
  enabled: boolean;
  accountNumber: string;
  services: string[];
}

export interface StoreSetupState {
  branding: boolean;
  localisation: boolean;
  support: boolean;
  domain: boolean;
  payments: boolean;
  shipping: boolean;
  tax: boolean;
}

/**
 * The guided setup steps, in the order they are worked through. Progress is
 * counted against this list rather than the keys a stored record happens to
 * carry, so a store saved before a step existed reads as not having done it.
 */
export const SETUP_STEPS = [
  "branding",
  "localisation",
  "support",
  "domain",
  "payments",
  "shipping",
  "tax",
] as const satisfies readonly (keyof StoreSetupState)[];

export interface Store {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  channelCode: string;
  clientName: string;
  status: "active" | "archived";
  logoUrl: string | null;
  theme: ThemeKey;
  defaultLanguage: string;
  /**
   * The languages the storefront and gift portals are available in. Absent on
   * stores saved before more than one could be chosen, so read it through
   * `storeLanguages()`, which always includes the default.
   */
  languages?: string[];
  /**
   * The store's own wording of the built-in shopper text, per language, shaped
   * like the `storefront` messages. Merged over them at request time; see
   * `src/lib/shop-text.ts`.
   */
  shopText?: Partial<Record<string, ShopTextOverrides>>;
  currencies: string[];
  /** The shop currency: products are priced in it and reports add up in it. */
  defaultCurrency: string;
  /**
   * How each extra presentment currency is priced: an automatic or manual
   * exchange rate and a rounding rule. Absent entries are automatic and
   * unrounded; read it through `currencySettings()` in `@/lib/currency`.
   */
  currencyRates?: Partial<Record<string, CurrencyRateSetting>>;
  /** The latest automatic exchange rates, kept on the store so a page needs no extra read. */
  fxRates?: FxSnapshot | null;
  /**
   * The primary domain shoppers are sent to, mirrored from the Domains page
   * (`store_domains`) so the storefront reads it with the store.
   */
  customDomain: string | null;
  /** `verified` once the primary domain serves over HTTPS. */
  domainStatus: "unset" | "pending" | "verified";
  /** Every host name connected on the Domains page, so a request's host finds its store in one read. */
  domainHosts?: string[];
  /**
   * Where a shopper with a problem reaches the seller. Both are absent on
   * stores saved before support contacts were part of setup, so read them
   * through `storeSupport()` rather than off the record.
   */
  supportEmail?: string | null;
  supportPhone?: string | null;
  /**
   * The refund, shipping, terms of sale and privacy text the store wrote, per
   * language. Absent until one is edited; read it through `storePolicyText()`.
   */
  policies?: StorePolicies;
  /** Changes on every policy save; the storefront's policy cache is keyed on it. */
  policiesVersion?: string;
  stripe: {
    connected: boolean;
    accountId: string | null;
    country: string;
    chargesEnabled: boolean;
    connectedAt: string | null;
    /** Set on accounts created through Stripe Connect onboarding. Older records were typed in by hand. */
    express?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    /** The account disconnected last, so connecting again creates a new one rather than replaying the old request. */
    previousAccountId?: string | null;
  };
  /**
   * A seeded demonstration store. Its checkout simulates payment until it has a
   * connected account that can take charges; nobody is charged.
   */
  demo?: boolean;
  carriers: CarrierAccount[];
  defaultTaxBracketId: string | null;
  pricesIncludeTax: boolean;
  /** Absent until the inventory settings are saved; read it through `inventorySettings()`. */
  inventory?: InventorySettings;
  /** The one email sent after a checkout expires unpaid. Off unless turned on. */
  checkoutRecovery?: CheckoutRecoverySettings | null;
  /** Absent until the tax settings are saved; read it through `storeTax()`. */
  tax?: StoreTaxSettings;
  /** The header and footer navigation. Absent until a menu is saved; read it through `storeMenus()`. */
  menus?: StoreMenus;
  setup: StoreSetupState;
  createdAt: string;
  archivedAt: string | null;
}

export type TaxMode = "manual" | "stripe";

/**
 * How tax is charged at checkout. `manual` charges the store's own rate for
 * the destination country, or each product's tax bracket where the country has
 * none. `stripe` hands the calculation to Stripe Tax on the connected account.
 * Whether prices include tax stays on `Store.pricesIncludeTax`.
 */
export interface StoreTaxSettings {
  mode: TaxMode;
  /** Percent, per ISO country code. */
  rates: { country: string; rate: number }[];
  /** What Stripe said about Stripe Tax on the connected account when it was last asked. */
  stripeTax?: { status: "active" | "pending" | "unavailable"; checkedAt: string } | null;
}

/* ------------------------------------------------------------ shipping */

/**
 * - `flat`: one price.
 * - `weight`: priced by the order's weight in grams, from `tiers`.
 * - `subtotal`: priced by the order's subtotal after discounts, from `tiers`.
 * - `free_over`: `amount` below `threshold`, free at or above it.
 */
export type ShippingRateKind = "flat" | "weight" | "subtotal" | "free_over";

/** One step of a weight or subtotal rate. `upTo` is inclusive; null is "and above". */
export interface ShippingRateTier {
  upTo: number | null;
  amount: number;
}

export interface ShippingRate {
  id: string;
  name: string;
  kind: ShippingRateKind;
  /** Minor units of the zone currency: the price of a flat rate, the price below the threshold of a free_over rate. */
  amount: number;
  /** Ascending by `upTo`, for weight and subtotal rates. Empty otherwise. */
  tiers: ShippingRateTier[];
  /** The subtotal a free_over rate is free from, in minor units. Null otherwise. */
  threshold: number | null;
  /** Business days the delivery estimate runs from and to. */
  minDays: number;
  maxDays: number;
  /** The key of the form that created it, so a resubmission finds it again. */
  submissionKey?: string | null;
}

/** A set of countries a store ships to, with the rates shoppers there can choose from. */
export interface ShippingZone {
  id: string;
  storeId: string;
  name: string;
  /** ISO alpha-2 codes. A country belongs to one zone of a store at most. */
  countries: string[];
  /** The currency the rate amounts and thresholds are written in. */
  currency: string;
  rates: ShippingRate[];
  submissionKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The rate an order ships with, as it was when the shopper chose it. */
export interface OrderShippingRate {
  zoneId: string;
  zoneName: string;
  rateId: string;
  name: string;
  minDays: number;
  maxDays: number;
  /** In the order currency. */
  amount: number;
}

export interface CheckoutRecoverySettings {
  enabled: boolean;
  /** Hours after the checkout expired. */
  delayHours: number;
  /** Only checkouts abandoned after this are emailed, so turning it on never mails old ones. */
  enabledAt: string | null;
}

export interface InventorySettings {
  /** A tracked variant at or below this many available units counts as low stock. */
  lowStockThreshold: number;
  /** Shows "Only N left" on the storefront for low-stock variants. */
  showLowStock: boolean;
}

export type ThemeKey = "atelier" | "meridian" | "graphite" | "bloom";

/**
 * A storefront theme is the client's brand, expressed in the three values the
 * storefront layout maps onto the shadcn CSS variables — see
 * `src/lib/store-theme.ts`. `font` is a font stack rather than a webfont so a
 * client's choice costs no extra request on their shoppers' first paint.
 */
export const THEMES: Record<
  ThemeKey,
  { name: string; description: string; accent: string; surface: string; ink: string; font: string }
> = {
  atelier: {
    name: "Atelier",
    description: "Editorial layout with generous whitespace.",
    accent: "#0d9488",
    surface: "#f8fafc",
    ink: "#0f172a",
    font: '"Iowan Old Style", "Palatino Linotype", ui-serif, Georgia, serif',
  },
  meridian: {
    name: "Meridian",
    description: "Bold, high-contrast blocks for merch campaigns and launches.",
    accent: "#5b4bf5",
    surface: "#f5f3ff",
    ink: "#1e1b4b",
    font: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  },
  graphite: {
    name: "Graphite",
    description: "Restrained monochrome for corporate gifting catalogues.",
    accent: "#334155",
    surface: "#f1f5f9",
    ink: "#0f172a",
    font: '"Helvetica Neue", Helvetica, Arial, ui-sans-serif, sans-serif',
  },
  bloom: {
    name: "Bloom",
    description: "Warm and friendly.",
    accent: "#e11d48",
    surface: "#fff1f2",
    ink: "#4c0519",
    font: '"Avenir Next", Avenir, "Trebuchet MS", ui-rounded, sans-serif',
  },
};

export interface Supplier {
  id: string;
  name: string;
  kind: "print_on_demand" | "manufacturer" | "sourcing_marketplace";
  website: string;
  summary: string;
  status: "approved" | "pending_review" | "disabled";
  regions: string[];
  integration: "api" | "manual";
  capabilities: {
    catalog: boolean;
    quotes: boolean;
    inventory: boolean;
    mockups: boolean;
    orderSubmission: boolean;
    tracking: boolean;
    cancellation: boolean;
  };
  leadTimeDays: [number, number];
  notes: string;
  createdAt: string;
}

/** One thing an order needs made, deduplicated across its items. */
export interface ItemRequirement {
  /** Human label for the routing panel, e.g. "Mug". */
  label: string;
  /** Product family the order needs: "t-shirt", "hoodie", "mug". */
  family: string | null;
  category: string | null;
}

/**
 * A supplier offered as somewhere an order could be produced instead. The
 * supplier the order sits with now is never one of these — a reroute has to
 * move the job somewhere it has not already failed.
 */
export interface SupplierChoice {
  id: string;
  name: string;
  kind: Supplier["kind"];
  leadTimeDays: [number, number];
}

/** Where a job that automatic routing could not place could go instead. */
export interface RoutingOptions {
  region: string;
  destination: string;
  requirements: ItemRequirement[];
  /** Approved, produces every item for this region, and takes jobs over its order API. */
  available: SupplierChoice[];
  /** Same, but with no order submission API — those are manual purchase orders. */
  manualOnly: SupplierChoice[];
  /** False when the store has no carrier switched on, so nothing can dispatch. */
  carriersEnabled: boolean;
}

/** A box on a mockup image expressed as 0–1 fractions of its width and height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintArea {
  id: string;
  /** Human label — Front, Back, Left wrap, … */
  name: string;
  view: MockupView;
  widthMm: number;
  heightMm: number;
  minDpi: number;
  /** Placement of the printable rectangle on the mockup image, 0–1 fractions. */
  rect: Rect;
}

export type MockupView = "front" | "back" | "left" | "right";

export const VIEW_LABELS: Record<MockupView, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
};

export interface FileRequirements {
  formats: string[];
  maxFileMb: number;
  minDpi: number;
  transparentBackgroundRequired: boolean;
  maxPixels: number;
}

export interface CatalogVariant {
  id: string;
  name: string;
  colour: string;
  colourHex: string;
  size: string;
  sku: string;
  baseCost: number;
  availability: "in_stock" | "low_stock" | "out_of_stock";
}

/**
 * What a bulk-sourcing entry carries instead of a unit price.
 *
 * Sourcing marketplaces quote per enquiry: the price depends on the run size,
 * the decoration and the factory that takes the job, so there is no fixed cost
 * to publish. An entry carrying this is priced by quote — its `baseCost` and
 * its variant costs are zero until a supplier answers a request.
 */
export interface BulkSourcing {
  /** Fewest units a factory on this listing will quote for. */
  minimumOrderQuantity: number;
  /** What comparable runs have cost per unit at the minimum, low to high, in minor units. */
  indicativeUnitCost: [number, number];
  /** Working days a supplier usually takes to answer a request. */
  responseDays: [number, number];
  /** What the buyer still has to settle before production, shown beside the form. */
  quoteNotes: string;
}

/** A supplier-backed product in the shared catalog managed by platform admins. */
export interface CatalogProduct {
  id: string;
  supplierId: string;
  name: string;
  category: "apparel" | "drinkware";
  productType: string;
  description: string;
  currency: string;
  baseCost: number;
  customizationCostPerArea: number;
  shippingEstimate: number;
  variants: CatalogVariant[];
  printAreas: PrintArea[];
  /** Base mockup photograph per view, keyed by `${view}:${colourHex}` and `view`. */
  mockups: { view: MockupView; colour: string; url: string }[];
  fileRequirements: FileRequirements;
  fulfillmentRegions: string[];
  leadTimeDays: [number, number];
  availability: "available" | "limited" | "discontinued";
  status: "active" | "retired";
  /** Present on bulk-sourcing entries only: this listing is priced by quote. */
  bulkSourcing?: BulkSourcing;
  createdAt: string;
}

/** What a file uploaded through `/api/uploads` becomes once it is stored. */
export interface StoredImage {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Zero for formats with no pixel grid, such as SVG. */
  pixelWidth: number;
  pixelHeight: number;
  hasAlpha: boolean;
}

/** Upload kinds, each with its own permission check and size/format rules. */
export type UploadScope = "artwork" | "mockup" | "logo" | "collection" | "shopperArtwork" | "shopperPreview";

/** Where artwork sits inside a print area, as fractions of the print area box. */
export interface ArtworkPlacement {
  /** Centre of the artwork. */
  x: number;
  y: number;
  /** Artwork width as a fraction of the print area width. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export const DEFAULT_PLACEMENT: ArtworkPlacement = { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 };

export interface Artwork {
  id: string;
  printAreaId: string;
  view: MockupView;
  fileName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  pixelWidth: number;
  pixelHeight: number;
  hasAlpha: boolean;
  /** Placement within the print area, 0–1 fractions of the print area box. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface MockupImage {
  id: string;
  view: MockupView;
  url: string;
  /**
   * A JPEG copy for link previews, whose renderer cannot draw WebP. Absent on
   * mockups made before share images existed; `npm run backfill-share-images`
   * fills those in.
   */
  shareUrl?: string | null;
  colour: string;
  generatedAt: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface CostBreakdown {
  supplierCost: number;
  customizationCost: number;
  shippingEstimate: number;
  taxBracketId: string | null;
  taxRate: number;
  taxAmount: number;
  sellingPrice: number;
  marginAmount: number;
  marginPct: number;
  currency: string;
}

export interface StoreVariant {
  id: string;
  catalogVariantId: string;
  name: string;
  colour: string;
  colourHex: string;
  size: string;
  sku: string;
  baseCost: number;
  price: number;
  enabled: boolean;
  availability: "in_stock" | "low_stock" | "out_of_stock";
  /** Shipping weight in grams. Absent counts as 0 for weight-based rates. */
  weightGrams?: number;
}

export interface StoreProduct {
  id: string;
  storeId: string;
  catalogProductId: string;
  supplierId: string;
  name: string;
  slug: string;
  /**
   * Store-level SKU, unique inside the store. Absent on records imported before
   * SKUs existed — `storeSku()` derives a stable one for those.
   */
  sku?: string;
  description: string;
  /** Search and share title and description. Empty or absent uses the name and description. */
  seoTitle?: string;
  seoDescription?: string;
  tags: string[];
  category: "apparel" | "drinkware";
  status: "draft" | "in_review" | "published" | "archived";
  /** Set when the platform itself took the product off the storefront. */
  unpublishedReason?: "artwork_changed" | "preflight_failed" | null;
  visibility: "public" | "hidden";
  price: number;
  currency: string;
  taxBracketId: string | null;
  variants: StoreVariant[];
  artworks: Artwork[];
  mockups: MockupImage[];
  shopperCustomization: {
    artworkUpload: boolean;
    textLine: boolean;
    textLabel: string;
    maxTextLength: number;
  };
  costs: CostBreakdown;
  /** Name, description, option labels and colours in the store's other languages. */
  translations?: FieldTranslations;
  /**
   * A gift card the store sells: each variant is one denomination, and paying
   * for it issues a code by email instead of sending a job to a supplier.
   */
  giftCard?: boolean;
  importedBy: string;
  importedAt: string;
  /**
   * Idempotency key of the copy that created this record. A resubmitted import
   * — double click, refresh, stale tab — finds the record it already made
   * instead of copying the same supplier product twice.
   */
  importKey?: string | null;
  /**
   * Set on products brought over from another platform. They have no supplier
   * listing or print artwork: the imported photos are the product's images.
   */
  imported?: { platform: "shopify"; handle: string; importId: string } | null;
  /**
   * Set on an imported product the store ships itself. `unitCost` (minor
   * units) is what one unit costs the store, and the imported photos stand in
   * for mockups. An imported product linked to a shared-catalog product
   * instead carries that product's id in `catalogProductId`.
   */
  merchantFulfilled?: { unitCost: number; markedBy: string; markedAt: string } | null;
  /**
   * Set on products copied in from an accepted bulk quote. Orders for them are
   * never sent to a supplier API: a buyer raises the purchase order by hand.
   */
  manualFulfilment?: {
    quoteRequestId: string;
    quoteCode: string;
    supplierLabel: string;
    unitCost: number;
    minimumOrderQuantity: number;
  } | null;
  updatedAt: string;
  publishedAt: string | null;
}

/**
 * A hand-picked group of a store's products, shown on the storefront at
 * `/collections/<handle>`. Products are listed in `productIds` order, and a
 * product can belong to any number of collections. Name and description are
 * written in the store's default language with translations beside them.
 */
export interface ProductCollection {
  id: string;
  storeId: string;
  name: string;
  /** The address segment, unique within the store. */
  handle: string;
  description: string;
  imageUrl: string | null;
  productIds: string[];
  /** Order among the store's collections, lowest first. */
  position: number;
  translations?: FieldTranslations;
  /** The key of the form that created it, so a resubmission finds it again. */
  submissionKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxBracket {
  id: string;
  name: string;
  code: string;
  rate: number;
  description: string;
  regions: string[];
  createdAt: string;
}

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_production"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "exception";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  in_production: "In production",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  exception: "Exception",
};

/** What a redeemed discount code took off one order. */
export interface OrderDiscount {
  codeId: string;
  code: string;
  kind: DiscountKind;
  /** Whole percent, or minor units of the order currency for a fixed amount. */
  value: number;
  /** Amount taken off the goods subtotal, in the order currency. */
  amount: number;
}

/** Moves the store team may make by hand. Exceptions are raised and resolved by their own actions. */
const ORDER_STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["cancelled"],
  paid: ["in_production", "cancelled"],
  in_production: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  exception: ["paid", "in_production", "shipped", "delivered", "cancelled"],
};

/** A captured payment is only cancelled through the refund form, so the money goes back too. */
export function canMoveOrder(
  order: Pick<Order, "status"> & { payment: Pick<Order["payment"], "status"> },
  to: OrderStatus,
): boolean {
  if (to === "cancelled" && order.payment.status === "succeeded") return false;
  return ORDER_STATUS_NEXT[order.status].includes(to);
}

export interface OrderItem {
  id: string;
  storeProductId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  supplierCost: number;
  /**
   * Per unit, from the product's costs when the order was placed, in the same
   * currency as `supplierCost`. Absent on orders placed before they were kept:
   * analytics reads the product's current costs for those.
   */
  customizationCost?: number;
  shippingCost?: number;
  customization: {
    artworkUrl: string | null;
    artworkFileName: string | null;
    /** How the shopper placed the artwork, for the production job. */
    artworkPlacement?: ArtworkPlacement | null;
    text: string | null;
    previewUrl: string | null;
    previewOverlay?: PreviewOverlay | null;
  };
  supplierId: string;
}

export interface FulfillmentEvent {
  at: string;
  status: string;
  note: string;
  actor: string;
}

export interface Order {
  id: string;
  storeId: string;
  code: string;
  status: OrderStatus;
  /** The presentment currency: what the shopper saw and was charged in. Every amount on the order is in it. */
  currency: string;
  /**
   * The store's own currency at the time, the total in it, and the rate used
   * (presentment units per shop unit). Absent on orders placed before
   * multi-currency pricing and on imported orders.
   */
  shopCurrency?: string;
  shopTotal?: number;
  exchangeRate?: number;
  /** Set on orders brought over from another platform: its order name, such as `#1001`. */
  imported?: { platform: "shopify"; name: string; importId: string } | null;
  /** The language the shopper checked out in. Emails about the order use it. */
  locale?: string;
  customer: {
    name: string;
    email: string;
    line1: string;
    line2?: string;
    city: string;
    /** State, province or prefecture, for countries whose addresses have one. */
    region?: string;
    postalCode: string;
    country: string;
    /** For the carrier; optional at checkout. */
    phone?: string;
    /** Set once the shopper's personal data was deleted. Name, email and address are blanked then. */
    anonymisedAt?: string;
  };
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  /** The shipping rate chosen at checkout. Absent on orders placed before shipping zones. */
  shippingRate?: OrderShippingRate | null;
  /**
   * How tax was charged. Absent on orders placed before tax settings; read it
   * through `orderTax()`.
   */
  tax?: { mode: TaxMode; inclusive: boolean } | null;
  /**
   * The gift card the shopper paid part or all of the order with. The amount is
   * already out of `total` and is held on the card until payment settles.
   */
  giftCard?: OrderGiftCard | null;
  /**
   * The code the shopper redeemed and what it took off, absent on orders placed
   * without one. `amount` is already out of `total`, so a refund capped at the
   * total can never give back more than was charged.
   */
  discount?: OrderDiscount | null;
  taxAmount: number;
  /** The single rate when the whole order sat in one bracket, otherwise 0. */
  taxRate: number;
  /** One entry per rate charged. Absent on orders placed before per-line tax. */
  taxLines?: { rate: number; amount: number }[];
  total: number;
  payment: {
    provider: "stripe";
    status: "requires_payment" | "succeeded" | "failed" | "refunded";
    paymentIntentId: string | null;
    stripeAccountId: string | null;
    last4: string | null;
    failureMessage: string | null;
    paidAt: string | null;
    /** The Stripe Checkout session the shopper paid through. Absent on simulated demo payments. */
    checkoutSessionId?: string | null;
    checkoutUrl?: string | null;
  };
  /** The basket the order was placed from, emptied once payment is confirmed. */
  cartId?: string | null;
  fulfillment: {
    supplierId: string | null;
    supplierName: string | null;
    routing: "pending" | "submitted" | "manual_required" | "failed";
    supplierOrderRef: string | null;
    submittedAt: string | null;
    submissionMessage: string | null;
    carrier: "dhl" | "fedex" | "ups" | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    exception: string | null;
    /**
     * Set when an order manager moved production off the supplier the items
     * were sourced from — an out-of-region destination is the usual reason.
     * Routing re-runs against this choice rather than the item mapping, so a
     * later "re-run routing" cannot quietly undo the decision.
     */
    reroute?: {
      fromSupplierId: string | null;
      fromSupplierName: string | null;
      reason: string;
      actor: string;
      at: string;
    } | null;
  };
  /** `gatewayRefundId` is absent on refund rows recorded before gateway refunds. */
  refunds: {
    id: string;
    amount: number;
    reason: string;
    at: string;
    actor: string;
    gatewayRefundId?: string;
  }[];
  events: FulfillmentEvent[];
  /**
   * The stock this order holds on tracked variants. Reserved when checkout
   * starts, committed (taken off hand) once payment lands, released when the
   * payment never comes. Absent when nothing on the order was tracked.
   */
  inventory?: OrderInventory | null;
  /** Set on the orders a gift campaign produced, absent on ordinary shopper orders. */
  campaign?: {
    campaignId: string;
    campaignCode: string;
    campaignName: string;
    catalogueId: string;
    recipientId: string;
  } | null;
  /** The store team's own note. Never shown to the shopper. */
  note?: string;
  tags?: string[];
  /** Parcels handed to a carrier, oldest first. Absent on orders shipped before partial fulfilment. */
  shipments?: OrderShipment[];
  /** Whether the shopper agreed at checkout to emails from the store. */
  marketingConsent?: boolean;
  /** Set when the Checkout session expired unpaid. */
  abandoned?: OrderAbandonment | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One parcel: which units of which lines went in it, and how to track it. */
export interface OrderShipment {
  id: string;
  carrier: "dhl" | "fedex" | "ups";
  trackingNumber: string;
  trackingUrl: string;
  lines: { itemId: string; quantity: number }[];
  at: string;
  actor: string;
}

export interface OrderAbandonment {
  at: string;
  /** When the recovery email went out; null until then. */
  recoveryEmailAt: string | null;
  /** Set once the shopper paid for the basket after all. */
  recoveredAt: string | null;
  recoveredOrderId?: string | null;
}

export interface OrderInventory {
  state: "reserved" | "committed" | "released";
  lines: { productId: string; variantId: string; quantity: number }[];
  /** Set once a refund put the units back on hand. */
  restockedAt?: string | null;
}

/* ----------------------------------------------------------- inventory */

/** What happens once a tracked variant has no stock left. */
export type InventoryPolicy = "deny" | "continue";

/**
 * Stock of one store variant, kept beside the product rather than inside its
 * variants array, so a save of the product's variants can never overwrite a
 * count a checkout changed meanwhile. A variant without a level is not tracked.
 * Available is `onHand - committed`.
 */
export interface InventoryLevel {
  /** `<productId>:<variantId>`. */
  id: string;
  storeId: string;
  productId: string;
  variantId: string;
  tracked: boolean;
  policy: InventoryPolicy;
  onHand: number;
  /** Units held by checkouts in progress and paid orders not yet taken off hand. */
  committed: number;
  updatedAt: string;
}

export type InventoryReason = "correction" | "received" | "damaged" | "import" | "sold" | "restock";

/** One change to a variant's units on hand. */
export interface InventoryAdjustment {
  id: string;
  storeId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  delta: number;
  onHandAfter: number;
  reason: InventoryReason;
  /** The order code for sales and restocks. */
  reference: string | null;
  actorId: string;
  actorName: string;
  at: string;
}

/* ----------------------------------------------------------- customers */

export interface CustomerNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  at: string;
}

/**
 * A store's view of one shopper, built from that store's orders and keyed by
 * email within the store: the same address in two stores is two customers.
 * Every figure is recomputed from the orders whenever one changes, so the
 * record never drifts from them; only `notes` is the team's own.
 */
export interface Customer {
  id: string;
  storeId: string;
  /** Lowercased. Unique within the store. */
  email: string;
  /** From the most recent order. */
  name: string;
  country: string;
  firstOrderAt: string;
  lastOrderAt: string;
  orderCount: number;
  /** Paid orders less refunds, in `currency` (the store's default) and minor units. */
  lifetimeSpend: number;
  refundedTotal: number;
  refundCount: number;
  currency: string;
  /** The language and currency the shopper checks out in most often. */
  preferredLanguage: string;
  preferredCurrency: string;
  notes: CustomerNote[];
  /** The shopper's sign-in account, once they have signed in to this store. */
  account?: { userId: string; linkedAt: string; lastSignInAt: string } | null;
  /** Addresses saved from the account page; the default one prefills checkout. */
  addresses?: CustomerAddress[];
  /** Whether the shopper agreed to marketing email, and when they last said so. */
  marketing?: { subscribed: boolean; updatedAt: string } | null;
  /** Set on customers brought over from another platform, by the import that last wrote them. */
  imported?: { platform: "shopify"; importId: string } | null;
  anonymisedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------- gifting */

/**
 * A private gift catalogue a store runs for one company.
 *
 * It is a curated view of the store's own published products — never a separate
 * catalog — plus the rules the company buys under: who may open it, how much may
 * be spent on each recipient, and who signs a campaign off before it is paid for.
 */
export interface GiftCatalogue {
  id: string;
  storeId: string;
  /** Company-facing name, e.g. "Northwind employee gifting". */
  name: string;
  /** Web address of the portal: /g/[slug]. Unique across the platform. */
  slug: string;
  companyName: string;
  intro: string;
  /** The intro in the store's other languages. */
  translations?: FieldTranslations;
  status: "active" | "paused";
  /** `link` opens for anyone holding the private link; `invite` for listed addresses. */
  access: "link" | "invite";
  /**
   * Rotated when the private link is regenerated. Every access token is derived
   * from it, so regenerating closes every link handed out so far.
   */
  accessSecret: string;
  invitedEmails: string[];
  /** Store products offered in the catalogue. Unpublished ones simply drop out. */
  productIds: string[];
  /** Per recipient, in `currency`. Zero means no limit. */
  spendLimitPerRecipient: number;
  currency: string;
  approvalRequired: boolean;
  approverName: string;
  approverEmail: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus =
  | "awaiting_approval"
  | "approved"
  | "declined"
  | "ordered"
  | "cancelled";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  awaiting_approval: "Awaiting approval",
  approved: "Approved, awaiting payment",
  declined: "Declined",
  ordered: "Ordered",
  cancelled: "Cancelled",
};

/** One person on a campaign list: what they get and where it goes. */
export interface CampaignRecipient {
  id: string;
  name: string;
  email: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
  size: string;
  note: string;
  storeProductId: string;
  productName: string;
  variantId: string;
  variantName: string;
  quantity: number;
  /** Unit price in the campaign currency at the time the list was submitted. */
  unitPrice: number;
  /** Set once the campaign is paid for and the per-recipient order exists. */
  orderId: string | null;
  orderCode: string | null;
}

/**
 * A bulk gift order. One campaign becomes one payment and one order per
 * recipient, all carrying the campaign so the store can work fulfilment and
 * exceptions for the whole programme at once.
 */
export interface GiftCampaign {
  id: string;
  storeId: string;
  catalogueId: string;
  code: string;
  name: string;
  status: CampaignStatus;
  currency: string;
  buyer: { name: string; email: string };
  recipients: CampaignRecipient[];
  spendLimitPerRecipient: number;
  totals: {
    subtotal: number;
    shipping: number;
    taxAmount: number;
    taxLines: { rate: number; amount: number }[];
    total: number;
  };
  approval: {
    required: boolean;
    approverName: string;
    approverEmail: string;
    /**
     * When the list was first put in front of an approver. Campaigns written
     * before this was recorded fall back to `createdAt`, which is the same
     * instant for every one of them.
     */
    requestedAt?: string | null;
    /** When the request last went out, first send or chase. */
    lastRequestedAt?: string | null;
    /** How many times the store team has sent the request again. */
    remindersSent?: number;
    decidedBy: string | null;
    decidedAt: string | null;
    note: string | null;
  };
  payment: {
    status: "unpaid" | "succeeded";
    paymentIntentId: string | null;
    last4: string | null;
    paidAt: string | null;
    /** The open Stripe Checkout session, while the buyer is paying on a live store. */
    checkoutSessionId?: string | null;
    stripeAccountId?: string | null;
  };
  events: FulfillmentEvent[];
  /** Idempotency key of the payment, shared by every order it created. */
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  storeProductId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  artworkUrl: string | null;
  artworkFileName: string | null;
  /** The placement the shopper approved, carried through to the order. */
  artworkPlacement?: ArtworkPlacement | null;
  text: string | null;
  previewUrl: string | null;
  previewOverlay?: PreviewOverlay | null;
}

/**
 * Set on a personalised line whose composited preview could not be drawn, so
 * `previewUrl` is the plain photo of the chosen colour. Thumbnails draw the
 * shopper's text and artwork over it inside this print area instead.
 */
export interface PreviewOverlay {
  rect: Rect;
  textColour: string;
}

export interface Cart {
  id: string;
  storeId: string;
  sessionId: string;
  items: CartItem[];
  currency: string;
  /** The code the shopper entered, re-checked on every render and at payment. */
  discountCode?: string | null;
  /** The gift card code the shopper entered, re-checked on every render and at payment. */
  giftCardCode?: string | null;
  /** The last few adds that were folded into an existing line, so a resubmission is not counted twice. */
  addKeys?: string[];
  updatedAt: string;
}

export type DiscountKind = "percentage" | "fixed";

/**
 * A code a store's administrators hand out, redeemed in the basket or at
 * checkout.
 *
 * `value` is a whole percentage for a `percentage` code and minor units of
 * `currency` for a `fixed` one; `minimumSubtotal` is in `currency` too, and both
 * are converted into whatever the shopper is buying in. A `usageLimit` of null
 * means unlimited — `timesUsed` is only ever advanced by a guarded write, so two
 * shoppers checking out at once cannot push it past the limit.
 */
export interface DiscountCode {
  id: string;
  storeId: string;
  /** Upper-case and unique within the store; what the shopper types. */
  code: string;
  kind: DiscountKind;
  value: number;
  currency: string;
  /** 0 for no minimum. */
  minimumSubtotal: number;
  /** End of the last day the code works, or null for no expiry. */
  expiresAt: string | null;
  usageLimit: number | null;
  timesUsed: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Craft.js serialised node tree for a storefront page. */
export type CraftNodes = Record<string, unknown>;

export interface StorefrontVersion {
  id: string;
  /** The name it was given; empty when none was, and the panel labels it. */
  label: string;
  /** Older entries were all published versions. */
  kind?: "published" | "draft";
  data: CraftNodes;
  savedAt: string;
  savedBy: string;
}

export interface Storefront {
  id: string;
  storeId: string;
  draft: CraftNodes;
  published: CraftNodes | null;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  history: StorefrontVersion[];
}

export type AuditCategory =
  | "store_setup"
  | "product_import"
  | "pricing"
  | "ai"
  | "publishing"
  | "order_routing"
  | "administration"
  | "team"
  | "gifting"
  | "sourcing"
  | "email"
  | "discounts"
  | "customers"
  | "inventory";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  store_setup: "Store setup",
  product_import: "Product import",
  pricing: "Pricing",
  ai: "AI approval",
  publishing: "Publishing",
  order_routing: "Order routing",
  administration: "Administration",
  team: "Team",
  gifting: "Gifting",
  sourcing: "Sourcing",
  email: "Email",
  discounts: "Discount codes",
  customers: "Customers",
  inventory: "Inventory",
};

export interface AuditLog {
  id: string;
  category: AuditCategory;
  action: string;
  summary: string;
  storeId: string | null;
  agencyId: string | null;
  actorId: string;
  actorName: string;
  entity: string | null;
  entityId: string | null;
  meta: Record<string, string | number | boolean | null>;
  at: string;
}

export type SuggestionKind = "product_idea" | "supplier" | "description" | "tags" | "price";

export interface AiSuggestion {
  id: string;
  storeId: string;
  productId: string | null;
  kind: SuggestionKind;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "dismissed";
  createdBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  /** The product's name when the suggestion was drafted, so history still names it if the product is renamed or removed. */
  productName?: string | null;
  /** A newer pending suggestion of the same kind for the same product. */
  supersededBy?: string | null;
  supersededAt?: string | null;
}

/**
 * A plan enquiry left on the public pricing page: someone who wants a workspace
 * opened on a plan, or a conversation about the enterprise agreement. It is a
 * sales record, not an account — nothing here creates an agency or a login.
 */
export interface PlanEnquiry {
  id: string;
  /** Which plan card the visitor arrived from, or "unsure". */
  plan: string;
  name: string;
  email: string;
  company: string;
  /** What they wrote, including whether they need a gifting programme. */
  message: string;
  /** Set when the visitor asked to be called rather than emailed back. */
  wantsCall: boolean;
  /**
   * The form's own key, unique per filled-in form. A retried or double
   * submission carries the same one, so the enquiry is recorded once.
   */
  submissionKey: string;
  /** The language of the page the form was sent from; absent on older enquiries. */
  locale?: string;
  /** The currency the plan is billed in; absent on older enquiries, which were all US dollars. */
  currency?: "USD" | "EUR";
  status: "new";
  createdAt: string;
}

/**
 * A bulk sourcing enquiry (request for quote), raised against a catalog item or
 * described in the store's own words.
 *
 * It belongs to the store that asked, not to the person: whoever picks the
 * enquiry up next needs the run size, the destination and what was answered.
 * Nothing here places an order — a quote the store accepts is copied into the
 * store as a draft product flagged for manual fulfilment, because the
 * marketplace has no order submission API.
 */
export type QuoteRequestStatus = "submitted" | "quoted" | "accepted" | "declined" | "withdrawn";

/** One price a supplier sent back. An enquiry can collect several. */
export interface SupplierQuote {
  id: string;
  /** The factory or seller that quoted, as named on the marketplace. */
  supplierLabel: string;
  /** Shared-catalog item the store copy is built on: variants, print areas, mockups. */
  baseCatalogProductId: string;
  /** Quoted cost per unit at the requested quantity, in minor units. */
  unitCost: number;
  minimumOrderQuantity: number;
  /** Days from a confirmed purchase order to goods leaving the factory. */
  leadTimeDays: number;
  /** ISO date the quote lapses, or "" when the supplier gave no expiry. */
  validUntil: string;
  notes: string;
  recordedBy: string;
  recordedAt: string;
}

export interface QuoteRequest {
  id: string;
  /** Human reference used in the queue and in supplier correspondence. */
  code: string;
  storeId: string;
  storeName: string;
  agencyId: string | null;
  /** The catalog item the enquiry refers to, or null when it was described in free text. */
  catalogProductId: string | null;
  /** Named as it stood when the request was raised. */
  productName: string;
  /** The buyer's own description of the product, "" when the reference says it all. */
  description: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  quantity: number;
  /** The destination market the run is delivered to. */
  destination: string;
  /** What the buyer hopes to pay per unit, in minor units, or null. */
  targetUnitCost: number | null;
  /** ISO date the goods are needed by, or "". */
  neededBy: string;
  /** Decoration needed, plus packaging and material notes for the factory. */
  customisation: string;
  contactName: string;
  contactEmail: string;
  requestedById: string;
  requestedBy: string;
  /**
   * The form's own key, unique per filled-in form. A double click or a retried
   * submission carries the same one, so the request is recorded once.
   */
  submissionKey: string;
  status: QuoteRequestStatus;
  quotes: SupplierQuote[];
  /** Set once the store accepts one of `quotes`. */
  acceptedQuoteId: string | null;
  declineReason: string | null;
  /** The store product the accepted quote was copied into. */
  storeProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------- customer accounts */

export interface CustomerAddress {
  id: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
  isDefault: boolean;
}

/* ------------------------------------------------------------ content */

export type ContentKind = "page" | "post";

/**
 * A page (About, FAQ, Contact) or a blog post. The body is rich text written in
 * the editor and kept as sanitised HTML; every shopper-facing field has a
 * translation per language beside it, keyed by field name.
 */
export interface ContentEntry {
  id: string;
  storeId: string;
  kind: ContentKind;
  title: string;
  /** The address segment, unique per kind within the store. */
  handle: string;
  /** Sanitised HTML. */
  body: string;
  /** A short summary for the blog list and previews. */
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string | null;
  status: "draft" | "published";
  translations?: FieldTranslations;
  authorName: string;
  submissionKey?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Where a menu link goes. */
export type MenuLinkKind = "home" | "products" | "collection" | "product" | "page" | "blog" | "post" | "url";

export interface MenuItem {
  id: string;
  label: string;
  kind: MenuLinkKind;
  /** The collection, product, page or post id for those kinds. */
  targetId: string | null;
  /** An absolute address for `url`. */
  url: string | null;
  /** The label in the store's other languages. */
  translations?: FieldTranslations;
}

export interface StoreMenus {
  header: MenuItem[];
  footer: MenuItem[];
  updatedAt: string;
}

/* --------------------------------------------------------- gift cards */

/** What a gift card took off one order. */
export interface OrderGiftCard {
  cardId: string;
  last4: string;
  /** In the order currency. */
  amount: number;
  /** In the card's own currency, the amount held on the card. */
  cardAmount: number;
}

export interface GiftCardTransaction {
  id: string;
  /** Negative when spent, positive when issued, given back or topped up. */
  amount: number;
  kind: "issued" | "redeemed" | "released" | "adjusted";
  orderCode: string | null;
  note: string;
  actorName: string;
  at: string;
}

/**
 * A gift card. The balance only moves through guarded writes: a checkout holds
 * the amount it uses (so two baskets cannot both spend the last of it), and the
 * hold is taken for good when payment lands or given back when it does not.
 */
export interface GiftCard {
  id: string;
  storeId: string;
  /** Upper-case, grouped in fours, unique within the store. */
  code: string;
  last4: string;
  currency: string;
  initialValue: number;
  balance: number;
  status: "active" | "disabled";
  source: "purchase" | "manual";
  /** The order that bought it, for purchased cards. */
  orderId: string | null;
  orderCode: string | null;
  /** The order line it was bought on, so a webhook delivered twice issues it once. */
  orderItemKey: string | null;
  recipientEmail: string;
  recipientName: string;
  note: string;
  /** Amounts held by checkouts in progress. */
  holds: { orderId: string; amount: number }[];
  transactions: GiftCardTransaction[];
  expiresAt: string | null;
  createdBy: string;
  submissionKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------ reviews */

export type ReviewStatus = "pending" | "approved" | "rejected";

/** A verified buyer's review of a product, shown once the store approves it. */
export interface ProductReview {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  orderId: string;
  orderCode: string;
  /** As the shopper wants it shown: first name and initial. */
  authorName: string;
  email: string;
  rating: number;
  title: string;
  body: string;
  locale: string;
  status: ReviewStatus;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------ redirects */

/** A permanent redirect from an old address on the store's own domain. */
export interface UrlRedirect {
  id: string;
  storeId: string;
  /** `/products/old-handle`, `/collections/…` or `/pages/…`, lowercased. Unique within the store. */
  path: string;
  /** A path on the storefront, such as `/products/new-handle`. */
  target: string;
  source: "shopify_import" | "manual";
  createdAt: string;
}
