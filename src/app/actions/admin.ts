"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getAgency,
  getCatalogProduct,
  getSupplier,
  getTaxBracket,
  listCatalogProducts,
  recordAudit,
} from "@/lib/data";
import { FILE_REQUIREMENTS, parsePrintAreas, parseVariants } from "@/lib/catalog-rows";
import { db } from "@/lib/platform";
import { assertPlatformAdmin } from "@/lib/session";
import { isQuoteOnly } from "@/lib/sourcing";
import type { CatalogProduct, Supplier, TaxBracket } from "@/lib/types";
import { CURRENCY_OPTIONS, newId, parseMoney } from "@/lib/util";
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
  recordAudit({
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
  recordAudit({
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
  recordAudit({
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

/** "added 2, removed 1" — what an audit entry says about a changed table. */
function changeSummary(added: number, removed: number): string {
  return [added ? `added ${added}` : "", removed ? `removed ${removed}` : ""].filter(Boolean).join(", ");
}

/**
 * Creates a shared catalog product, or saves an existing one. Both run through
 * here so the create form and the editor cannot drift apart: the only difference
 * is whether a `catalogId` comes with the submission.
 */
export async function saveCatalogItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const catalogId = String(formData.get("catalogId") ?? "").trim();
  const user = await assertPlatformAdmin();
  const item = catalogId ? await getCatalogProduct(catalogId) : null;
  if (catalogId && !item) return { status: "error", message: "Catalog product not found." };

  // A bulk-sourcing listing is priced by quote, so there are no costs for this
  // editor to save. Writing one would publish a unit price no supplier has
  // given, and stores would compare against it.
  if (item && isQuoteOnly(item)) {
    return {
      status: "error",
      message: `“${item.name}” is priced by quote. Its run price is recorded against each request in the quote queue, not here.`,
    };
  }

  // The currency is fixed once a product exists: every stored amount is in its
  // minor units, and changing it would silently reinterpret all of them.
  const currency = item?.currency ?? String(formData.get("currency") ?? "USD").trim().toUpperCase();
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const productType = String(formData.get("productType") ?? "").trim();
  const category = String(formData.get("category") ?? "apparel") as CatalogProduct["category"];
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseCost = parseMoney(String(formData.get("baseCost") ?? ""), currency);
  const customizationCostPerArea = parseMoney(String(formData.get("customizationCost") ?? ""), currency);
  const shippingEstimate = parseMoney(String(formData.get("shippingEstimate") ?? ""), currency);
  const availability = String(
    formData.get("availability") ?? item?.availability ?? "available",
  ) as CatalogProduct["availability"];
  const status = String(formData.get("status") ?? item?.status ?? "active") as CatalogProduct["status"];
  const fulfillmentRegions = formData.getAll("regions").map(String);

  const supplier = await getSupplier(supplierId);
  if (!supplier) {
    return { status: "error", message: "Choose the supplier that makes this product.", field: "supplierId" };
  }
  if (productType.length < 3) {
    return { status: "error", message: "Describe the product type, such as “T-shirt, 180 gsm”.", field: "productType" };
  }
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
  if (category !== "apparel" && category !== "drinkware") {
    return { status: "error", message: "Choose a product category.", field: "category" };
  }
  if (!CURRENCY_OPTIONS.some((option) => option.code === currency)) {
    return { status: "error", message: "Choose the currency this supplier invoices in.", field: "currency" };
  }
  if (fulfillmentRegions.length === 0) {
    return { status: "error", message: "Choose at least one fulfilment region.", field: "regions" };
  }

  const parsedAreas = parsePrintAreas(formData.get("printAreas"), item?.printAreas ?? []);
  if ("error" in parsedAreas) return { status: "error", message: parsedAreas.error, field: "printAreas" };
  const parsedVariants = parseVariants(formData.get("variants"), item?.variants ?? [], currency);
  if ("error" in parsedVariants) return { status: "error", message: parsedVariants.error, field: "variants" };
  const printAreas = parsedAreas.areas;
  const variants = parsedVariants.variants;

  if (!item) {
    // A second submission of the same form — a double click on a slow
    // connection, or a retried tab — must not leave two identical products in a
    // catalog every store copies from.
    const existing = await listCatalogProducts();
    const clash = existing.find(
      (product) => product.supplierId === supplierId && product.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      return {
        status: "error",
        message: `${supplier.name} already has a catalog product called “${clash.name}”. Give this one a different name.`,
        field: "name",
      };
    }

    const created: CatalogProduct = {
      id: newId("cat"),
      supplierId,
      name,
      category,
      productType,
      description,
      currency,
      baseCost,
      customizationCostPerArea,
      shippingEstimate,
      variants,
      printAreas,
      // Supplier photography arrives with the supplier's own imagery; the
      // product is costed, importable and configurable without it.
      mockups: [],
      fileRequirements: FILE_REQUIREMENTS[category],
      fulfillmentRegions,
      leadTimeDays: supplier.leadTimeDays,
      availability,
      status,
      createdAt: new Date().toISOString(),
    };

    await db.insertOne(COLLECTIONS.catalog, created as unknown as Record<string, unknown>);
    recordAudit({
      category: "administration",
      action: "catalog.product_added",
      summary: `Added “${name}” to the shared supplier catalog`,
      actorId: user.id,
      actorName: user.name,
      entity: "catalog_product",
      entityId: created.id,
      meta: {
        supplier: supplier.name,
        printAreas: printAreas.length,
        variants: variants.length,
        status,
      },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/suppliers");
    revalidatePath("/admin");
    redirect(`/admin/catalog/${created.id}?created=1`);
  }

  await db.updateOne(
    COLLECTIONS.catalog,
    { id: item.id },
    {
      $set: {
        supplierId,
        name,
        category,
        productType,
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
  recordAudit({
    category: "administration",
    action: "catalog.product_updated",
    summary: `Updated shared catalog product “${name}”`,
    actorId: user.id,
    actorName: user.name,
    entity: "catalog_product",
    entityId: item.id,
    meta: { availability, status, regions: fulfillmentRegions.length },
  });

  // Adding or dropping a print area or a variant changes what every store can
  // sell from this product, so it is recorded in its own right rather than left
  // inside the general update.
  const areasAdded = printAreas.filter((area) => !item.printAreas.some((old) => old.id === area.id)).length;
  const areasRemoved = item.printAreas.filter((old) => !printAreas.some((area) => area.id === old.id)).length;
  if (areasAdded || areasRemoved) {
    recordAudit({
      category: "administration",
      action: "catalog.print_areas_changed",
      summary: `Print areas on “${name}”: ${changeSummary(areasAdded, areasRemoved)} (${printAreas.length} in total)`,
      actorId: user.id,
      actorName: user.name,
      entity: "catalog_product",
      entityId: item.id,
      meta: { added: areasAdded, removed: areasRemoved, total: printAreas.length },
    });
  }
  const variantsAdded = variants.filter((variant) => !item.variants.some((old) => old.id === variant.id)).length;
  const variantsRemoved = item.variants.filter((old) => !variants.some((variant) => variant.id === old.id)).length;
  if (variantsAdded || variantsRemoved) {
    recordAudit({
      category: "administration",
      action: "catalog.variants_changed",
      summary: `Variants on “${name}”: ${changeSummary(variantsAdded, variantsRemoved)} (${variants.length} in total)`,
      actorId: user.id,
      actorName: user.name,
      entity: "catalog_product",
      entityId: item.id,
      meta: { added: variantsAdded, removed: variantsRemoved, total: variants.length },
    });
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${item.id}`);
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
    recordAudit({
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
  recordAudit({
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
  recordAudit({
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
  recordAudit({
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
  recordAudit({
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
