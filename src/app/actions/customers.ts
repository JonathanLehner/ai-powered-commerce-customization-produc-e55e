"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { addCustomerNote, anonymiseCustomer, getCustomer } from "@/lib/customer-data";
import { recordAudit } from "@/lib/data";
import { assertStoreAccess } from "@/lib/session";
import type { ActionState } from "./stores";

const NOTE_LIMIT = 2000;

async function load(storeId: string, customerId: string) {
  const [access, customer] = await Promise.all([
    assertStoreAccess(storeId, "store.orders"),
    getCustomer(storeId, customerId),
  ]);
  if (!customer) throw new Error("Customer not found in this store.");
  return { ...access, customer };
}

function refresh(storeId: string, customerId: string) {
  revalidatePath(`/app/stores/${storeId}/customers`);
  revalidatePath(`/app/stores/${storeId}/customers/${customerId}`);
}

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const submissionKey = String(formData.get("submissionKey") ?? "");
  const { user, store, customer } = await load(storeId, customerId);
  const t = await getTranslations("customers.actions");

  if (!body) return { status: "error", message: t("noteRequired"), field: "body" };
  if (body.length > NOTE_LIMIT) return { status: "error", message: t("noteTooLong", { max: NOTE_LIMIT }), field: "body" };

  const id = submissionKey ? `note_${submissionKey}` : `note_${Date.now().toString(36)}`;
  const added = await addCustomerNote(storeId, customer.id, { id, body, authorId: user.id, authorName: user.name });
  if (added) {
    recordAudit({
      category: "customers",
      action: "customer.note_added",
      summary: `Added a note to customer ${customer.id}`,
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "customer",
      entityId: customer.id,
      meta: { note: id },
    });
  }
  refresh(storeId, customer.id);
  return { status: "success", message: t("noteAdded") };
}

export async function deleteCustomerData(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const { user, store, customer } = await load(storeId, customerId);
  const t = await getTranslations("customers.actions");

  const { orders } = await anonymiseCustomer(store, customer);
  if (!customer.anonymisedAt) {
    recordAudit({
      category: "customers",
      action: "customer.data_deleted",
      summary: `Deleted personal data of customer ${customer.id} from ${orders} orders`,
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "customer",
      entityId: customer.id,
      meta: { orders },
    });
  }
  refresh(storeId, customer.id);
  revalidatePath(`/app/stores/${storeId}/orders`);
  return { status: "success", message: t("dataDeleted") };
}
