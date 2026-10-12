import "server-only";
import { getCustomerByEmail } from "./customer-data";
import { COLLECTIONS, recordAudit } from "./data";
import { db } from "./mongo";
import type { Customer, CustomerAddress, Store } from "./types";
import { newId } from "./util";

/** A signed-in shopper: their Auth.js account id and email. */
export interface ShopperAccount {
  userId: string;
  email: string;
}

/**
 * The store's customer record for the account, linked to it. A shopper who
 * signs in before ever ordering gets a record of their own, which their first
 * order then fills in. Writes only when something changes.
 */
export async function linkCustomerAccount(
  store: Pick<Store, "id" | "agencyId" | "defaultCurrency" | "defaultLanguage">,
  account: ShopperAccount,
): Promise<Customer> {
  const existing = await getCustomerByEmail(store.id, account.email);
  if (existing?.account?.userId === account.userId) return existing;
  const now = new Date().toISOString();
  const link = { userId: account.userId, linkedAt: now, lastSignInAt: now };
  const filter = { storeId: store.id, email: account.email };
  const update = {
    $set: { account: link, updatedAt: now },
    $setOnInsert: {
      id: newId("cus"),
      storeId: store.id,
      email: account.email,
      name: "",
      country: "",
      firstOrderAt: "",
      lastOrderAt: "",
      orderCount: 0,
      lifetimeSpend: 0,
      refundedTotal: 0,
      refundCount: 0,
      currency: store.defaultCurrency,
      preferredLanguage: store.defaultLanguage,
      preferredCurrency: store.defaultCurrency,
      notes: [],
      addresses: [],
      marketing: null,
      anonymisedAt: null,
      createdAt: now,
    },
  };
  const customer = await db
    .findOneAndUpdate<Customer>(COLLECTIONS.customers, filter, update, { upsert: true })
    .catch(async (error: unknown) => {
      // Two first visits at once: the unique index keeps one, and that one is linked.
      if ((error as { code?: number }).code !== 11000) throw error;
      return db.findOneAndUpdate<Customer>(COLLECTIONS.customers, filter, { $set: { account: link, updatedAt: now } });
    });
  if (!customer) throw new Error("Customer record could not be linked");
  recordAudit({
    category: "customers",
    action: "customer.account_linked",
    summary: `Customer ${customer.id} signed in to their account for the first time`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Shopper",
    entity: "customer",
    entityId: customer.id,
    meta: {},
  });
  return customer;
}

/** Saves the address book, guarded on the record still belonging to the account. */
export async function saveAddressBook(storeId: string, account: ShopperAccount, book: CustomerAddress[]): Promise<boolean> {
  const result = await db.updateOne(
    COLLECTIONS.customers,
    { storeId, email: account.email, "account.userId": account.userId },
    { $set: { addresses: book, updatedAt: new Date().toISOString() } },
  );
  return result.matchedCount > 0;
}

/** Records the shopper's marketing email choice. */
export async function saveMarketingConsent(
  store: Pick<Store, "id" | "agencyId">,
  account: ShopperAccount,
  subscribed: boolean,
): Promise<boolean> {
  const now = new Date().toISOString();
  const customer = await db.findOneAndUpdate<Customer>(
    COLLECTIONS.customers,
    { storeId: store.id, email: account.email, "account.userId": account.userId },
    { $set: { marketing: { subscribed, updatedAt: now }, updatedAt: now } },
  );
  if (!customer) return false;
  recordAudit({
    category: "customers",
    action: subscribed ? "customer.marketing_subscribed" : "customer.marketing_unsubscribed",
    summary: `Customer ${customer.id} ${subscribed ? "agreed to" : "opted out of"} marketing email`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Shopper",
    entity: "customer",
    entityId: customer.id,
    meta: {},
  });
  return true;
}
