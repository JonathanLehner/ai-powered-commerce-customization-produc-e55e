import "server-only";
import { getMessages, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { languageName } from "@/i18n/display";
import { isLocale, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { collectionFields } from "../collections";
import {
  COLLECTIONS,
  getStorefront,
  recordAudit,
  updateProductCollection,
  updateStore,
  updateStorefront,
  updateStoreProduct,
} from "../data";
import { db } from "../mongo";
import { SEO_LIMITS } from "../seo";
import { isShopTextKey } from "../shop-text";
import { overrideProblem } from "../shop-text-validate";
import { cleanDesign } from "../store-design";
import { sectionsFromTree, type CraftTree } from "../storefront-schema";
import { draftDesign } from "../templates/tree";
import { emptyTree } from "../storefront-sections";
import { capHistory, sameTree } from "../storefront-versions";
import { markOutdatedTranslations, productFields, withTranslation, type FieldTranslations } from "../translations";
import type { ProductCollection, Store, StorefrontVersion, StoreProduct } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * The storefront: its page draft and published version, the store's wording of
 * the built-in shop text, and translations of products and collections. The
 * storefront editor's actions and the Admin API both run these.
 */

function audit(
  ctx: OperationContext,
  action: string,
  summary: string,
  entity: string,
  entityId: string,
  meta: Record<string, string | number>,
) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity,
    entityId,
    meta,
  });
}

function revalidateStorefront(store: Store) {
  revalidatePath(`/app/stores/${store.id}/storefront`);
  revalidatePath(`/s/${store.slug}`, "layout");
}

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.storefront" });
}

/** A Craft.js page tree, or null when `raw` is not one. Accepts the JSON text or the parsed object. */
export function parseTree(raw: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "ROOT" in parsed) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ pages */

/** Saves the page draft; each saved draft is kept in the history unless it is what was last kept. */
export async function saveStorefrontDraft(
  ctx: OperationContext,
  input: { tree: unknown; label: string; locale: string },
): Promise<void> {
  const { store, actor } = ctx;
  const t = await messages(ctx);
  const edited = parseTree(input.tree);
  if (!edited) throw new OperationError("invalid", t("unreadable"), "tree");

  // The language the draft was edited in, when it was not the default, so
  // the history says whose copy changed.
  const locale = input.locale;
  const inLanguage =
    isLocale(locale) && locale !== storeLanguages(store).defaultLocale ? ` in ${languageName("en", locale)}` : "";

  const storefront = await getStorefront(store.id);
  const tree = markOutdatedTranslations(parseTree(storefront?.draft) ?? parseTree(storefront?.published), edited);
  const now = new Date().toISOString();
  const history = storefront?.history ?? [];
  const unchanged = history.length > 0 && sameTree(history[0].data, tree);
  const label = input.label.trim();
  const version: StorefrontVersion = { id: newId("ver"), label, kind: "draft", data: tree, savedAt: now, savedBy: actor.name };

  await updateStorefront(store.id, {
    draft: tree,
    draftUpdatedAt: now,
    ...(unchanged ? {} : { history: capHistory([version, ...history]) }),
  });
  audit(
    ctx,
    "storefront.draft_saved",
    `Saved a storefront draft with ${sectionsFromTree(tree).length} sections${inLanguage}`,
    "storefront",
    store.id,
    inLanguage ? { locale } : {},
  );
  revalidatePath(`/app/stores/${store.id}/storefront`);
}

/** Publishes a page tree, which also becomes the draft. */
export async function publishStorefront(ctx: OperationContext, input: { tree: unknown; label: string }): Promise<void> {
  const { store, actor } = ctx;
  const t = await messages(ctx);
  const edited = parseTree(input.tree);
  if (!edited) throw new OperationError("invalid", t("unreadable"), "tree");
  const sections = sectionsFromTree(edited);
  if (sections.length === 0) throw new OperationError("invalid", t("sectionRequired"), "tree");
  if (store.status === "archived") throw new OperationError("conflict", t("archived"));

  const storefront = await getStorefront(store.id);
  const tree = markOutdatedTranslations(parseTree(storefront?.draft) ?? parseTree(storefront?.published), edited);
  const now = new Date().toISOString();
  const label = input.label.trim();
  const version: StorefrontVersion = { id: newId("ver"), label, kind: "published", data: tree, savedAt: now, savedBy: actor.name };
  const history = capHistory([version, ...(storefront?.history ?? [])]);

  await updateStorefront(store.id, {
    draft: tree,
    published: tree,
    publishedAt: now,
    publishedBy: actor.name,
    draftUpdatedAt: now,
    history,
  });
  // A draft built from a template, or restored from one, carries its design:
  // publishing is when that look goes live.
  const drafted = draftDesign(tree);
  if (drafted) await updateStore(store.id, { theme: drafted.theme, design: cleanDesign(drafted.theme, drafted.design) });
  audit(
    ctx,
    "storefront.published",
    label
      ? `Published storefront layout “${label}” with ${sections.length} sections`
      : `Published storefront layout with ${sections.length} sections`,
    "storefront",
    version.id,
    { sections: sections.length, label },
  );
  revalidatePath(`/app/stores/${store.id}/storefront`);
  revalidatePath(`/s/${store.slug}`);
}

/** Puts the published page back into the draft. False when nothing is published. */
export async function revertStorefront(ctx: OperationContext): Promise<boolean> {
  const { store } = ctx;
  const storefront = await getStorefront(store.id);
  if (!storefront?.published) return false;

  await updateStorefront(store.id, {
    draft: storefront.published,
    draftUpdatedAt: new Date().toISOString(),
  });
  audit(ctx, "storefront.reverted", "Reverted the storefront draft to the published version", "storefront", store.id, {});
  revalidatePath(`/app/stores/${store.id}/storefront`);
  return true;
}

/** Copies a version from the history into the draft. Null when the store has no such version. */
export async function restoreStorefrontVersion(ctx: OperationContext, versionId: string): Promise<StorefrontVersion | null> {
  const { store } = ctx;
  const storefront = await getStorefront(store.id);
  const version = storefront?.history.find((v) => v.id === versionId);
  if (!version) return null;

  await updateStorefront(store.id, {
    draft: version.data,
    draftUpdatedAt: new Date().toISOString(),
  });
  audit(
    ctx,
    "storefront.version_restored",
    version.label
      ? `Restored storefront version “${version.label}” into the draft`
      : `Restored a ${version.kind === "draft" ? "saved draft" : "published version"} from ${version.savedAt.slice(0, 10)} into the draft`,
    "storefront",
    versionId,
    { label: version.label },
  );
  revalidatePath(`/app/stores/${store.id}/storefront`);
  return version;
}

/**
 * Applies one section edit to the draft: the saved draft, else the published
 * page, else an empty page. The write only lands on the draft it was worked
 * out from, so two edits made at once cannot overwrite each other; the loser
 * is worked out again on the winner's draft. Granular edits do not add a
 * version to the history; saveStorefrontDraft with a label keeps one.
 */
export async function editStorefrontDraft(
  ctx: OperationContext,
  summary: string,
  edit: (tree: CraftTree) => CraftTree,
): Promise<CraftTree> {
  const { store } = ctx;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const storefront = await getStorefront(store.id);
    const base = (parseTree(storefront?.draft) ?? parseTree(storefront?.published) ?? emptyTree()) as CraftTree;
    const tree = markOutdatedTranslations(base, edit(base));
    const now = new Date().toISOString();
    const result = storefront
      ? await db.updateOne(
          COLLECTIONS.storefronts,
          { storeId: store.id, draftUpdatedAt: storefront.draftUpdatedAt },
          { $set: { draft: tree, draftUpdatedAt: now } },
        )
      : null;
    if (!storefront) {
      await db.insertOne(COLLECTIONS.storefronts, {
        id: newId("sfr"),
        storeId: store.id,
        draft: tree,
        published: null,
        publishedAt: null,
        publishedBy: null,
        draftUpdatedAt: now,
        history: [],
      });
    } else if (result?.matchedCount === 0) {
      continue;
    }
    audit(ctx, "storefront.draft_edited", summary, "storefront", store.id, {});
    revalidatePath(`/app/stores/${store.id}/storefront`);
    return tree;
  }
  throw new OperationError("conflict", "The draft is being changed by someone else. Try again.");
}

/* --------------------------------------------------------------- shop text */

/**
 * Overrides one built-in string in one language. Any enabled language can be
 * overridden, the default included. An empty value resets it. Returns the
 * saved override, or null once it is reset.
 */
export async function saveShopText(
  ctx: OperationContext,
  input: { locale: string; key: string; value: string },
): Promise<string | null> {
  const { store } = ctx;
  const t = await messages(ctx);
  const locale = input.locale;
  if (!isLocale(locale) || !storeLanguages(store).locales.includes(locale)) {
    throw new OperationError("invalid", t("languageUnavailable"), "locale");
  }
  const storefront = await shopperMessages(locale);
  if (!isShopTextKey(input.key, storefront)) throw new OperationError("not_found", t("notFound"), "key");

  const [group, name] = input.key.split(".");
  const value = input.value.trim();
  const path = `shopText.${locale}.${group}.${name}`;
  if (value === "") {
    await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $unset: { [path]: "" } });
  } else {
    const problem = overrideProblem(storefront[group][name], value);
    if (problem) {
      throw new OperationError("invalid", problem.kind === "invalid" ? t("shopTextInvalid") : t("shopTextPlaceholder"), "value");
    }
    await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $set: { [path]: value } });
  }

  // The history names the string by its English wording, as people see it in the panel.
  const english = await shopperMessages("en");
  const wording = english[group]?.[name] ?? input.key;
  audit(
    ctx,
    value === "" ? "storefront.shop_text_reset" : "storefront.shop_text_saved",
    value === ""
      ? `Reset the shop text “${wording}” to default in ${languageName("en", locale)}`
      : `Changed the shop text “${wording}” in ${languageName("en", locale)}`,
    "store",
    store.id,
    { locale, key: input.key },
  );
  revalidateStorefront(store);
  return value === "" ? null : value;
}

/** The built-in shopper strings of a language, by group and name. */
export async function shopperMessages(locale: Locale): Promise<Record<string, Record<string, string>>> {
  const messages = await getMessages({ locale });
  return messages.storefront as unknown as Record<string, Record<string, string>>;
}

/* ------------------------------------------------------------ translations */

/** A language the store has enabled other than its default: the only ones content is translated into. */
export function translationLocale(store: Store, raw: unknown): Locale | null {
  const { locales, defaultLocale } = storeLanguages(store);
  return isLocale(raw) && raw !== defaultLocale && locales.includes(raw) ? raw : null;
}

async function checkLocale(ctx: OperationContext, raw: string): Promise<Locale> {
  const locale = translationLocale(ctx.store, raw);
  if (!locale) throw new OperationError("invalid", (await messages(ctx))("languageUnavailable"), "locale");
  return locale;
}

/**
 * Saves a product's fields in one language. Saving is what makes a person the
 * author, so every field given loses its machine-translated mark; an empty
 * field removes the translation and the source shows again.
 */
export async function saveProductTranslation(
  ctx: OperationContext,
  product: StoreProduct,
  rawLocale: string,
  values: Record<string, string>,
): Promise<FieldTranslations> {
  const locale = await checkLocale(ctx, rawLocale);
  let translations = product.translations ?? {};
  for (const field of productFields(product)) {
    if (!(field.key in values)) continue;
    translations = withTranslation(translations, locale, field.key, String(values[field.key] ?? "").trim(), false, field.source);
  }
  await updateStoreProduct(product.id, { translations });
  audit(
    ctx,
    "storefront.product_translated",
    `Saved the ${languageName("en", locale)} translation of “${product.name}”`,
    "product",
    product.id,
    { locale },
  );
  revalidateStorefront(ctx.store);
  return translations;
}

/** Saves a collection's name and description in one language, as products are saved. */
export async function saveCollectionTranslation(
  ctx: OperationContext,
  collection: ProductCollection,
  rawLocale: string,
  values: Record<string, string>,
): Promise<FieldTranslations> {
  const locale = await checkLocale(ctx, rawLocale);
  let translations = collection.translations ?? {};
  for (const field of collectionFields(collection)) {
    if (!(field.key in values)) continue;
    translations = withTranslation(translations, locale, field.key, String(values[field.key] ?? "").trim(), false, field.source);
  }
  await updateProductCollection(collection.id, {}, { translations });
  audit(
    ctx,
    "storefront.collection_translated",
    `Saved the ${languageName("en", locale)} translation of the collection “${collection.name}”`,
    "collection",
    collection.id,
    { locale },
  );
  revalidateStorefront(ctx.store);
  return translations;
}

/**
 * A product's search title and description in the store's default language.
 * Empty uses the product name and description.
 */
export async function saveProductSeo(
  ctx: OperationContext,
  product: StoreProduct,
  input: { seoTitle: string; seoDescription: string },
): Promise<{ seoTitle: string; seoDescription: string }> {
  const seoTitle = String(input.seoTitle ?? "").trim().slice(0, SEO_LIMITS.seoTitle);
  const seoDescription = String(input.seoDescription ?? "").trim().slice(0, SEO_LIMITS.seoDescription);
  await updateStoreProduct(product.id, { seoTitle, seoDescription });
  audit(ctx, "storefront.product_seo", `Updated the search title and description of “${product.name}”`, "product", product.id, {});
  revalidateStorefront(ctx.store);
  return { seoTitle, seoDescription };
}
