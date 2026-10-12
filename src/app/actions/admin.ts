"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import {
  changeAgencyPlan,
  changeAgencyStatus,
  changeSupplierStatus,
  createSupplier,
  platformContext,
  removeTaxBracket,
  saveCatalogProduct,
  saveTaxBracket as saveBracket,
  updateSupplierRegions,
} from "@/lib/operations/admin";
import { isOperationError } from "@/lib/operations/context";
import { assertPlatformAdmin } from "@/lib/session";
import type { Agency, CatalogProduct, Supplier } from "@/lib/types";
import type { ActionState } from "./stores";

/**
 * The platform administration screens. Each action checks the signed-in person
 * is a platform administrator and runs the same operation the Admin API's
 * platform operations run (`src/lib/operations/admin.ts`).
 */

/** For the one-click forms that show no message: a refusal leaves the page as it was. */
function quietly(error: unknown): void {
  if (!isOperationError(error)) throw error;
}

/* -------------------------------------------------------------- suppliers */

export async function setSupplierStatus(formData: FormData): Promise<void> {
  const supplierId = String(formData.get("supplierId") ?? "");
  const status = String(formData.get("status") ?? "") as Supplier["status"];
  if (!["approved", "pending_review", "disabled"].includes(status)) return;

  const user = await assertPlatformAdmin();
  try {
    await changeSupplierStatus(await platformContext(user), supplierId, status);
  } catch (error) {
    quietly(error);
  }
}

export async function saveSupplierRegions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supplierId = String(formData.get("supplierId") ?? "");
  const regions = formData.getAll("regions").map(String);
  const notes = String(formData.get("notes") ?? "");

  const user = await assertPlatformAdmin();
  const t = await getTranslations("actions.admin");
  try {
    const supplier = await updateSupplierRegions(await platformContext(user), supplierId, { regions, notes });
    return { status: "success", message: t("regionsSaved", { supplier: supplier.name, regions: regions.join(", ") }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function addSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("actions.admin");
  try {
    const supplier = await createSupplier(await platformContext(user), {
      name: String(formData.get("name") ?? ""),
      website: String(formData.get("website") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      kind: String(formData.get("kind") ?? "print_on_demand") as Supplier["kind"],
      integration: String(formData.get("integration") ?? "api") as Supplier["integration"],
      regions: formData.getAll("regions").map(String),
    });
    return { status: "success", message: t("supplierAdded", { name: supplier.name }) };
  } catch (error) {
    return refusal(error);
  }
}

/* --------------------------------------------------------- shared catalog */

/**
 * Creates a shared catalog product, or saves an existing one. Both run through
 * here so the create form and the editor cannot drift apart: the only difference
 * is whether a `catalogId` comes with the submission.
 */
export async function saveCatalogItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("actions.admin");
  const availability = formData.get("availability");
  const status = formData.get("status");

  let saved: Awaited<ReturnType<typeof saveCatalogProduct>>;
  try {
    saved = await saveCatalogProduct(await platformContext(user), {
      catalogId: String(formData.get("catalogId") ?? "").trim() || null,
      currency: String(formData.get("currency") ?? "USD"),
      supplierId: String(formData.get("supplierId") ?? ""),
      productType: String(formData.get("productType") ?? ""),
      category: String(formData.get("category") ?? "apparel"),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      baseCost: String(formData.get("baseCost") ?? ""),
      customizationCostPerArea: String(formData.get("customizationCost") ?? ""),
      shippingEstimate: String(formData.get("shippingEstimate") ?? ""),
      availability: availability === null ? undefined : (String(availability) as CatalogProduct["availability"]),
      status: status === null ? undefined : (String(status) as CatalogProduct["status"]),
      fulfillmentRegions: formData.getAll("regions").map(String),
      printAreas: String(formData.get("printAreas") ?? ""),
      variants: String(formData.get("variants") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }

  if (saved.created) redirect(`/admin/catalog/${saved.item.id}?created=1`);
  return { status: "success", message: t("productUpdated") };
}

/* ------------------------------------------------------------ tax brackets */

export async function saveTaxBracket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const t = await getTranslations("actions.admin");
  try {
    const { bracket, created } = await saveBracket(await platformContext(user), {
      bracketId: String(formData.get("bracketId") ?? "") || null,
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? ""),
      rate: Number(String(formData.get("rate") ?? "")),
      regions: formData.getAll("regions").map(String),
    });
    return created
      ? { status: "success", message: t("bracketCreated", { name: bracket.name }) }
      : { status: "success", message: t("bracketSaved", { name: bracket.name, rate: bracket.rate }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteTaxBracket(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const bracketId = String(formData.get("bracketId") ?? "");
  try {
    await removeTaxBracket(await platformContext(user), bracketId);
  } catch (error) {
    quietly(error);
  }
}

/* ----------------------------------------------------------------- access */

export async function setAgencyStatus(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const agencyId = String(formData.get("agencyId") ?? "");
  const status = String(formData.get("status") ?? "") as Agency["status"];
  if (!["active", "suspended"].includes(status)) return;

  try {
    await changeAgencyStatus(await platformContext(user), agencyId, status);
  } catch (error) {
    quietly(error);
  }
}

export async function setAgencyPlan(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const agencyId = String(formData.get("agencyId") ?? "");
  const plan = String(formData.get("plan") ?? "") as Agency["plan"];
  if (!["starter", "studio", "scale"].includes(plan)) return;

  try {
    await changeAgencyPlan(await platformContext(user), agencyId, plan);
  } catch (error) {
    quietly(error);
  }
}
