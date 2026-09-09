/**
 * Domain model. The vocabulary follows Vendure's headless commerce concepts —
 * a Store is a Vendure Channel (its own catalog, customers, orders, currencies
 * and tax settings), products have variants, and tax brackets are global tax
 * rate definitions that a store product simply points at.
 */

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
  "Platform access shows operational status only. Shopper names, email addresses, delivery addresses and order values stay with the store team.";

/** What to call the access a person holds over a store, on badges and lists. */
export function storeAccessLabel(role: StoreRole, viaPlatform: boolean): string {
  return viaPlatform ? PLATFORM_ACCESS_LABEL : STORE_ROLE_LABELS[role];
}

export const STORE_ROLE_DESCRIPTIONS: Record<StoreRole, string> = {
  store_admin: "Full control of the store: settings, team, catalog, orders and publishing.",
  catalog_manager:
    "Import, customise, price and publish products, and run gift catalogues. No access to store settings.",
  order_manager: "Work orders, fulfilment, refunds and supplier exceptions. Read-only catalog.",
  viewer: "Read-only access to catalog, orders and analytics.",
};

export interface Agency {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "studio" | "scale";
  contactEmail: string;
  status: "active" | "suspended";
  createdAt: string;
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
  currencies: string[];
  defaultCurrency: string;
  customDomain: string | null;
  domainStatus: "unset" | "pending" | "verified";
  /**
   * Where a shopper with a problem reaches the seller. Both are absent on
   * stores saved before support contacts were part of setup, so read them
   * through `storeSupport()` rather than off the record.
   */
  supportEmail?: string | null;
  supportPhone?: string | null;
  stripe: {
    connected: boolean;
    accountId: string | null;
    country: string;
    chargesEnabled: boolean;
    connectedAt: string | null;
  };
  carriers: CarrierAccount[];
  defaultTaxBracketId: string | null;
  pricesIncludeTax: boolean;
  setup: StoreSetupState;
  createdAt: string;
  archivedAt: string | null;
}

export type ThemeKey = "atelier" | "meridian" | "graphite" | "bloom";

export const THEMES: Record<ThemeKey, { name: string; description: string; accent: string; surface: string; ink: string }> = {
  atelier: {
    name: "Atelier",
    description: "Editorial layout with generous whitespace — suits apparel drops.",
    accent: "#0d9488",
    surface: "#f8fafc",
    ink: "#0f172a",
  },
  meridian: {
    name: "Meridian",
    description: "Bold, high-contrast blocks for merch campaigns and launches.",
    accent: "#5b4bf5",
    surface: "#f5f3ff",
    ink: "#1e1b4b",
  },
  graphite: {
    name: "Graphite",
    description: "Restrained monochrome for corporate gifting catalogues.",
    accent: "#334155",
    surface: "#f1f5f9",
    ink: "#0f172a",
  },
  bloom: {
    name: "Bloom",
    description: "Warm and friendly — creator stores and community merch.",
    accent: "#e11d48",
    surface: "#fff1f2",
    ink: "#4c0519",
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
export type UploadScope = "artwork" | "mockup" | "logo" | "shopperArtwork" | "shopperPreview";

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
  tags: string[];
  category: "apparel" | "drinkware";
  status: "draft" | "in_review" | "published" | "archived";
  /** Set when the platform itself took the product off the storefront. */
  unpublishedReason?: "artwork_changed" | null;
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
  importedBy: string;
  importedAt: string;
  /**
   * Idempotency key of the copy that created this record. A resubmitted import
   * — double click, refresh, stale tab — finds the record it already made
   * instead of copying the same supplier product twice.
   */
  importKey?: string | null;
  updatedAt: string;
  publishedAt: string | null;
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

export interface OrderItem {
  id: string;
  storeProductId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  supplierCost: number;
  customization: {
    artworkUrl: string | null;
    artworkFileName: string | null;
    /** How the shopper placed the artwork, for the production job. */
    artworkPlacement?: ArtworkPlacement | null;
    text: string | null;
    previewUrl: string | null;
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
  currency: string;
  customer: {
    name: string;
    email: string;
    line1: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: OrderItem[];
  subtotal: number;
  shipping: number;
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
  };
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
  refunds: { id: string; amount: number; reason: string; at: string; actor: string }[];
  events: FulfillmentEvent[];
  /** Set on the orders a gift campaign produced, absent on ordinary shopper orders. */
  campaign?: {
    campaignId: string;
    campaignCode: string;
    campaignName: string;
    catalogueId: string;
    recipientId: string;
  } | null;
  idempotencyKey: string | null;
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
    decidedBy: string | null;
    decidedAt: string | null;
    note: string | null;
  };
  payment: {
    status: "unpaid" | "succeeded";
    paymentIntentId: string | null;
    last4: string | null;
    paidAt: string | null;
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
}

export interface Cart {
  id: string;
  storeId: string;
  sessionId: string;
  items: CartItem[];
  currency: string;
  updatedAt: string;
}

/** Craft.js serialised node tree for a storefront page. */
export type CraftNodes = Record<string, unknown>;

export interface StorefrontVersion {
  id: string;
  label: string;
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
  | "gifting";

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
  status: "new";
  createdAt: string;
}
