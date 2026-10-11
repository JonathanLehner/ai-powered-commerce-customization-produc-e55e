import "server-only";
import { after } from "next/server";
import { anonymisedEmail, customerFigures, customerKey, groupOrdersByCustomer, type CustomerFigures } from "./customers";
import { COLLECTIONS } from "./data";
import { db } from "./mongo";
import type { CampaignRecipient, Customer, GiftCampaign, Order, Store } from "./types";
import { newId } from "./util";

/**
 * Reads and writes for a store's customers. Every read is scoped to one store,
 * so a customer id from another store finds nothing.
 */

type StoreRef = Pick<Store, "id" | "defaultCurrency" | "defaultLanguage">;

/**
 * The order's email matched the way `customerKey` reads it: without regard to
 * case or surrounding spaces, and anchored so it is the whole address.
 */
function emailMatch(key: string) {
  return { $regex: `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, $options: "i" };
}

export function listCustomers(storeId: string) {
  return db.find<Customer>(COLLECTIONS.customers, { storeId }, { sort: { lastOrderAt: -1 } });
}

export function getCustomer(storeId: string, id: string) {
  return db.findOne<Customer>(COLLECTIONS.customers, { storeId, id });
}

export function getCustomerByEmail(storeId: string, email: string) {
  return db.findOne<Customer>(COLLECTIONS.customers, { storeId, email: customerKey(email) });
}

/** The customer's orders in this store, newest first. */
export function listCustomerOrders(storeId: string, email: string) {
  return db.find<Order>(
    COLLECTIONS.orders,
    { storeId, "customer.email": emailMatch(customerKey(email)) },
    { sort: { createdAt: -1 } },
  );
}

async function writeCustomer(storeId: string, figures: CustomerFigures): Promise<void> {
  const now = new Date().toISOString();
  const filter = { storeId, email: figures.email };
  const update = {
    $set: { ...figures, updatedAt: now },
    $setOnInsert: { id: newId("cus"), storeId, notes: [], createdAt: now },
  };
  try {
    await db.upsertOne(COLLECTIONS.customers, filter, update);
  } catch (error) {
    // Two orders from one address at the same instant can both try to insert;
    // the unique index turns one away, and that one updates the winner instead.
    if ((error as { code?: number }).code !== 11000) throw error;
    await db.upsertOne(COLLECTIONS.customers, filter, update);
  }
}

/**
 * Rebuilds the records for these addresses from the store's orders. Running
 * it again over the same orders writes the same figures, so it is safe to
 * repeat; the team's notes are never touched.
 */
export async function syncCustomers(store: StoreRef, emails: string[]): Promise<void> {
  const keys = [...new Set(emails.map(customerKey))].filter(Boolean);
  await Promise.all(
    keys.map(async (key) => {
      const figures = customerFigures(await listCustomerOrders(store.id, key), store);
      if (figures) await writeCustomer(store.id, figures);
    }),
  );
}

/** Every customer of a store from one read of its orders. The backfill runs this. */
export async function syncStoreCustomers(store: StoreRef): Promise<number> {
  const orders = await db.find<Order>(COLLECTIONS.orders, { storeId: store.id });
  let written = 0;
  for (const group of groupOrdersByCustomer(orders).values()) {
    const figures = customerFigures(group, store);
    if (!figures) continue;
    await writeCustomer(store.id, figures);
    written += 1;
  }
  return written;
}

/**
 * Brings the records up to date after the response has gone out, the way
 * `recordAudit` writes. A failure is logged: the order itself has succeeded,
 * and the backfill puts any record right.
 */
export function refreshCustomers(store: StoreRef, emails: string[]): void {
  const run = () =>
    syncCustomers(store, emails).catch((error: unknown) => console.error("Customer records could not be updated", error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A note from the store team. The key makes a double submit land once. */
export async function addCustomerNote(
  storeId: string,
  customerId: string,
  note: { id: string; body: string; authorId: string; authorName: string },
): Promise<boolean> {
  const at = new Date().toISOString();
  const result = await db.updateOne(
    COLLECTIONS.customers,
    { storeId, id: customerId, "notes.id": { $ne: note.id } },
    { $push: { notes: { ...note, at } }, $set: { updatedAt: at } },
  );
  return result.modifiedCount > 0;
}

function campaignsForOrders(storeId: string, orderIds: string[]) {
  if (orderIds.length === 0) return Promise.resolve([]);
  return db.find<GiftCampaign>(COLLECTIONS.giftCampaigns, { storeId, "recipients.orderId": { $in: orderIds } });
}

/** Everything held about a customer in this store, for a data request. */
export async function customerDataExport(storeId: string, customer: Customer) {
  const orders = await listCustomerOrders(storeId, customer.email);
  const ids = new Set(orders.map((order) => order.id));
  const campaigns = await campaignsForOrders(storeId, [...ids]);
  return {
    exportedAt: new Date().toISOString(),
    customer,
    orders,
    giftRecipients: campaigns.flatMap((campaign) =>
      campaign.recipients
        .filter((recipient) => recipient.orderId && ids.has(recipient.orderId))
        .map((recipient) => ({ campaign: campaign.code, ...recipient })),
    ),
  };
}

/**
 * Deletes a customer's personal data in this store: name, email and address go
 * from the record, from every order and from the gift lists those orders came
 * from, and the address is replaced in the store's email history. Amounts,
 * items, dates and countries stay, because the accounts still need them.
 *
 * Each step finds only what is still to do, so a repeat after a failure
 * finishes the job and a repeat after success changes nothing.
 */
export async function anonymiseCustomer(store: StoreRef, customer: Customer): Promise<{ orders: number }> {
  const anonymous = anonymisedEmail(customer.id);
  const at = customer.anonymisedAt ?? new Date().toISOString();
  const orders = customer.anonymisedAt ? [] : await listCustomerOrders(store.id, customer.email);
  const orderIds = orders.map((order) => order.id);
  const emails = [...new Set([customer.email, ...orders.map((order) => customerKey(order.customer.email))])].filter(
    (email) => email !== anonymous,
  );

  if (orderIds.length > 0) {
    await db.updateMany(
      COLLECTIONS.orders,
      { storeId: store.id, id: { $in: orderIds } },
      {
        $set: {
          "customer.name": "",
          "customer.email": anonymous,
          "customer.line1": "",
          "customer.city": "",
          "customer.postalCode": "",
          "customer.anonymisedAt": at,
        },
      },
    );
  }

  const blank = new Set(orderIds);
  for (const campaign of await campaignsForOrders(store.id, orderIds)) {
    const recipients = campaign.recipients.map((recipient): CampaignRecipient =>
      recipient.orderId && blank.has(recipient.orderId)
        ? { ...recipient, name: "", email: anonymous, line1: "", city: "", postalCode: "", note: "" }
        : recipient,
    );
    await db.updateOne(COLLECTIONS.giftCampaigns, { storeId: store.id, id: campaign.id }, { $set: { recipients } });
  }

  for (const email of emails) {
    await db.updateMany(COLLECTIONS.audit, { storeId: store.id, "meta.to": emailMatch(email) }, [
      {
        $set: {
          "meta.to": anonymous,
          summary: { $replaceAll: { input: "$summary", find: "$meta.to", replacement: anonymous } },
        },
      },
    ] as unknown as Record<string, unknown>);
  }

  await db.updateOne(
    COLLECTIONS.customers,
    { storeId: store.id, id: customer.id },
    { $set: { email: anonymous, name: "", anonymisedAt: at, updatedAt: new Date().toISOString() } },
  );
  await syncCustomers(store, [anonymous]);
  return { orders: orderIds.length };
}
