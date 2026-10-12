"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { anonymiseCustomer, getCustomer } from "@/lib/customer-data";
import { recordAudit } from "@/lib/data";
import { refusal } from "@/lib/operations/action-state";
import { addNote as addCustomerNote } from "@/lib/operations/customers";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ActionState } from "./stores";

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
  const { customer, ...access } = await load(storeId, customerId);
  const t = await getTranslations("customers.actions");

  try {
    await addCustomerNote(await operationContext(access), customer, {
      body: String(formData.get("body") ?? ""),
      submissionKey: String(formData.get("submissionKey") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
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
