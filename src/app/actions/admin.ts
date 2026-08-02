"use server";

import { revalidatePath } from "next/cache";
import { COLLECTIONS, getAgency, getCatalogProduct, getSupplier, getTaxBracket, recordAudit } from "@/lib/data";
import { db } from "@/lib/platform";
import { assertPlatformAdmin } from "@/lib/session";
import type { Supplier, TaxBracket } from "@/lib/types";
import { newId, parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/* -------------------------------------------------------------- suppliers */

export async function setSupplierStatus(formData: FormData): Promise<void> {
  const supplierId = String(formData.get("supplierId") ?? "");
  const status = String(formData.get("status") ?? "") as Supplier["status"];
  if (!["approved", "pending_review", "disabled"].includes(status)) return;

  const user = await assertPlatformAdmin();
  const supplier = await getSupplier(supplierId);
  if (!supplier || supplier.status === status) return;

  await db.updateOne(COLLECTIONS.suppliers, { id: supplierId }, { $set: { status } });
  await recordAudit({
    category: "administration",
    action: "supplier.status_changed",
    summary: `${status === "approved" ? "Approved" : status === "disabled" ? "Disabled" : "Returned to review"} supplier ${supplier.name}`,
    actorId: user.id,
    actorName: user.name,
    entity: "supplier",
    entityId: supplierId,
    meta: { from: supplier.status, to: status },
  });
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
}

export async function saveSupplierRegions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supplierId = String(formData.get("supplierId") ?? "");
  const regions = formData.getAll("regions").map(String);
  const notes = String(formData.get("notes") ?? "").trim();

  const user = await assertPlatformAdmin();
  const supplier = await getSupplier(supplierId);
  if (!supplier) return { status: "error", message: "Supplier not found." };
  if (regions.length === 0) {
    return { status: "error", message: "A supplier must fulfil to at least one region.", field: "regions" };
  }

  await db.updateOne(COLLECTIONS.suppliers, { id: supplierId }, { $set: { regions, notes } });
  await recordAudit({
    category: "administration",
    action: "supplier.updated",
    summary: `Updated fulfilment regions for ${supplier.name} (${regions.length} regions)`,
    actorId: user.id,
    actorName: user.name,
    entity: "supplier",
    entityId: supplierId,
    meta: { regions: regions.join(", ") },
  });
  revalidatePath("/admin/suppliers");
  return { status: "success", message: `${supplier.name} now fulfils to ${regions.join(", ")}.` };
}

export async function addSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const kind = String(formData.get("kind") ?? "print_on_demand") as Supplier["kind"];
  const integration = String(formData.get("integration") ?? "api") as Supplier["integration"];
  const regions = formData.getAll("regions").map(String);

  if (name.length < 2) return { status: "error", message: "Enter the supplier's name.", field: "name" };
  if (!/^https?:\/\/.+\..+/.test(website)) {
    return { status: "error", message: "Enter the supplier's website, including https://.", field: "website" };
  }
  if (summary.length < 20) {
    return { status: "error", message: "Write a sentence describing what this supplier is for.", field: "summary" };
  }
  if (regions.length === 0) {
    return { status: "error", message: "Choose at least one fulfilment region.", field: "regions" };
  }

  const supplier: Supplier = {
    id: newId("sup"),
    name,
    kind,
    website,
    summary,
    status: "pending_review",
    regions,
    integration,
    capabilities: {
      catalog: true,
      quotes: true,
      inventory: integration === "api",
      mockups: false,
      orderSubmission: integration === "api",
      tracking: integration === "api",
      cancellation: false,
    },
    leadTimeDays: [3, 10],
    notes: "Added for commercial review. Not selectable by stores until approved.",
    createdAt: new Date().toISOString(),
  };

  await db.insertOne(COLLECTIONS.suppliers, supplier as unknown as Record<string, unknown>);
  await recordAudit({
    category: "administration",
    action: "supplier.added",
    summary: `Added supplier ${name} for review`,
    actorId: user.id,
    actorName: user.name,
    entity: "supplier",
    entityId: supplier.id,
    meta: { kind, integration },
  });
  revalidatePath("/admin/suppliers");
  return {
    status: "success",
    message: `${name} added in review. Approve it before stores can source from it.`,
  };
}

/* --------------------------------------------------------- shared catalog */

export async function saveCatalogItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const catalogId = String(formData.get("catalogId") ?? "");
  const user = await assertPlatformAdmin();
  const item = await getCatalogProduct(catalogId);
  if (!item) return { status: "error", message: "Catalog product not found." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseCost = parseMoney(String(formData.get("baseCost") ?? ""), item.currency);
  const customizationCostPerArea = parseMoney(String(formData.get("customizationCost") ?? ""), item.currency);
  const shippingEstimate = parseMoney(String(formData.get("shippingEstimate") ?? ""), item.currency);
  const availability = String(formData.get("availability") ?? item.availability) as typeof item.availability;
  const status = String(formData.get("status") ?? item.status) as typeof item.status;
  const fulfillmentRegions = formData.getAll("regions").map(String);

  if (name.length < 3) return { status: "error", message: "Enter a product name.", field: "name" };
  if (description.length < 20) {
    return { status: "error", message: "Describe the product — store managers rely on this when comparing.", field: "description" };
  }
  if (baseCost === null || baseCost <= 0) {
    return { status: "error", message: "Enter the supplier's base cost.", field: "baseCost" };
  }
  if (customizationCostPerArea === null) {
    return { status: "error", message: "Enter the customisation cost per print area.", field: "customizationCost" };
  }
  if (shippingEstimate === null) {
    return { status: "error", message: "Enter an estimated shipping cost.", field: "shippingEstimate" };
  }
  if (fulfillmentRegions.length === 0) {
    return { status: "error", message: "Choose at least one fulfilment region.", field: "regions" };
  }

  const printAreas = item.printAreas.map((area) => {
    const widthMm = Number(formData.get(`width_${area.id}`) ?? area.widthMm);
    const heightMm = Number(formData.get(`height_${area.id}`) ?? area.heightMm);
    const minDpi = Number(formData.get(`dpi_${area.id}`) ?? area.minDpi);
    return {
      ...area,
      widthMm: Number.isFinite(widthMm) && widthMm > 0 ? widthMm : area.widthMm,
      heightMm: Number.isFinite(heightMm) && heightMm > 0 ? heightMm : area.heightMm,
      minDpi: Number.isFinite(minDpi) && minDpi > 0 ? minDpi : area.minDpi,
    };
  });

  const variants = item.variants.map((variant) => {
    const cost = parseMoney(String(formData.get(`cost_${variant.id}`) ?? ""), item.currency);
    const stock = String(formData.get(`stock_${variant.id}`) ?? variant.availability) as typeof variant.availability;
    return { ...variant, baseCost: cost ?? variant.baseCost, availability: stock };
  });

  await db.updateOne(
    COLLECTIONS.catalog,
    { id: catalogId },
    {
      $set: {
        name,
        description,
        baseCost,
        customizationCostPerArea,
        shippingEstimate,
        availability,
        status,
        fulfillmentRegions,
        printAreas,
        variants,
      },
    },
  );
  await recordAudit({
    category: "administration",
    action: "catalog.product_updated",
    summary: `Updated shared catalog product “${name}”`,
    actorId: user.id,
    actorName: user.name,
    entity: "catalog_product",
    entityId: catalogId,
    meta: { availability, status, regions: fulfillmentRegions.length },
  });
  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${catalogId}`);
  return { status: "success", message: "Shared catalog product updated. Stores see the change on their next import." };
}

/* ------------------------------------------------------------ tax brackets */

export async function saveTaxBracket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPlatformAdmin();
  const bracketId = String(formData.get("bracketId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const rateRaw = String(formData.get("rate") ?? "");
  const regions = formData.getAll("regions").map(String);

  if (name.length < 3) return { status: "error", message: "Give the bracket a name.", field: "name" };
  if (!/^[A-Z0-9-.]{2,12}$/.test(code)) {
    return { status: "error", message: "Codes are 2–12 characters, letters, numbers, dots and dashes.", field: "code" };
  }
  const rate = Number(rateRaw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
    return { status: "error", message: "Enter a rate between 0 and 50 percent.", field: "rate" };
  }
  if (regions.length === 0) {
    return { status: "error", message: "Choose the regions this bracket applies to.", field: "regions" };
  }

  if (bracketId) {
    const existing = await getTaxBracket(bracketId);
    if (!existing) return { status: "error", message: "That tax bracket no longer exists." };
    await db.updateOne(
      COLLECTIONS.taxBrackets,
      { id: bracketId },
      { $set: { name, code, description, rate, regions } },
    );
    await recordAudit({
      category: "administration",
      action: "tax.bracket_updated",
      summary: `Updated tax bracket “${name}” to ${rate}%`,
      actorId: user.id,
      actorName: user.name,
      entity: "tax_bracket",
      entityId: bracketId,
      meta: { from: existing.rate, to: rate },
    });
    revalidatePath("/admin/tax");
    return { status: "success", message: `${name} saved at ${rate}%. Stores using it recalculate immediately.` };
  }

  const bracket: TaxBracket = {
    id: newId("tax"),
    name,
    code,
    rate,
    description,
    regions,
    createdAt: new Date().toISOString(),
  };
  await db.insertOne(COLLECTIONS.taxBrackets, bracket as unknown as Record<string, unknown>);
  await recordAudit({
    category: "administration",
    action: "tax.bracket_created",
    summary: `Created global tax bracket “${name}” at ${rate}%`,
    actorId: user.id,
    actorName: user.name,
    entity: "tax_bracket",
    entityId: bracket.id,
    meta: { rate },
  });
  revalidatePath("/admin/tax");
  return { status: "success", message: `${name} created. Stores can now select it per product.` };
}

export async function deleteTaxBracket(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const bracketId = String(formData.get("bracketId") ?? "");
  const bracket = await getTaxBracket(bracketId);
  if (!bracket) return;

  const inUse = await db.count(COLLECTIONS.storeProducts, { taxBracketId: bracketId });
  if (inUse > 0) return;

  await db.deleteOne(COLLECTIONS.taxBrackets, { id: bracketId });
  await recordAudit({
    category: "administration",
    action: "tax.bracket_deleted",
    summary: `Deleted unused tax bracket “${bracket.name}”`,
    actorId: user.id,
    actorName: user.name,
    entity: "tax_bracket",
    entityId: bracketId,
    meta: {},
  });
  revalidatePath("/admin/tax");
}

/* ----------------------------------------------------------------- access */

export async function setAgencyStatus(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const agencyId = String(formData.get("agencyId") ?? "");
  const status = String(formData.get("status") ?? "") as "active" | "suspended";
  if (!["active", "suspended"].includes(status)) return;

  const agency = await getAgency(agencyId);
  if (!agency || agency.status === status) return;

  await db.updateOne(COLLECTIONS.agencies, { id: agencyId }, { $set: { status } });
  await recordAudit({
    category: "administration",
    action: "agency.status_changed",
    summary: `${status === "suspended" ? "Suspended" : "Reactivated"} agency ${agency.name}`,
    agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "agency",
    entityId: agencyId,
    meta: { status },
  });
  revalidatePath("/admin/agencies");
}

export async function setAgencyPlan(formData: FormData): Promise<void> {
  const user = await assertPlatformAdmin();
  const agencyId = String(formData.get("agencyId") ?? "");
  const plan = String(formData.get("plan") ?? "") as "starter" | "studio" | "scale";
  if (!["starter", "studio", "scale"].includes(plan)) return;

  const agency = await getAgency(agencyId);
  if (!agency || agency.plan === plan) return;

  await db.updateOne(COLLECTIONS.agencies, { id: agencyId }, { $set: { plan } });
  await recordAudit({
    category: "administration",
    action: "agency.plan_changed",
    summary: `Moved ${agency.name} from the ${agency.plan} plan to ${plan}`,
    agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "agency",
    entityId: agencyId,
    meta: { from: agency.plan, to: plan },
  });
  revalidatePath("/admin/agencies");
}
