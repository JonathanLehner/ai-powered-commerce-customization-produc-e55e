"use server";

import { getMessages, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { languageName } from "@/i18n/display";
import { isLocale, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import {
  COLLECTIONS,
  getGiftCatalogue,
  getProductCollection,
  getStoreProduct,
  listGiftCatalogues,
  listProductCollections,
  listStoreProducts,
  recordAudit,
  updateGiftCatalogue,
  updateProductCollection,
  updateStorefront,
  updateStoreProduct,
} from "@/lib/data";
import { collectionFields } from "@/lib/collections";
import { db } from "@/lib/mongo";
import { SEO_LIMITS } from "@/lib/seo";
import { assertStoreAccess } from "@/lib/session";
import { isShopTextKey } from "@/lib/shop-text";
import { overrideProblem } from "@/lib/shop-text-validate";
import { machineTranslate } from "@/lib/translate";
import {
  applyTreeTranslations,
  missingProductFields,
  missingTreeFields,
  productFields,
  translationOf,
  withTranslation,
  type FieldTranslations,
} from "@/lib/translations";
import type { Store, User } from "@/lib/types";
import type { ActionState } from "./stores";

/**
 * Translations of a store's content and its Shop text, edited from the
 * storefront editor. Every write is held to the store's enabled languages and
 * recorded in the audit history.
 */

/** A language the store has enabled other than its default: the only ones content is translated into. */
function translationLocale(store: Store, raw: unknown): Locale | null {
  const { locales, defaultLocale } = storeLanguages(store);
  return isLocale(raw) && raw !== defaultLocale && locales.includes(raw) ? raw : null;
}

function audit(store: Store, user: User, action: string, summary: string, entity: string, entityId: string, meta: Record<string, string | number>) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity,
    entityId,
    meta,
  });
}

function refresh(store: Store) {
  revalidatePath(`/app/stores/${store.id}/storefront`);
  revalidatePath(`/s/${store.slug}`, "layout");
}

/* ------------------------------------------------------- products and portals */

export interface TranslationResult extends ActionState {
  translations?: FieldTranslations;
}

/**
 * Saves a product's fields in one language. Saving is what makes a person the
 * author, so every field in the form loses its machine-translated mark; an
 * empty field removes the translation and the source shows again.
 */
export async function saveProductTranslation(input: {
  storeId: string;
  productId: string;
  locale: string;
  values: Record<string, string>;
}): Promise<TranslationResult> {
  const [{ user, store }, product] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    getStoreProduct(input.productId),
  ]);
  const t = await getTranslations("actions.storefront");
  const locale = translationLocale(store, input.locale);
  if (!locale) return { status: "error", message: t("languageUnavailable") };
  if (!product || product.storeId !== store.id) return { status: "error", message: t("notFound") };

  let translations = product.translations ?? {};
  for (const field of productFields(product)) {
    if (!(field.key in input.values)) continue;
    translations = withTranslation(translations, locale, field.key, String(input.values[field.key] ?? "").trim());
  }
  await updateStoreProduct(product.id, { translations });
  audit(
    store,
    user,
    "storefront.product_translated",
    `Saved the ${languageName("en", locale)} translation of “${product.name}”`,
    "product",
    product.id,
    { locale },
  );
  refresh(store);
  return { status: "success", message: t("translationSaved"), translations };
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
  const [{ user, store }, product] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    getStoreProduct(input.productId),
  ]);
  const t = await getTranslations("actions.storefront");
  if (!product || product.storeId !== store.id) return { status: "error", message: t("notFound") };

  const seoTitle = String(input.seoTitle ?? "").trim().slice(0, SEO_LIMITS.seoTitle);
  const seoDescription = String(input.seoDescription ?? "").trim().slice(0, SEO_LIMITS.seoDescription);
  await updateStoreProduct(product.id, { seoTitle, seoDescription });
  audit(store, user, "storefront.product_seo", `Updated the search title and description of “${product.name}”`, "product", product.id, {});
  refresh(store);
  return { status: "success", message: t("seoSaved"), seoTitle, seoDescription };
}

export async function saveCatalogueTranslation(input: {
  storeId: string;
  catalogueId: string;
  locale: string;
  intro: string;
}): Promise<TranslationResult> {
  const [{ user, store }, catalogue] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    getGiftCatalogue(input.catalogueId),
  ]);
  const t = await getTranslations("actions.storefront");
  const locale = translationLocale(store, input.locale);
  if (!locale) return { status: "error", message: t("languageUnavailable") };
  if (!catalogue || catalogue.storeId !== store.id) return { status: "error", message: t("notFound") };

  const translations = withTranslation(catalogue.translations, locale, "intro", input.intro.trim());
  await updateGiftCatalogue(catalogue.id, { translations });
  audit(
    store,
    user,
    "storefront.portal_translated",
    `Saved the ${languageName("en", locale)} intro of the “${catalogue.name}” gift portal`,
    "gift_catalogue",
    catalogue.id,
    { locale },
  );
  revalidatePath(`/app/stores/${store.id}/storefront`);
  revalidatePath(`/g/${catalogue.slug}`, "layout");
  return { status: "success", message: t("translationSaved"), translations };
}

/** Saves a collection's name and description in one language, as products are saved. */
export async function saveCollectionTranslation(input: {
  storeId: string;
  collectionId: string;
  locale: string;
  values: Record<string, string>;
}): Promise<TranslationResult> {
  const [{ user, store }, collection] = await Promise.all([
    assertStoreAccess(input.storeId, "store.storefront"),
    getProductCollection(input.collectionId),
  ]);
  const t = await getTranslations("actions.storefront");
  const locale = translationLocale(store, input.locale);
  if (!locale) return { status: "error", message: t("languageUnavailable") };
  if (!collection || collection.storeId !== store.id) return { status: "error", message: t("notFound") };

  let translations = collection.translations ?? {};
  for (const field of collectionFields(collection)) {
    if (!(field.key in input.values)) continue;
    translations = withTranslation(translations, locale, field.key, String(input.values[field.key] ?? "").trim());
  }
  await updateProductCollection(collection.id, {}, { translations });
  audit(
    store,
    user,
    "storefront.collection_translated",
    `Saved the ${languageName("en", locale)} translation of the collection “${collection.name}”`,
    "collection",
    collection.id,
    { locale },
  );
  refresh(store);
  return { status: "success", message: t("translationSaved"), translations };
}

/* ---------------------------------------------------------------- shop text */

export interface ShopTextResult extends ActionState {
  /** The saved override, or null once it is reset. */
  value?: string | null;
}

/**
 * Overrides one built-in string in one language. Any enabled language can be
 * overridden, the default included. Saving an empty value resets it.
 */
export async function saveShopText(input: {
  storeId: string;
  locale: string;
  key: string;
  value: string;
}): Promise<ShopTextResult> {
  const { user, store } = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  const locale = input.locale;
  if (!isLocale(locale) || !storeLanguages(store).locales.includes(locale)) {
    return { status: "error", message: t("languageUnavailable") };
  }
  const messages = await getMessages({ locale });
  const storefront = messages.storefront as unknown as Record<string, Record<string, string>>;
  if (!isShopTextKey(input.key, storefront)) return { status: "error", message: t("notFound") };

  const [group, name] = input.key.split(".");
  const value = input.value.trim();
  const path = `shopText.${locale}.${group}.${name}`;
  if (value === "") {
    await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $unset: { [path]: "" } });
  } else {
    const problem = overrideProblem(storefront[group][name], value);
    if (problem) {
      return {
        status: "error",
        message: problem.kind === "invalid" ? t("shopTextInvalid") : t("shopTextPlaceholder"),
      };
    }
    await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $set: { [path]: value } });
  }

  // The history names the string by its English wording, as people see it in the panel.
  const english = (await getMessages({ locale: "en" })).storefront as unknown as Record<string, Record<string, string>>;
  const wording = english[group]?.[name] ?? input.key;
  audit(
    store,
    user,
    value === "" ? "storefront.shop_text_reset" : "storefront.shop_text_saved",
    value === ""
      ? `Reset the shop text “${wording}” to default in ${languageName("en", locale)}`
      : `Changed the shop text “${wording}” in ${languageName("en", locale)}`,
    "store",
    store.id,
    { locale, key: input.key },
  );
  refresh(store);
  return {
    status: "success",
    message: value === "" ? t("shopTextReset") : t("shopTextSaved"),
    value: value === "" ? null : value,
  };
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
  const { user, store } = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  const locale = translationLocale(store, input.locale);
  if (!locale) return { status: "error", message: t("languageUnavailable") };
  let tree: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(input.tree);
    if (parsed && typeof parsed === "object" && "ROOT" in parsed) tree = parsed;
  } catch {
    tree = null;
  }
  if (!tree) return { status: "error", message: t("unreadable") };

  const [products, catalogues, collections] = await Promise.all([
    listStoreProducts(store.id),
    listGiftCatalogues(store.id),
    listProductCollections(store.id),
  ]);
  const pending: Record<string, string> = { ...missingTreeFields(tree, locale) };
  for (const product of products) {
    if (product.status === "archived") continue;
    for (const [key, source] of Object.entries(missingProductFields(product, locale))) {
      pending[`product:${product.id}:${key}`] = source;
    }
  }
  for (const catalogue of catalogues) {
    if (catalogue.intro.trim() && !translationOf(catalogue.translations, locale, "intro")) {
      pending[`portal:${catalogue.id}`] = catalogue.intro;
    }
  }
  for (const collection of collections) {
    for (const field of collectionFields(collection)) {
      if (field.source.trim() && !translationOf(collection.translations, locale, field.key)) {
        pending[`collection:${collection.id}:${field.key}`] = field.source;
      }
    }
  }
  if (Object.keys(pending).length === 0) {
    return { status: "success", message: t("nothingToTranslate"), tree };
  }

  let results: Record<string, string>;
  try {
    results = await machineTranslate(pending, storeLanguages(store).defaultLocale, locale);
  } catch (error) {
    console.error("Translate missing failed", error);
    return { status: "error", message: t("translateFailed") };
  }

  const treeValues: Record<string, string> = {};
  const productValues = new Map<string, Record<string, string>>();
  const portalValues = new Map<string, string>();
  const collectionValues = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(results)) {
    if (key.startsWith("section:") || key.startsWith("site:")) {
      treeValues[key] = value;
    } else if (key.startsWith("product:")) {
      const [, id, ...field] = key.split(":");
      productValues.set(id, { ...(productValues.get(id) ?? {}), [field.join(":")]: value });
    } else if (key.startsWith("portal:")) {
      portalValues.set(key.slice("portal:".length), value);
    } else if (key.startsWith("collection:")) {
      const [, id, field] = key.split(":");
      collectionValues.set(id, { ...(collectionValues.get(id) ?? {}), [field]: value });
    }
  }

  const nextTree = applyTreeTranslations(tree, locale, treeValues, true);
  const writes: Promise<unknown>[] = [
    updateStorefront(store.id, { draft: nextTree, draftUpdatedAt: new Date().toISOString() }),
  ];
  const productTranslations: Record<string, FieldTranslations> = {};
  for (const product of products) {
    const values = productValues.get(product.id);
    if (!values) continue;
    let translations = product.translations ?? {};
    for (const [key, value] of Object.entries(values)) {
      if (!translationOf(translations, locale, key)) {
        translations = withTranslation(translations, locale, key, value, true);
      }
    }
    productTranslations[product.id] = translations;
    writes.push(updateStoreProduct(product.id, { translations }));
  }
  const catalogueTranslations: Record<string, FieldTranslations> = {};
  for (const catalogue of catalogues) {
    const value = portalValues.get(catalogue.id);
    if (!value || translationOf(catalogue.translations, locale, "intro")) continue;
    const translations = withTranslation(catalogue.translations, locale, "intro", value, true);
    catalogueTranslations[catalogue.id] = translations;
    writes.push(updateGiftCatalogue(catalogue.id, { translations }));
  }
  const collectionTranslations: Record<string, FieldTranslations> = {};
  for (const collection of collections) {
    const values = collectionValues.get(collection.id);
    if (!values) continue;
    let translations = collection.translations ?? {};
    for (const [key, value] of Object.entries(values)) {
      if (!translationOf(translations, locale, key)) {
        translations = withTranslation(translations, locale, key, value, true);
      }
    }
    collectionTranslations[collection.id] = translations;
    writes.push(updateProductCollection(collection.id, {}, { translations }));
  }
  await Promise.all(writes);

  const count = Object.keys(results).length;
  audit(
    store,
    user,
    "storefront.machine_translated",
    `Machine-translated ${count} missing ${count === 1 ? "field" : "fields"} into ${languageName("en", locale)}`,
    "storefront",
    store.id,
    { locale, fields: count },
  );
  refresh(store);
  return {
    status: "success",
    message: t("translated", { count }),
    tree: nextTree,
    products: productTranslations,
    catalogues: catalogueTranslations,
    collections: collectionTranslations,
  };
}
