import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { languageName } from "@/i18n/display";
import { storeLanguages } from "@/i18n/storefront-routing";
import { collectionFields } from "../collections";
import {
  listGiftCatalogues,
  listProductCollections,
  listStoreProducts,
  recordAudit,
  updateGiftCatalogue,
  updateProductCollection,
  updateStorefront,
  updateStoreProduct,
} from "../data";
import { machineTranslate } from "../translate";
import {
  applyTreeTranslations,
  missingProductFields,
  missingTreeFields,
  translationOf,
  withTranslation,
  type FieldTranslations,
} from "../translations";
import { OperationError, type OperationContext } from "./context";
import { parseTree, translationLocale } from "./storefront";

export interface TranslateMissingOutcome {
  /** How many fields were translated; 0 when nothing was missing and nothing was written. */
  count: number;
  /** The page tree with its missing fields filled, saved as the storefront draft when count > 0. */
  tree: Record<string, unknown>;
  products?: Record<string, FieldTranslations>;
  catalogues?: Record<string, FieldTranslations>;
  collections?: Record<string, FieldTranslations>;
}

/**
 * Fills every untranslated field in one language with the platform text model:
 * the page tree given (which is then saved as the draft), product names,
 * descriptions and option labels, collection names and descriptions, and gift
 * portal intros. Results are marked machine-translated, and a field that has a
 * translation is never touched, so running it twice changes nothing the first
 * run wrote.
 */
export async function translateMissing(
  ctx: OperationContext,
  input: { locale: string; tree: unknown },
): Promise<TranslateMissingOutcome> {
  const { store } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.storefront" });
  const locale = translationLocale(store, input.locale);
  if (!locale) throw new OperationError("invalid", t("languageUnavailable"), "locale");
  const tree = parseTree(input.tree);
  if (!tree) throw new OperationError("invalid", t("unreadable"), "tree");

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
  if (Object.keys(pending).length === 0) return { count: 0, tree };

  let results: Record<string, string>;
  try {
    results = await machineTranslate(pending, storeLanguages(store).defaultLocale, locale);
  } catch (error) {
    console.error("Translate missing failed", error);
    throw new OperationError("conflict", t("translateFailed"));
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
  recordAudit({
    category: "publishing",
    action: "storefront.machine_translated",
    summary: `Machine-translated ${count} missing ${count === 1 ? "field" : "fields"} into ${languageName("en", locale)}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "storefront",
    entityId: store.id,
    meta: { locale, fields: count },
  });
  revalidatePath(`/app/stores/${store.id}/storefront`);
  revalidatePath(`/s/${store.slug}`, "layout");
  return {
    count,
    tree: nextTree,
    products: productTranslations,
    catalogues: catalogueTranslations,
    collections: collectionTranslations,
  };
}
