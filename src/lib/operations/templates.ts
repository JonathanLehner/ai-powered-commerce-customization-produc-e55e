import "server-only";
import { revalidatePath } from "next/cache";
import { storeLanguages } from "@/i18n/storefront-routing";
import { copyCatalogProductIntoStore } from "../catalog-import";
import { NAV_COLLECTIONS_PROP } from "../collections";
import { COLLECTIONS, getStorefront, listStoreProducts, recordAudit, updateStorefront, updateStoreProduct } from "../data";
import { db } from "../mongo";
import { SHIP_DAYS_PROP } from "../shipping-promise";
import { SOCIAL_NETWORKS } from "../storefront-layout";
import { emptyTree } from "../storefront-sections";
import { capHistory } from "../storefront-versions";
import { getTemplate, STARTER_CATALOG, templateCopy, type StoreTemplate } from "../templates/index";
import { DRAFT_DESIGN_PROP, draftDesign, templateTree, type DraftDesign } from "../templates/tree";
import { I18N_PROP, SEO_FIELDS, type FieldTranslations } from "../translations";
import type { CraftTree } from "../storefront-schema";
import type { StorefrontVersion } from "../types";
import { newId, slugify } from "../util";
import { OperationError, type OperationContext } from "./context";
import { parseTree } from "./storefront";

/**
 * Store templates. Applying one replaces the storefront draft's look and
 * content and nothing else: products, orders and settings are untouched, the
 * live storefront changes only when the draft is published, and the draft it
 * replaced is kept in the version history to go back to.
 */

/** Root props that belong to the store rather than to a look: kept when a template is applied. */
const STORE_ROOT_PROPS = [
  SHIP_DAYS_PROP,
  NAV_COLLECTIONS_PROP,
  ...SEO_FIELDS.map((f) => f.key),
  ...SOCIAL_NETWORKS.map((n) => `social${n[0].toUpperCase()}${n.slice(1)}`),
];

export function requireTemplate(id: string): StoreTemplate {
  const template = getTemplate(id);
  if (!template) throw new OperationError("not_found", "There is no template with that id.", "templateId");
  return template;
}

/** The look the store has now: the drafted design when the draft carries one, else the saved one. */
export function currentDesign(store: OperationContext["store"], tree: unknown): DraftDesign {
  return draftDesign(tree) ?? { theme: store.theme, design: store.design ?? {} };
}

/** The template's tree for this store: its copy in the store's languages, with the store's own root settings kept. */
export function templateTreeForStore(ctx: OperationContext, template: StoreTemplate, base: CraftTree | null): CraftTree {
  const { defaultLocale, locales } = storeLanguages(ctx.store);
  const tree = templateTree(template, { sourceLocale: defaultLocale, locales, brandName: ctx.store.name });
  const own = base?.ROOT?.props ?? {};
  const props = { ...tree.ROOT.props };
  for (const key of STORE_ROOT_PROPS) if (own[key] !== undefined) props[key] = own[key];
  // The store's own search title and description keep their translations too.
  const ownI18n = own[I18N_PROP] as FieldTranslations | undefined;
  if (ownI18n) {
    const merged: FieldTranslations = { ...((props[I18N_PROP] as FieldTranslations | undefined) ?? {}) };
    for (const [locale, fields] of Object.entries(ownI18n)) {
      for (const { key } of SEO_FIELDS) {
        if (fields?.[key]) merged[locale] = { ...(merged[locale] ?? {}), [key]: fields[key] };
      }
    }
    props[I18N_PROP] = merged;
  }
  tree.ROOT = { ...tree.ROOT, props };
  return tree;
}

export interface ApplyTemplateResult {
  templateId: string;
  sections: number;
  /** The history entry holding the draft as it was before, to restore it. */
  previousVersionId: string;
  productsAdded: string[];
}

/**
 * Makes `templateId` the storefront draft. The draft it replaces, with the
 * design it had, is kept in the history first. With `addStarterProducts`, the
 * template's suggested shared-catalog products are copied in as drafts; a
 * product already added for this template is not added twice.
 */
export async function applyTemplate(
  ctx: OperationContext,
  input: { templateId: string; addStarterProducts?: boolean },
): Promise<ApplyTemplateResult> {
  const { store, actor } = ctx;
  if (store.status === "archived") throw new OperationError("conflict", "This store is archived. Restore it before changing its template.");
  const template = requireTemplate(input.templateId);
  const storefront = await getStorefront(store.id);
  const base = (parseTree(storefront?.draft) ?? parseTree(storefront?.published) ?? null) as CraftTree | null;
  const now = new Date().toISOString();

  // The draft as it was, with the design it was shown in, so restoring it
  // brings the old look back as well as the old sections.
  const before = (base ?? emptyTree()) as CraftTree;
  const snapshot: CraftTree = {
    ...before,
    ROOT: { ...before.ROOT, props: { ...(before.ROOT?.props ?? {}), [DRAFT_DESIGN_PROP]: currentDesign(store, base) } },
  };
  const previous: StorefrontVersion = {
    id: newId("ver"),
    label: `Before template: ${template.name}`,
    kind: "draft",
    data: snapshot,
    savedAt: now,
    savedBy: actor.name,
  };
  const tree = templateTreeForStore(ctx, template, base);
  const applied: StorefrontVersion = {
    id: newId("ver"),
    label: `Template: ${template.name}`,
    kind: "draft",
    data: tree,
    savedAt: now,
    savedBy: actor.name,
  };

  if (storefront) {
    await updateStorefront(store.id, {
      draft: tree,
      draftUpdatedAt: now,
      history: capHistory([applied, previous, ...storefront.history]),
    });
  } else {
    await db.insertOne(COLLECTIONS.storefronts, {
      id: newId("sfr"),
      storeId: store.id,
      draft: tree,
      published: null,
      publishedAt: null,
      publishedBy: null,
      draftUpdatedAt: now,
      history: [applied, previous],
    });
  }

  const productsAdded = input.addStarterProducts ? await addStarterProducts(ctx, template) : [];

  recordAudit({
    category: "publishing",
    action: "storefront.template_applied",
    summary: `Applied the “${template.name}” template to the storefront draft${productsAdded.length ? ` and added ${productsAdded.length} starter products` : ""}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "storefront",
    entityId: store.id,
    meta: { templateId: template.id, previousVersionId: previous.id, productsAdded: productsAdded.length },
  });
  revalidatePath(`/app/stores/${store.id}/storefront`);
  return { templateId: template.id, sections: template.sections.length, previousVersionId: previous.id, productsAdded };
}

/**
 * Copies the template's starter selection into the store as draft products,
 * named and described in the store's language. Each is keyed to the template,
 * so applying the same template again does not add them twice.
 */
export async function addStarterProducts(ctx: OperationContext, template: StoreTemplate): Promise<string[]> {
  const { store, actor } = ctx;
  const { defaultLocale } = storeLanguages(store);
  const copy = templateCopy(template, defaultLocale);
  const existing = await listStoreProducts(store.id);
  const taken = new Set(existing.map((p) => p.name));
  const slugs = new Set(existing.map((p) => p.slug));
  const added: string[] = [];
  for (const [index, item] of template.products.entries()) {
    const importKey = `template:${template.id}:${index}`;
    if (existing.some((p) => p.importKey === importKey)) continue;
    const { product } = await copyCatalogProductIntoStore(store, STARTER_CATALOG[item.starter], actor, importKey);
    const wanted = copy[`product:${index}:name`] ?? item.name;
    const name = taken.has(wanted) ? product.name : wanted;
    taken.add(name);
    const slug = name === product.name || slugs.has(slugify(name)) ? product.slug : slugify(name);
    slugs.add(slug);
    await updateStoreProduct(product.id, {
      name,
      slug,
      description: copy[`product:${index}:description`] ?? item.description,
      tags: (item.tags ?? []).map((tag) => copy[`tag:${tag}`] ?? tag),
      shopperCustomization: { ...product.shopperCustomization, textLine: Boolean(item.personalise) },
    });
    added.push(product.id);
  }
  return added;
}
