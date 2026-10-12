import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { countryName, languageName } from "@/i18n/display";
import { isLocale } from "@/i18n/locales";
import { isCountryCode } from "../countries";
import { addCustomerNote, anonymiseCustomer, customerDataExport, getCustomerByEmail, listCustomers } from "../customer-data";
import {
  customerCsv,
  customerFileName,
  customerKey,
  filterCustomers,
  type CustomerListFilters,
} from "../customers";
import { COLLECTIONS, recordAudit } from "../data";
import { db } from "../mongo";
import { isSupportEmail } from "../support";
import type { Customer } from "../types";
import { CURRENCY_OPTIONS, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's customers. Their figures are rebuilt from the store's orders (see
 * `lib/customer-data.ts`); what the team adds is notes, and, through the API,
 * customers who have not ordered yet and their contact details. The workspace's
 * customer actions and exports and the Admin API both run these.
 */

const NOTE_LIMIT = 2000;
const NAME_LIMIT = 120;

function audit(ctx: OperationContext, action: string, summary: string, customerId: string, meta: Record<string, string | number | null> = {}) {
  recordAudit({
    category: "customers",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "customer",
    entityId: customerId,
    meta,
  });
}

function revalidateCustomer(storeId: string, customerId: string) {
  revalidatePath(`/app/stores/${storeId}/customers`);
  revalidatePath(`/app/stores/${storeId}/customers/${customerId}`);
}

/** A note from the store team. The key makes a double submit land once. */
export async function addNote(
  ctx: OperationContext,
  customer: Customer,
  input: { body: string; submissionKey: string },
): Promise<void> {
  const body = input.body.trim();
  const t = await getTranslations({ locale: ctx.locale, namespace: "customers.actions" });
  if (!body) throw new OperationError("invalid", t("noteRequired"), "body");
  if (body.length > NOTE_LIMIT) throw new OperationError("invalid", t("noteTooLong", { max: NOTE_LIMIT }), "body");

  const id = input.submissionKey ? `note_${input.submissionKey}` : `note_${Date.now().toString(36)}`;
  const added = await addCustomerNote(ctx.store.id, customer.id, {
    id,
    body,
    authorId: ctx.actor.id,
    authorName: ctx.actor.name,
  });
  if (added) audit(ctx, "customer.note_added", `Added a note to customer ${customer.id}`, customer.id, { note: id });
  revalidateCustomer(ctx.store.id, customer.id);
}

/**
 * Erases a customer's personal data from the store's orders and records: a
 * data deletion request. It cannot be undone; repeating it changes nothing.
 */
export async function deleteCustomerData(ctx: OperationContext, customer: Customer): Promise<{ orders: number }> {
  const { orders } = await anonymiseCustomer(ctx.store, customer);
  if (!customer.anonymisedAt) {
    audit(ctx, "customer.data_deleted", `Deleted personal data of customer ${customer.id} from ${orders} orders`, customer.id, {
      orders,
    });
  }
  revalidateCustomer(ctx.store.id, customer.id);
  revalidatePath(`/app/stores/${ctx.store.id}/orders`);
  return { orders };
}

/** Everything held about a customer in this store. Each export is in the audit log. */
export async function exportCustomer(ctx: OperationContext, customer: Customer) {
  const data = await customerDataExport(ctx.store.id, customer);
  audit(ctx, "customer.data_exported", `Exported the data held on customer ${customer.id}`, customer.id, {
    orders: data.orders.length,
  });
  return data;
}

/** The store's customers as a spreadsheet, filtered and sorted, with headings in `ctx.locale`. */
export async function customersSpreadsheet(
  ctx: OperationContext,
  filters: CustomerListFilters,
): Promise<{ csv: string; fileName: string }> {
  const now = new Date();
  const [customers, t] = await Promise.all([
    listCustomers(ctx.store.id),
    getTranslations({ locale: ctx.locale, namespace: "customers" }),
  ]);
  const columns = [
    "name", "email", "country", "firstOrder", "lastOrder", "orders", "currency",
    "spend", "refunded", "language", "preferredCurrency",
  ] as const;
  const csv = customerCsv(filterCustomers(customers, filters, now), {
    columns: columns.map((key) => t(`columns.${key}`)),
    country: (code) => countryName(ctx.locale, code),
    language: (code) => languageName(ctx.locale, code),
    deleted: t("deleted"),
  });
  return {
    csv,
    fileName: customerFileName(t("fileName", { store: ctx.store.name }), filters, now.toISOString().slice(0, 10)),
  };
}

/* ------------------------------------------------------- contact details */

export interface CustomerDetails {
  name?: string;
  country?: string;
  preferredLanguage?: string;
  preferredCurrency?: string;
}

/** Checks and tidies the details a caller may set. */
function readDetails(input: CustomerDetails): CustomerDetails {
  const out: CustomerDetails = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length > NAME_LIMIT) throw new OperationError("invalid", `Keep the name under ${NAME_LIMIT} characters.`, "name");
    out.name = name;
  }
  if (input.country !== undefined) {
    const country = input.country.trim().toUpperCase();
    if (country && !isCountryCode(country)) {
      throw new OperationError("invalid", "Use a two-letter ISO country code, such as DE.", "country");
    }
    out.country = country;
  }
  if (input.preferredLanguage !== undefined) {
    if (!isLocale(input.preferredLanguage)) {
      throw new OperationError("invalid", "Use one of the storefront languages, such as en or de.", "preferredLanguage");
    }
    out.preferredLanguage = input.preferredLanguage;
  }
  if (input.preferredCurrency !== undefined) {
    const currency = input.preferredCurrency.trim().toUpperCase();
    if (!CURRENCY_OPTIONS.some((option) => option.code === currency)) {
      throw new OperationError("invalid", "That currency is not supported.", "preferredCurrency");
    }
    out.preferredCurrency = currency;
  }
  return out;
}

/**
 * A customer who has not ordered yet, such as one moved over from another
 * shop. Their first order is filed under the same record, because a store
 * keeps one record per email address.
 */
export async function createCustomer(
  ctx: OperationContext,
  input: CustomerDetails & { email: string },
): Promise<Customer> {
  const email = customerKey(input.email ?? "");
  if (!isSupportEmail(email)) throw new OperationError("invalid", "Enter a valid email address.", "email");
  const details = readDetails(input);
  if (await getCustomerByEmail(ctx.store.id, email)) {
    throw new OperationError("conflict", `A customer with the email ${email} already exists in this store.`, "email");
  }

  const now = new Date().toISOString();
  const customer: Customer = {
    id: newId("cus"),
    storeId: ctx.store.id,
    email,
    name: details.name ?? "",
    country: details.country ?? "",
    firstOrderAt: "",
    lastOrderAt: "",
    orderCount: 0,
    lifetimeSpend: 0,
    refundedTotal: 0,
    refundCount: 0,
    currency: ctx.store.defaultCurrency,
    preferredLanguage: details.preferredLanguage ?? ctx.store.defaultLanguage,
    preferredCurrency: details.preferredCurrency ?? ctx.store.defaultCurrency,
    notes: [],
    anonymisedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insertOne(COLLECTIONS.customers, customer as unknown as Record<string, unknown>);
  } catch (error) {
    // The same address created twice at once: the unique index keeps one.
    if ((error as { code?: number }).code === 11000) {
      throw new OperationError("conflict", `A customer with the email ${email} already exists in this store.`, "email");
    }
    throw error;
  }
  audit(ctx, "customer.created", `Added customer ${customer.id}`, customer.id);
  revalidateCustomer(ctx.store.id, customer.id);
  return customer;
}

/**
 * Changes a customer's contact details. A later order puts its own name and
 * country on the record, as orders always have.
 */
export async function updateCustomer(
  ctx: OperationContext,
  customer: Customer,
  input: CustomerDetails,
): Promise<Customer> {
  if (customer.anonymisedAt) {
    throw new OperationError("conflict", "This customer's personal data was deleted.");
  }
  const details = readDetails(input);
  const changed = (Object.keys(details) as (keyof CustomerDetails)[]).filter((key) => details[key] !== customer[key]);
  if (changed.length === 0) return customer;

  const patch = { ...details, updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.customers, { storeId: ctx.store.id, id: customer.id }, { $set: patch });
  audit(ctx, "customer.updated", `Updated ${changed.join(", ")} on customer ${customer.id}`, customer.id, {
    fields: changed.join(","),
  });
  revalidateCustomer(ctx.store.id, customer.id);
  return { ...customer, ...patch };
}
