/**
 * The store's own support contacts.
 *
 * A shopper who needs a person has exactly one route to the seller: what the
 * store saved in guided setup. Nothing here invents an address from the client
 * name — a guessed address bounces, which is worse than no button at all — so
 * every caller has to cope with `null` and offer the order-status lookup
 * instead.
 */
import type { Store } from "./types";

export interface StoreSupport {
  email: string | null;
  phone: string | null;
}

/** Matches the address checks used elsewhere in the workspace. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Digits, spaces and the punctuation international numbers are written with. */
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

export function isSupportEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

/** Deliberately loose: numbers are written differently the world over. */
export function isSupportPhone(value: string): boolean {
  const phone = value.trim();
  return PHONE_SHAPE.test(phone) && (phone.match(/\d/g)?.length ?? 0) >= 6 && phone.length <= 24;
}

/** Reads the contacts off a store record, including ones saved without them. */
export function storeSupport(store: Pick<Store, "supportEmail" | "supportPhone">): StoreSupport {
  const email = (store.supportEmail ?? "").trim();
  const phone = (store.supportPhone ?? "").trim();
  return {
    email: email && isSupportEmail(email) ? email.toLowerCase() : null,
    phone: phone || null,
  };
}

/** `mailto:` for the support address, with the order code in the subject. */
export function supportMailto(email: string, subject?: string): string {
  const address = encodeURIComponent(email.trim().toLowerCase()).replace(/%40/g, "@");
  return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}

/** `tel:` keeps only what a dialler can use. */
export function supportTel(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}
