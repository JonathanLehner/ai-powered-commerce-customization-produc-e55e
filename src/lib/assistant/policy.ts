/**
 * What the chat assistant may do for the person using it, and which of its
 * calls wait for that person's explicit confirmation.
 *
 * The assistant has no edit paths of its own: it calls the Admin API's store
 * operations (`API_OPERATIONS`), in-process, as the signed-in person. This
 * module turns the person's store role into the API scopes they would need,
 * the way the workspace's own pages and server actions ask for capabilities,
 * and classifies each operation. Pure, so `npm run assistant-chat-check`
 * exercises it without a database.
 */
import type { ApiAccess, ApiResource, ApiScope } from "../api-scopes";
import { roleCan, type Capability } from "../store-access";
import type { StoreRole } from "../types";

/**
 * The capability each area needs to read and to change, matching the pages
 * and server actions of the workspace. Areas left out are never offered to
 * the assistant: API keys and webhook secrets, the agency beyond the store,
 * and the person's own account.
 */
export const RESOURCE_CAPABILITIES: Partial<Record<ApiResource, { read: Capability; write: Capability | null }>> = {
  products: { read: "store.view", write: "store.catalog" },
  collections: { read: "store.view", write: "store.catalog" },
  reviews: { read: "store.view", write: "store.catalog" },
  sourcing: { read: "store.catalog", write: "store.catalog" },
  assistant: { read: "store.catalog", write: "store.catalog" },
  orders: { read: "store.view", write: "store.orders" },
  customers: { read: "store.orders", write: "store.orders" },
  storefront: { read: "store.storefront", write: "store.storefront" },
  content: { read: "store.view", write: "store.storefront" },
  store: { read: "store.view", write: "store.settings" },
  discounts: { read: "store.settings", write: "store.settings" },
  gift_cards: { read: "store.settings", write: "store.settings" },
  domains: { read: "store.settings", write: "store.settings" },
  gifting: { read: "store.gifting", write: "store.gifting" },
  team: { read: "store.team", write: "store.team" },
  analytics: { read: "store.view", write: null },
  activity: { read: "store.view", write: null },
};

/**
 * Areas that are not offered in chat to anyone, whatever their role, and the
 * workspace page where each is done instead. The assistant links there rather
 * than blaming the person's role.
 */
export function elsewhereInWorkspace(storeId: string): { areas: string; links: { name: string; href: string }[] }[] {
  return [
    { areas: "API keys", links: [{ name: "API keys", href: `/app/stores/${storeId}/setup/api-keys` }] },
    { areas: "webhooks", links: [{ name: "Webhooks", href: `/app/stores/${storeId}/setup/webhooks` }] },
    { areas: "billing, the plan and upgrades", links: [{ name: "Billing", href: "/app/billing" }] },
    { areas: "the agency's other stores and people", links: [{ name: "People", href: "/app/people" }] },
    { areas: "the person's own account and notifications", links: [] },
  ];
}

/** The area outside chat a scope belongs to, as `elsewhereInWorkspace` names it, or null when chat covers it. */
export function elsewhereFor(scope: string, storeId: string) {
  const resource = scope.split(":")[0];
  if (resource in RESOURCE_CAPABILITIES) return null;
  const all = elsewhereInWorkspace(storeId);
  if (resource === "keys") return all[0];
  if (resource === "webhooks") return all[1];
  if (resource === "agency") return { areas: `${all[2].areas}, ${all[3].areas}`, links: [...all[2].links, ...all[3].links] };
  return all[4];
}

export interface AssistantGrant {
  role: StoreRole;
  /** The agency's trial has ended: the store opens read-only. */
  readOnly: boolean;
  /** Platform oversight only: the assistant is not offered. */
  viaPlatform: boolean;
}

/** The scopes the assistant acts with for this person: exactly what their role allows them in the workspace. */
export function assistantScopes(grant: AssistantGrant): ApiScope[] {
  if (grant.viaPlatform) return [];
  const scopes: ApiScope[] = [];
  for (const [resource, needs] of Object.entries(RESOURCE_CAPABILITIES) as [ApiResource, { read: Capability; write: Capability | null }][]) {
    if (!grant.readOnly && needs.write && roleCan(grant.role, needs.write)) scopes.push(`${resource}:write`);
    else if (roleCan(grant.role, needs.read)) scopes.push(`${resource}:read`);
  }
  return scopes;
}

/** Whether `scopes` let the assistant run an operation needing `scope`. A write scope also reads. */
export function scopeGranted(scopes: readonly string[], scope: string): boolean {
  const [resource, access] = scope.split(":") as [ApiResource, ApiAccess];
  if (!(resource in RESOURCE_CAPABILITIES)) return false;
  return scopes.includes(`${resource}:write`) || (access === "read" && scopes.includes(`${resource}:read`));
}

/**
 * Operations the assistant is never given: those that take a file's bytes,
 * which a chat cannot pass, and those that hand the person to a payment
 * provider's own onboarding.
 */
export const EXCLUDED_OPERATIONS = new Set([
  "uploadFile",
  "uploadStorefrontImage",
  "importInventory",
  "previewShopifyImport",
  "createShopifyImport",
  "startStripeOnboarding",
  "exportCustomer",
]);

/**
 * Changes that only touch the storefront draft (shoppers see nothing until it
 * is published) or that only draft something for review. These run straight
 * away; the draft ones can be undone from the version history.
 */
export const DRAFT_OPERATIONS = new Set([
  "addStorefrontSection",
  "updateStorefrontSection",
  "moveStorefrontSection",
  "duplicateStorefrontSection",
  "removeStorefrontSection",
  "updateStorefrontSiteContent",
  "updateStorefrontLayout",
  "updateProductPageTemplate",
  "translateStorefrontDraft",
  "applyTemplate",
  "saveStorefrontDraft",
  "restoreStorefrontVersion",
  "revertStorefront",
]);

const UNCONFIRMED_WRITES = new Set([
  ...DRAFT_OPERATIONS,
  // A new product starts as a draft, off the storefront.
  "createProduct",
  // Suggestions are stored as pending; nothing changes until one is applied.
  "requestProductIdeas",
  "requestProductCopy",
  "requestPriceSuggestion",
  "requestSupplierSuggestion",
]);

/** Why a call waits for confirmation. Each has a label in `assistantChat.reasons`. */
export type ConfirmReason = "publish" | "irreversible" | "price" | "email" | "payment" | "live";

const PUBLISHES = new Set(["publishStorefront", "updateProductStatus", "setGiftCatalogueStatus", "updateStoreStatus", "updateTheme"]);
const PRICES = new Set([
  "updateVariants",
  "bulkUpdateProducts",
  "createDiscount",
  "updateDiscount",
  "applySuggestion",
  "updateCurrencyRates",
  "refreshExchangeRates",
  "issueGiftCard",
]);
const EMAILS = new Set([
  "inviteTeamMember",
  "resendTeamInvitation",
  "issueGiftCard",
  "fulfilOrder",
  "updateOrderStatus",
  "bulkShipOrders",
  "bulkUpdateOrderStatus",
  "refundOrder",
  "createGiftCampaign",
  "resendGiftCampaignApproval",
  "changeGiftCampaignApprover",
  "decideGiftCampaign",
  "createQuoteRequest",
]);
const PAYMENTS = new Set(["refundOrder", "payGiftCampaign", "acceptQuote"]);

export interface OperationTraits {
  id: string;
  method: string;
  scope: string;
  destructive?: boolean;
}

/**
 * Why this call has to be confirmed by the person, or an empty list when it
 * may run straight away: reads, draft edits and drafted suggestions.
 * Everything else is irreversible or reaches shoppers, and waits.
 */
export function confirmReasons(operation: OperationTraits, args: Record<string, unknown>): ConfirmReason[] {
  const reads = operation.method === "GET" || operation.scope.endsWith(":read");
  if (reads) return [];
  if (UNCONFIRMED_WRITES.has(operation.id)) return [];
  if (operation.id === "createContent" && args.published !== true) return [];

  const reasons: ConfirmReason[] = [];
  if (PUBLISHES.has(operation.id) || args.published === true) reasons.push("publish");
  if (PRICES.has(operation.id) || ("price" in args && args.price !== undefined)) reasons.push("price");
  if (EMAILS.has(operation.id)) reasons.push("email");
  if (PAYMENTS.has(operation.id)) reasons.push("payment");
  if (operation.destructive || operation.method === "DELETE") reasons.push("irreversible");
  if (reasons.length === 0) reasons.push("live");
  return reasons;
}

/** Field names whose values are never handed to the model or shown in the chat. */
const SECRET_KEY = /secret|token|password|apikey|api_key|signingkey|signing_key|^key$|credential/i;

/** A copy of an operation's result with secret-looking fields blanked out, at any depth. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY.test(key) && entry !== null && entry !== undefined && typeof entry !== "boolean"
          ? "[hidden]"
          : redactSecrets(entry, depth + 1),
      ]),
    );
  }
  return value;
}
