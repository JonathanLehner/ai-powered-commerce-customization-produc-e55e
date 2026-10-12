/**
 * Shopper accounts: the address book and what checkout is prefilled with.
 *
 * Shared by the account pages, checkout and `npm run accounts-check`. Kept
 * free of server imports.
 */
import { addressRegionKind } from "./countries";
import type { CustomerAddress } from "./types";

export const MAX_ADDRESSES = 10;

export type AddressProblem = "name" | "line1" | "city" | "postalCode" | "country" | "region" | "phone" | "tooMany";

export type AddressInput = Omit<CustomerAddress, "id" | "isDefault">;

/** The address cleaned up, or the field that is wrong. Mirrors checkout's own checks. */
export function cleanAddress(raw: Record<string, unknown>): { address: AddressInput } | { problem: AddressProblem } {
  const text = (key: string) => String(raw[key] ?? "").trim().slice(0, 200);
  const country = text("country").toUpperCase();
  const address: AddressInput = {
    name: text("name"),
    line1: text("line1"),
    city: text("city"),
    postalCode: text("postalCode"),
    country,
  };
  const line2 = text("line2");
  const region = addressRegionKind(country) ? text("region") : "";
  const phone = text("phone");
  if (line2) address.line2 = line2;
  if (region) address.region = region;
  if (phone) address.phone = phone;
  if (address.name.length < 2) return { problem: "name" };
  if (address.line1.length < 4) return { problem: "line1" };
  if (address.city.length < 2) return { problem: "city" };
  if (address.postalCode.length < 3) return { problem: "postalCode" };
  if (!/^[A-Z]{2}$/.test(country)) return { problem: "country" };
  if (addressRegionKind(country) && region.length < 2) return { problem: "region" };
  if (phone && !/^\+?[\d\s().-]{6,20}$/.test(phone)) return { problem: "phone" };
  return { address };
}

/**
 * The address book with `address` added (no id) or replacing the one with its
 * id. There is always exactly one default when the book is not empty: the
 * first address saved, or the one marked as default most recently.
 */
export function withAddress(
  book: CustomerAddress[],
  address: AddressInput & { id: string },
  makeDefault: boolean,
): CustomerAddress[] | null {
  const exists = book.some((entry) => entry.id === address.id);
  if (!exists && book.length >= MAX_ADDRESSES) return null;
  const next = exists
    ? book.map((entry) => (entry.id === address.id ? { ...address, isDefault: entry.isDefault } : entry))
    : [...book, { ...address, isDefault: false }];
  return settleDefault(next, makeDefault ? address.id : null);
}

export function withoutAddress(book: CustomerAddress[], id: string): CustomerAddress[] {
  return settleDefault(book.filter((entry) => entry.id !== id), null);
}

function settleDefault(book: CustomerAddress[], preferred: string | null): CustomerAddress[] {
  if (book.length === 0) return book;
  const chosen = preferred ?? book.find((entry) => entry.isDefault)?.id ?? book[0].id;
  return book.map((entry) => ({ ...entry, isDefault: entry.id === chosen }));
}

export function defaultAddress(book: CustomerAddress[] | undefined): CustomerAddress | null {
  return book?.find((entry) => entry.isDefault) ?? book?.[0] ?? null;
}

/** What the checkout form opens with for a signed-in shopper. */
export interface CheckoutPrefill {
  email: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

export function checkoutPrefill(email: string, name: string, book: CustomerAddress[] | undefined): CheckoutPrefill {
  const address = defaultAddress(book);
  return {
    email,
    name: address?.name || name,
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "",
    phone: address?.phone ?? "",
  };
}

/* ------------------------------------------------------------- sign-in */

/**
 * The store a sign-in is for, read off the address the link returns to: the
 * sign-in form always sends the shopper back to `/s/<slug>/<locale>/account`.
 */
export function storeFromCallback(link: string): { slug: string; locale: string } | null {
  try {
    const callback = new URL(link).searchParams.get("callbackUrl") ?? "";
    const path = callback.startsWith("/") ? callback : new URL(callback).pathname;
    const match = /^\/s\/([^/]+)\/([a-z]{2})\/account(?:\/|$)/.exec(path);
    return match ? { slug: decodeURIComponent(match[1]), locale: match[2] } : null;
  } catch {
    return null;
  }
}
