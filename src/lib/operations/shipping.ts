import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, listShippingZones, recordAudit, updateStore } from "../data";
import { db } from "../mongo";
import { paymentMode } from "../payment-mode";
import {
  MAX_RATES_PER_ZONE,
  MAX_ZONES,
  checkRate,
  checkTaxRates,
  checkZone,
  storeTax,
  type RateInput,
  type ShippingProblem,
  type ZoneInput,
} from "../shipping";
import { stripeTaxStatus } from "../stripe";
import type { ShippingRate, ShippingZone, StoreTaxSettings, TaxMode } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Shipping zones, their rates and the store's tax settings, as the Shipping
 * and taxes page and the Admin API change them.
 */

async function refuse(ctx: OperationContext, problem: ShippingProblem): Promise<never> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.shipping" });
  // `ShippingProblem.key` names a message under `actions.shipping`.
  const key = problem.key as Parameters<typeof t>[0];
  throw new OperationError("invalid", t(key, problem.values ?? {}), problem.field);
}

function revalidateShipping(ctx: OperationContext) {
  revalidatePath(`/app/stores/${ctx.store.id}/shipping`);
  revalidatePath(`/app/stores/${ctx.store.id}/catalog`);
  revalidatePath(`/s/${ctx.store.slug}`, "layout");
}

function audit(ctx: OperationContext, action: string, summary: string, entityId: string, meta: Record<string, string | number | boolean | null> = {}) {
  recordAudit({
    category: "store_setup",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "shipping_zone",
    entityId,
    meta,
  });
}

export async function findZone(storeId: string, zoneId: string): Promise<ShippingZone | null> {
  return db.findOne<ShippingZone>(COLLECTIONS.shippingZones, { storeId, id: zoneId });
}

/* ------------------------------------------------------------------ zones */

export async function createZone(
  ctx: OperationContext,
  input: ZoneInput & { submissionKey?: string | null },
): Promise<ShippingZone> {
  const zones = await listShippingZones(ctx.store.id);
  const key = input.submissionKey || null;
  // A resubmitted form finds the zone it already made.
  const existing = key ? zones.find((zone) => zone.submissionKey === key) : null;
  if (existing) return existing;
  if (zones.length >= MAX_ZONES) await refuse(ctx, { key: "tooManyZones", field: "name", values: { max: MAX_ZONES } });
  const checked = checkZone(input, zones);
  if ("problem" in checked) return refuse(ctx, checked.problem);

  const now = new Date().toISOString();
  const zone: ShippingZone = {
    id: newId("shz"),
    storeId: ctx.store.id,
    name: checked.zone.name,
    countries: checked.zone.countries,
    currency: ctx.store.defaultCurrency,
    rates: [],
    submissionKey: key,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.shippingZones, zone as unknown as Record<string, unknown>);
  audit(ctx, "shipping.zone_created", `Added shipping zone ${zone.name} (${zone.countries.length} countries)`, zone.id, {
    countries: zone.countries.join(", "),
  });
  revalidateShipping(ctx);
  return zone;
}

export async function updateZone(
  ctx: OperationContext,
  zone: ShippingZone,
  input: Partial<ZoneInput>,
): Promise<ShippingZone> {
  const others = (await listShippingZones(ctx.store.id)).filter((z) => z.id !== zone.id);
  const checked = checkZone({ name: input.name ?? zone.name, countries: input.countries ?? zone.countries }, others);
  if ("problem" in checked) return refuse(ctx, checked.problem);
  const updatedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.shippingZones,
    { id: zone.id, storeId: ctx.store.id },
    { $set: { name: checked.zone.name, countries: checked.zone.countries, updatedAt } },
  );
  audit(ctx, "shipping.zone_updated", `Updated shipping zone ${checked.zone.name}`, zone.id, {
    countries: checked.zone.countries.join(", "),
  });
  revalidateShipping(ctx);
  return { ...zone, ...checked.zone, updatedAt };
}

export async function deleteZone(ctx: OperationContext, zone: ShippingZone): Promise<void> {
  await db.deleteOne(COLLECTIONS.shippingZones, { id: zone.id, storeId: ctx.store.id });
  audit(ctx, "shipping.zone_deleted", `Deleted shipping zone ${zone.name}`, zone.id);
  revalidateShipping(ctx);
}

/* ------------------------------------------------------------------ rates */

export async function createRate(
  ctx: OperationContext,
  zone: ShippingZone,
  input: RateInput & { submissionKey?: string | null },
): Promise<ShippingZone> {
  const key = input.submissionKey || null;
  if (key && zone.rates.some((rate) => rate.submissionKey === key)) return zone;
  if (zone.rates.length >= MAX_RATES_PER_ZONE) {
    await refuse(ctx, { key: "tooManyRates", field: "name", values: { max: MAX_RATES_PER_ZONE } });
  }
  const checked = checkRate(input);
  if ("problem" in checked) return refuse(ctx, checked.problem);
  const rate: ShippingRate = { id: newId("shr"), ...checked.rate, submissionKey: key };
  const updatedAt = new Date().toISOString();
  // Guarded on the key, so two submissions racing each other add the rate once.
  const filter: Record<string, unknown> = { id: zone.id, storeId: ctx.store.id };
  if (key) filter["rates.submissionKey"] = { $ne: key };
  await db.updateOne(COLLECTIONS.shippingZones, filter, { $push: { rates: rate }, $set: { updatedAt } });
  audit(ctx, "shipping.rate_created", `Added rate ${rate.name} to ${zone.name}`, zone.id, { rate: rate.id, kind: rate.kind });
  revalidateShipping(ctx);
  return (await findZone(ctx.store.id, zone.id)) ?? { ...zone, rates: [...zone.rates, rate], updatedAt };
}

export async function updateRate(
  ctx: OperationContext,
  zone: ShippingZone,
  rateId: string,
  input: Partial<RateInput>,
): Promise<ShippingZone> {
  const current = zone.rates.find((rate) => rate.id === rateId);
  if (!current) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "actions.shipping" });
    throw new OperationError("not_found", t("rateGone"));
  }
  const checked = checkRate({
    name: input.name ?? current.name,
    kind: input.kind ?? current.kind,
    amount: input.amount ?? current.amount,
    tiers: input.tiers ?? current.tiers,
    threshold: input.threshold !== undefined ? input.threshold : current.threshold,
    minDays: input.minDays ?? current.minDays,
    maxDays: input.maxDays ?? current.maxDays,
  });
  if ("problem" in checked) return refuse(ctx, checked.problem);
  const rate: ShippingRate = { ...current, ...checked.rate };
  const updatedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.shippingZones,
    { id: zone.id, storeId: ctx.store.id, "rates.id": rateId },
    { $set: { "rates.$": rate, updatedAt } },
  );
  audit(ctx, "shipping.rate_updated", `Updated rate ${rate.name} in ${zone.name}`, zone.id, { rate: rate.id, kind: rate.kind });
  revalidateShipping(ctx);
  return { ...zone, rates: zone.rates.map((r) => (r.id === rateId ? rate : r)), updatedAt };
}

export async function deleteRate(ctx: OperationContext, zone: ShippingZone, rateId: string): Promise<ShippingZone> {
  const rate = zone.rates.find((r) => r.id === rateId);
  if (!rate) return zone;
  const updatedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.shippingZones,
    { id: zone.id, storeId: ctx.store.id },
    { $pull: { rates: { id: rateId } }, $set: { updatedAt } },
  );
  audit(ctx, "shipping.rate_deleted", `Deleted rate ${rate.name} from ${zone.name}`, zone.id, { rate: rateId });
  revalidateShipping(ctx);
  return { ...zone, rates: zone.rates.filter((r) => r.id !== rateId), updatedAt };
}

/* -------------------------------------------------------------------- tax */

export interface TaxSettingsView extends StoreTaxSettings {
  pricesIncludeTax: boolean;
}

export function taxSettingsView(store: OperationContext["store"]): TaxSettingsView {
  return { ...storeTax(store), pricesIncludeTax: store.pricesIncludeTax };
}

/**
 * Saves how tax is charged. Stripe Tax is only accepted once the store's
 * Stripe account has it switched on, which is asked of Stripe at save time.
 */
export async function saveTaxSettings(
  ctx: OperationContext,
  input: { mode: string; pricesIncludeTax: boolean; rates: { country: string; rate: number }[] },
): Promise<TaxSettingsView> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.shipping" });
  if (input.mode !== "manual" && input.mode !== "stripe") throw new OperationError("invalid", t("taxMode"), "mode");
  const mode = input.mode as TaxMode;
  const checked = checkTaxRates(input.rates);
  if ("problem" in checked) return refuse(ctx, checked.problem);

  let stripeTax = storeTax(ctx.store).stripeTax ?? null;
  if (mode === "stripe") {
    if (paymentMode(ctx.store) !== "stripe" || !ctx.store.stripe.accountId) {
      throw new OperationError("invalid", t("stripeTaxNeedsStripe"), "mode");
    }
    const status = await stripeTaxStatus(ctx.store.stripe.accountId);
    stripeTax = { status, checkedAt: new Date().toISOString() };
    if (status !== "active") {
      await updateStore(ctx.store.id, { tax: { ...storeTax(ctx.store), stripeTax } });
      throw new OperationError("invalid", t(status === "pending" ? "stripeTaxPending" : "stripeTaxUnavailable"), "mode");
    }
  }

  const tax: StoreTaxSettings = { mode, rates: checked.rates, stripeTax };
  await updateStore(ctx.store.id, { tax, pricesIncludeTax: input.pricesIncludeTax });
  recordAudit({
    category: "store_setup",
    action: "store.tax_updated",
    summary: `Tax set to ${mode === "stripe" ? "Stripe Tax" : `manual rates for ${tax.rates.length} countries`}; prices ${input.pricesIncludeTax ? "include" : "exclude"} tax`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta: { mode, rates: tax.rates.map((r) => `${r.country} ${r.rate}%`).join(", "), pricesIncludeTax: input.pricesIncludeTax },
  });
  revalidateShipping(ctx);
  revalidatePath(`/app/stores/${ctx.store.id}/setup`);
  return { ...tax, pricesIncludeTax: input.pricesIncludeTax };
}
