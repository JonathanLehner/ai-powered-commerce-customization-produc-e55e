import type { AbstractIntlMessages } from "next-intl";

/**
 * The message namespaces the workspace's client components read. Only these
 * are sent to the browser, and only for the part of the workspace on screen:
 * every message there is, server and shopper copy included, was 160 KB on each
 * workspace page.
 *
 * The shell's are sent on every page, for the header, the navigation and the
 * error screens. A section's are added by `ClientMessages` in the section's
 * layout (or page), or by `WorkspaceDocument` for a whole surface.
 * `npm run client-messages-check` fails when a client component asks for a
 * namespace its section does not send.
 */
export const SHELL_NAMESPACES = ["common", "fallback", "notifications", "roles", "shell"];

export const SECTION_NAMESPACES = {
  dashboard: ["analytics", "dashboard"],
  people: ["people", "team"],
  newStore: ["labels", "newStore"],
  overview: ["analytics"],
  activity: ["audit", "labels", "pager"],
  analytics: ["analytics"],
  assistant: ["assistant", "labels"],
  catalog: ["artworkIssues", "catalog", "collections", "configurator", "importedFulfilment", "inventory", "labels", "productForms"],
  content: ["content"],
  customers: ["customers"],
  discounts: ["discounts"],
  domains: ["domains"],
  giftCards: ["giftCards"],
  gifting: ["gifting"],
  import: ["import"],
  orders: ["abandoned", "campaign", "labels", "orderDetail", "orders", "storefront.checkout"],
  setup: ["apiKeys", "labels", "settings", "storefront.policies", "webhooks"],
  shipping: ["labels", "shipping", "storefront.checkout"],
  sourcing: ["enquiries", "labels", "sourcing.filters", "sourcing.form"],
  storefront: ["editor"],
  team: ["team"],
  admin: ["admin.agencies", "admin.catalogForm", "admin.quoteDesk", "admin.suppliers", "admin.tax", "apiKeys", "audit", "labels", "pager"],
  login: ["auth"],
} satisfies Record<string, string[]>;

export type WorkspaceSection = keyof typeof SECTION_NAMESPACES;

/** What a page in `section` (or outside every section) sends to the browser. */
export function workspaceNamespaces(section?: WorkspaceSection): string[] {
  return section ? [...SHELL_NAMESPACES, ...SECTION_NAMESPACES[section]] : SHELL_NAMESPACES;
}

/** The named namespaces of `messages`, nested as they are in the full set. */
export function pickMessages(messages: object, namespaces: readonly string[]): AbstractIntlMessages {
  type Tree = Record<string, unknown>;
  const picked: Tree = {};
  for (const namespace of namespaces) {
    const path = namespace.split(".");
    let source: unknown = messages;
    for (const key of path) source = source && typeof source === "object" ? (source as Tree)[key] : undefined;
    if (source === undefined) continue;
    let target = picked;
    for (const key of path.slice(0, -1)) target = (target[key] ??= {}) as Tree;
    target[path[path.length - 1]] = source;
  }
  return picked as AbstractIntlMessages;
}
