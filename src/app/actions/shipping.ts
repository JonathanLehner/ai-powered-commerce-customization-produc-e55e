"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import {
  createRate,
  createZone,
  deleteRate,
  deleteZone,
  findZone,
  saveTaxSettings,
  updateRate,
  updateZone,
} from "@/lib/operations/shipping";
import type { RateInput } from "@/lib/shipping";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { ShippingRateTier, ShippingZone } from "@/lib/types";
import { parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/** The Shipping and taxes page. Every change needs the store settings capability. */

async function zoneFromForm(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const zone = await findZone(storeId, String(formData.get("zoneId") ?? ""));
  return { access, zone };
}

async function zoneGone(): Promise<ActionState> {
  const t = await getTranslations("actions.shipping");
  return { status: "error", message: t("zoneGone") };
}

function countriesFrom(formData: FormData): string[] {
  return formData.getAll("countries").map(String);
}

/** A whole number, or NaN for anything else so the operation refuses it with its own message. */
function wholeNumber(raw: FormDataEntryValue | null): number {
  const text = String(raw ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/** Reads a rate as the rate form posts it: money in major units of the zone currency, weights in grams. */
function rateFromForm(formData: FormData, zone: ShippingZone): RateInput {
  const kind = String(formData.get("kind") ?? "");
  const money = (raw: FormDataEntryValue | null) => parseMoney(String(raw ?? ""), zone.currency) ?? Number.NaN;
  let tiers: ShippingRateTier[] = [];
  if (kind === "weight" || kind === "subtotal") {
    let rows: { upTo?: unknown; amount?: unknown }[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("tiers") ?? "[]"));
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      rows = [];
    }
    tiers = rows.map((row) => {
      const upTo = String(row.upTo ?? "").trim();
      return {
        upTo: upTo === "" ? null : kind === "weight" ? wholeNumber(upTo) : money(upTo),
        amount: money(String(row.amount ?? "")),
      };
    });
  }
  return {
    name: String(formData.get("name") ?? ""),
    kind,
    amount: kind === "flat" || kind === "free_over" ? money(formData.get("amount")) : 0,
    tiers,
    threshold: kind === "free_over" ? money(formData.get("threshold")) : null,
    minDays: wholeNumber(formData.get("minDays")),
    maxDays: wholeNumber(formData.get("maxDays")),
  };
}

/* ------------------------------------------------------------------ zones */

export async function createShippingZone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.shipping");
  try {
    const zone = await createZone(await operationContext(access), {
      name: String(formData.get("name") ?? ""),
      countries: countriesFrom(formData),
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
    return { status: "success", message: t("zoneCreated", { name: zone.name }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveShippingZone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, zone } = await zoneFromForm(formData);
  if (!zone) return zoneGone();
  const t = await getTranslations("actions.shipping");
  try {
    const saved = await updateZone(await operationContext(access), zone, {
      name: String(formData.get("name") ?? ""),
      countries: countriesFrom(formData),
    });
    return { status: "success", message: t("zoneSaved", { name: saved.name }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteShippingZone(formData: FormData): Promise<void> {
  const { access, zone } = await zoneFromForm(formData);
  if (!zone) return;
  await deleteZone(await operationContext(access), zone);
}

/* ------------------------------------------------------------------ rates */

export async function createShippingRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, zone } = await zoneFromForm(formData);
  if (!zone) return zoneGone();
  const t = await getTranslations("actions.shipping");
  try {
    const input = rateFromForm(formData, zone);
    await createRate(await operationContext(access), zone, {
      ...input,
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
    return { status: "success", message: t("rateCreated", { name: input.name.trim() }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveShippingRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { access, zone } = await zoneFromForm(formData);
  if (!zone) return zoneGone();
  const t = await getTranslations("actions.shipping");
  try {
    const input = rateFromForm(formData, zone);
    await updateRate(await operationContext(access), zone, String(formData.get("rateId") ?? ""), input);
    return { status: "success", message: t("rateSaved", { name: input.name.trim() }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteShippingRate(formData: FormData): Promise<void> {
  const { access, zone } = await zoneFromForm(formData);
  if (!zone) return;
  await deleteRate(await operationContext(access), zone, String(formData.get("rateId") ?? ""));
}

/* -------------------------------------------------------------------- tax */

export async function saveTaxSettingsForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.shipping");
  const countries = formData.getAll("taxCountry").map(String);
  const rates = formData.getAll("taxRate").map((raw) => String(raw).trim().replace(",", "."));
  try {
    await saveTaxSettings(await operationContext(access), {
      mode: String(formData.get("mode") ?? "manual"),
      pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
      rates: countries
        .map((country, index) => ({ country, rate: rates[index] === "" ? Number.NaN : Number(rates[index]) }))
        // A row left completely blank is an unused row, not a mistake.
        .filter((row, index) => row.country !== "" || rates[index] !== ""),
    });
    return { status: "success", message: t("taxSaved") };
  } catch (error) {
    return refusal(error);
  }
}
