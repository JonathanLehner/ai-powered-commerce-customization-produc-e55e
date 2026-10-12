import "server-only";
import { cache } from "react";
import { shopperAuth } from "@/shopper-auth";
import type { ShopperAccount } from "./account-data";
import { customerKey } from "./customers";

export type { ShopperAccount } from "./account-data";
export { linkCustomerAccount, saveAddressBook, saveMarketingConsent } from "./account-data";

/**
 * The signed-in shopper. The session says who they are; everything they see
 * is read for that email in the store they are in.
 */

/** The shopper signed in on this request, or null. Memoised per render. */
export const getShopperAccount = cache(async (): Promise<ShopperAccount | null> => {
  try {
    const session = await shopperAuth();
    const email = session?.user?.email;
    const userId = session?.user?.id;
    return email && userId ? { userId, email: customerKey(email) } : null;
  } catch (error) {
    console.error("Shopper session could not be read", error);
    return null;
  }
});
