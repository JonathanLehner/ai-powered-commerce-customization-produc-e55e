"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import { findCollection } from "@/lib/operations/collections";
import { findGiftCatalogue, saveGiftCatalogueTranslation as translateCatalogue } from "@/lib/operations/gifting";
import { findProduct } from "@/lib/operations/products";
import {
  saveCollectionTranslation as translateCollection,
  saveProductSeo as saveSeo,
  saveProductTranslation as translateProduct,
  saveShopText as setShopText,
  translationLocale,
} from "@/lib/operations/storefront";
import { translateMissing as fillMissing } from "@/lib/operations/translations";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { FieldTranslations } from "@/lib/translations";
import type { ActionState } from "./stores";

/**
 * Translations of a store's content and its Shop text, edited from the
 * storefront editor. Every write is held to the store's enabled languages and
 * recorded in the audit history.
 */

/* ------------------------------------------------------- products and portals */

export interface TranslationResult extends ActionState {
  translations?: FieldTranslations;
}

/** Saves a product's fields in one language. */
export async function saveProductTranslation(input: {
  storeId: string;
  productId: string;
  locale: string;
  values: Record<string, string>;
}): Promise<TranslationResult> {
  const [access, product] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    findProduct(input.storeId, input.productId),
  ]);
  const t = await getTranslations("actions.storefront");
  if (!translationLocale(access.store, input.locale)) return { status: "error", message: t("languageUnavailable") };
  if (!product) return { status: "error", message: t("notFound") };
  try {
    const translations = await translateProduct(await operationContext(access), product, input.locale, input.values);
    return { status: "success", message: t("translationSaved"), translations };
  } catch (error) {
    return refusal(error);
  }
}

export interface ProductSeoResult extends ActionState {
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * Saves a product's search title and description in the store's default
 * language. Other languages are translations, saved with the rest of the
 * product's fields. Empty uses the product name and description.
 */
export async function saveProductSeo(input: {
  storeId: string;
  productId: string;
  seoTitle: string;
  seoDescription: string;
}): Promise<ProductSeoResult> {
  const [access, product] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    findProduct(input.storeId, input.productId),
  ]);
  const t = await getTranslations("actions.storefront");
  if (!product) return { status: "error", message: t("notFound") };
  const saved = await saveSeo(await operationContext(access), product, input);
  return { status: "success", message: t("seoSaved"), ...saved };
}

export async function saveCatalogueTranslation(input: {
  storeId: string;
  catalogueId: string;
  locale: string;
  intro: string;
}): Promise<TranslationResult> {
  const [access, catalogue] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    findGiftCatalogue(input.storeId, input.catalogueId),
  ]);
  const t = await getTranslations("actions.storefront");
  if (!translationLocale(access.store, input.locale)) return { status: "error", message: t("languageUnavailable") };
  if (!catalogue) return { status: "error", message: t("notFound") };
  try {
    const translations = await translateCatalogue(await operationContext(access), catalogue, input.locale, input.intro);
    return { status: "success", message: t("translationSaved"), translations };
  } catch (error) {
    return refusal(error);
  }
}

/** Saves a collection's name and description in one language, as products are saved. */
export async function saveCollectionTranslation(input: {
  storeId: string;
  collectionId: string;
  locale: string;
  values: Record<string, string>;
}): Promise<TranslationResult> {
  const [access, collection] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    findCollection(input.storeId, input.collectionId),
  ]);
  const t = await getTranslations("actions.storefront");
  if (!translationLocale(access.store, input.locale)) return { status: "error", message: t("languageUnavailable") };
  if (!collection) return { status: "error", message: t("notFound") };
  try {
    const translations = await translateCollection(await operationContext(access), collection, input.locale, input.values);
    return { status: "success", message: t("translationSaved"), translations };
  } catch (error) {
    return refusal(error);
  }
}

/* ---------------------------------------------------------------- shop text */

export interface ShopTextResult extends ActionState {
  /** The saved override, or null once it is reset. */
  value?: string | null;
}

/** Overrides one built-in string in one language. Saving an empty value resets it. */
export async function saveShopText(input: {
  storeId: string;
  locale: string;
  key: string;
  value: string;
}): Promise<ShopTextResult> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    const value = await setShopText(await operationContext(access), input);
    return { status: "success", message: value === null ? t("shopTextReset") : t("shopTextSaved"), value };
  } catch (error) {
    return refusal(error);
  }
}

/* --------------------------------------------------------- translate missing */

export interface TranslateMissingResult extends ActionState {
  tree?: Record<string, unknown>;
  products?: Record<string, FieldTranslations>;
  catalogues?: Record<string, FieldTranslations>;
  collections?: Record<string, FieldTranslations>;
}

/**
 * Fills every untranslated field in one language with the platform text model:
 * the page in the editor (which is then saved as the draft), product names,
 * descriptions and option labels, collection names and descriptions, and gift
 * portal intros. Results are marked
 * machine-translated, and a field that has a translation is never touched, so
 * running it twice changes nothing the first run wrote.
 */
export async function translateMissing(input: {
  storeId: string;
  locale: string;
  tree: string;
}): Promise<TranslateMissingResult> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    const outcome = await fillMissing(await operationContext(access), input);
    // Nothing missing comes back without the records, and nothing was written.
    if (!outcome.products) return { status: "success", message: t("nothingToTranslate"), tree: outcome.tree };
    return {
      status: "success",
      message: t("translated", { count: outcome.count }),
      tree: outcome.tree,
      products: outcome.products,
      catalogues: outcome.catalogues,
      collections: outcome.collections,
    };
  } catch (error) {
    return refusal(error);
  }
}
