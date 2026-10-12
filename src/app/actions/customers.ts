"use server";

import { getTranslations } from "next-intl/server";
import { getCustomer } from "@/lib/customer-data";
import { refusal } from "@/lib/operations/action-state";
import { addNote as addCustomerNote, deleteCustomerData as eraseCustomerData } from "@/lib/operations/customers";
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
  const { customer, ...access } = await load(storeId, customerId);
  const t = await getTranslations("customers.actions");

  await eraseCustomerData(await operationContext(access), customer);
  return { status: "success", message: t("dataDeleted") };
}
