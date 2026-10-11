/**
 * Shop text: the built-in strings shoppers read (buttons, checkout labels,
 * order status messages, validation messages), as a store overrides them.
 *
 * The built-in copy is the `storefront` namespace of the messages files. A
 * store keeps its overrides per language, shaped like that namespace, and they
 * are merged over the messages at request time. Kept free of server imports so
 * the editor and the check scripts read it too.
 */
export const SHOP_TEXT_GROUPS = [
  { id: "product", groups: ["shop", "product", "purchase", "artwork"] },
  { id: "basket", groups: ["basket", "discount", "actions"] },
  { id: "checkout", groups: ["checkout", "payment"] },
  { id: "orderStatus", groups: ["order", "status"] },
  { id: "giftPortal", groups: ["gift"] },
] as const;

export type ShopTextPage = (typeof SHOP_TEXT_GROUPS)[number]["id"];

/** Overrides for one language, shaped like the `storefront` messages: `{ checkout: { pay: "…" } }`. */
export type ShopTextOverrides = Record<string, Record<string, string>>;

const EDITABLE = new Set<string>(SHOP_TEXT_GROUPS.flatMap((page) => page.groups));

/** `checkout.pay` is editable; `email.subject` and `nope.x` are not. */
export function isShopTextKey(key: string, storefront: Record<string, unknown>): boolean {
  const [group, name, ...rest] = key.split(".");
  if (rest.length > 0 || !group || !name || !EDITABLE.has(group)) return false;
  const section = storefront[group];
  return !!section && typeof section === "object" && typeof (section as Record<string, unknown>)[name] === "string";
}

/** Every editable string, per page, as `{ key: "checkout.pay", text: "Pay" }`. */
export function shopTextEntries(
  storefront: Record<string, unknown>,
): { page: ShopTextPage; key: string; text: string }[] {
  const out: { page: ShopTextPage; key: string; text: string }[] = [];
  for (const page of SHOP_TEXT_GROUPS) {
    for (const group of page.groups) {
      const section = storefront[group];
      if (!section || typeof section !== "object") continue;
      for (const [name, text] of Object.entries(section as Record<string, unknown>)) {
        if (typeof text === "string") out.push({ page: page.id, key: `${group}.${name}`, text });
      }
    }
  }
  return out;
}

/** The overrides as a flat map: `{ "checkout.pay": "…" }`. */
export function flattenShopText(overrides: ShopTextOverrides | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, entries] of Object.entries(overrides ?? {})) {
    if (!entries || typeof entries !== "object") continue;
    for (const [name, value] of Object.entries(entries)) {
      if (typeof value === "string" && value.trim() !== "") out[`${group}.${name}`] = value;
    }
  }
  return out;
}

/**
 * The `storefront` messages with a store's overrides on top. Only editable
 * strings are taken, and an override that is empty or no longer matches a
 * built-in string is ignored, so a stale entry can never blank out a label.
 */
export function applyShopText<T extends Record<string, unknown>>(
  storefront: T,
  overrides: ShopTextOverrides | undefined | null,
): T {
  const flat = flattenShopText(overrides);
  const keys = Object.keys(flat);
  if (keys.length === 0) return storefront;
  const out: Record<string, unknown> = { ...storefront };
  for (const key of keys) {
    if (!isShopTextKey(key, storefront)) continue;
    const [group, name] = key.split(".");
    out[group] = { ...(out[group] as Record<string, unknown>), [name]: flat[key] };
  }
  return out as T;
}
