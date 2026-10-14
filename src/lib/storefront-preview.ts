import "server-only";
import type { Locale } from "@/i18n/locales";
import { hmac, safeEqual } from "./order-access";
import { storeLinkBase } from "./seo";
import type { Store } from "./types";

/**
 * Signed links to a store's unpublished storefront draft, so a merchant or an
 * AI editor can look at changes before publishing them. The link carries its
 * expiry and an HMAC of the store and that expiry, so nothing is stored and a
 * link stops working on its own.
 */

export const PREVIEW_HOURS = 24;

function signature(storeId: string, expires: number): Promise<string> {
  return hmac(`storefront-preview:${storeId}:${expires}`);
}

/** The absolute address of the draft in `locale`, valid for PREVIEW_HOURS. */
export async function storefrontPreviewLink(store: Store, locale: Locale, origin: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + PREVIEW_HOURS * 3600;
  const token = await signature(store.id, expires);
  return {
    url: `${storeLinkBase(store, locale, origin)}/preview?expires=${expires}&t=${token}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/** Whether a preview link's `expires` and `t` are genuine and still valid. */
export async function previewLinkValid(storeId: string, expires: string | undefined, token: string | undefined, now = Date.now()) {
  const at = Number(expires);
  if (!token || !Number.isInteger(at) || at * 1000 < now) return false;
  return safeEqual(token, await signature(storeId, at));
}
