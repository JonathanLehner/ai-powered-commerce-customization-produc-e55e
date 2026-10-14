import "server-only";
import { revalidatePath } from "next/cache";
import { storeLanguages } from "@/i18n/storefront-routing";
import { copyCatalogProductIntoStore } from "../catalog-import";
import { NAV_COLLECTIONS_PROP } from "../collections";
import { requiredDpi } from "../artwork";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStorefront,
  getTaxBracket,
  listStoreProducts,
  recordAudit,
  updateStore,
  updateStorefront,
  updateStoreProduct,
} from "../data";
import { db } from "../mongo";
import { breakdownFor } from "../pricing";
import { SHIP_DAYS_PROP } from "../shipping-promise";
import { SOCIAL_NETWORKS } from "../storefront-layout";
import { emptyTree } from "../storefront-sections";
import { capHistory } from "../storefront-versions";
import { isDarkBlank, starterPrice, starterView } from "../templates/demo";
import { getTemplate, STARTER_CATALOG, TEMPLATES, templateCopy, type StoreTemplate } from "../templates/index";
import { artworkPlacement, blankFamily, type TemplatePrintFile } from "../templates/model";
import { DRAFT_DESIGN_PROP, draftDesign, templateTree, type DraftDesign } from "../templates/tree";
import { I18N_PROP, SEO_FIELDS, type FieldTranslations } from "../translations";
import type { CraftTree } from "../storefront-schema";
import type { Artwork, FileRequirements, MockupImage, PrintArea, StorefrontVersion, StoreProduct } from "../types";
import { newId, slugify } from "../util";
import { OperationError, type OperationContext } from "./context";
import { approveMockups, bulkUpdateProducts, type BulkProductOutcome } from "./products";
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

/** The import key prefix of the products a template adds, followed by the template id and the product's position. */
export const STARTER_KEY_PREFIX = "template:";

/** A template's suggested product that is not on sale yet. */
export function isUnpublishedStarter(product: StoreProduct): boolean {
  return Boolean(product.importKey?.startsWith(STARTER_KEY_PREFIX)) && (product.status === "draft" || product.status === "in_review");
}

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

  // A template brands the storefront, which completes the branding setup step.
  if (!store.setup.branding) await updateStore(store.id, { setup: { ...store.setup, branding: true } });

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
  revalidatePath(`/app/stores/${store.id}/setup`);
  return { templateId: template.id, sections: template.sections.length, previousVersionId: previous.id, productsAdded };
}

/**
 * Copies the template's starter selection into the store as draft products,
 * named and described in the store's language, in the colour the demo shows,
 * at the demo's price, with the template's artwork placed and its product
 * shot as the preview. Each is keyed to the template, so applying the same
 * template again does not add them twice.
 */
export async function addStarterProducts(ctx: OperationContext, template: StoreTemplate): Promise<string[]> {
  const { store, actor } = ctx;
  const { defaultLocale } = storeLanguages(store);
  const copy = templateCopy(template, defaultLocale);
  const existing = await listStoreProducts(store.id);
  const taken = new Set(existing.map((p) => p.name));
  const slugs = new Set(existing.map((p) => p.slug));
  const bracket = store.defaultTaxBracketId ? await getTaxBracket(store.defaultTaxBracketId) : null;
  const added: string[] = [];
  for (const [index, item] of template.products.entries()) {
    const importKey = `${STARTER_KEY_PREFIX}${template.id}:${index}`;
    if (existing.some((p) => p.importKey === importKey)) continue;
    // A blank the shared catalog does not carry yet is left out rather than failing the whole template.
    if (!(await getCatalogProduct(STARTER_CATALOG[item.starter]))) continue;
    const { product } = await copyCatalogProductIntoStore(store, STARTER_CATALOG[item.starter], actor, importKey);
    const catalog = await getCatalogProduct(product.catalogProductId);
    const wanted = copy[`product:${index}:name`] ?? item.name;
    const name = taken.has(wanted) ? product.name : wanted;
    taken.add(name);
    const slug = name === product.name || slugs.has(slugify(name)) ? product.slug : slugify(name);
    slugs.add(slug);

    const price = starterPrice(item.price, product.currency, defaultLocale);
    const inColour = product.variants.some((v) => v.colour === item.colour);
    const variants = product.variants.map((v) => ({ ...v, price, enabled: !inColour || v.colour === item.colour }));
    const area = catalog?.printAreas[starterView(template, index)] ?? catalog?.printAreas[0];
    const poster = blankFamily(item.starter) === "poster";
    const file = template.assets.artwork?.[poster ? "poster" : isDarkBlank(item.colour) ? "dark" : "light"];
    const artworks = area && file && catalog ? [starterArtwork(template, item, file, area, catalog.fileRequirements)] : [];
    const shot = template.assets.products[index];
    const now = new Date().toISOString();
    const mockups: MockupImage[] = shot
      ? [
          {
            id: newId("mck"),
            view: area?.view ?? "front",
            url: shot,
            colour: item.colour,
            generatedAt: now,
            approved: false,
            approvedBy: null,
            approvedAt: null,
          },
        ]
      : [];
    const next = { ...product, price, variants, artworks, mockups };
    await updateStoreProduct(product.id, {
      name,
      slug,
      description: copy[`product:${index}:description`] ?? item.description,
      tags: (item.tags ?? []).map((tag) => copy[`tag:${tag}`] ?? tag),
      shopperCustomization: { ...product.shopperCustomization, textLine: Boolean(item.personalise) },
      price,
      variants,
      artworks,
      mockups,
      costs: breakdownFor(next, catalog, bracket, store.pricesIncludeTax),
    });
    added.push(product.id);
  }
  return added;
}

/**
 * Publishes the store's template products that are not on sale yet in one
 * step: their template product shots are approved, then each is published
 * with the same checks as the catalog's Publish button. A preview made after
 * the artwork changed is left for the team to approve on the product page.
 */
export async function publishStarterProducts(ctx: OperationContext): Promise<BulkProductOutcome> {
  const starters = (await listStoreProducts(ctx.store.id)).filter(isUnpublishedStarter);
  if (starters.length === 0) return { succeeded: [], failed: [] };
  const shots = new Set(TEMPLATES.flatMap((t) => t.assets.products));
  for (const product of starters) {
    if (product.mockups.length > 0 && product.mockups.every((m) => shots.has(m.url))) await approveMockups(ctx, product);
  }
  const outcome = await bulkUpdateProducts(
    ctx,
    starters.map((p) => p.id),
    { kind: "publish" },
  );
  revalidatePath(`/app/stores/${ctx.store.id}/storefront`);
  return outcome;
}

/** The template's print file on the area its product shot shows, placed as the shot draws it and as large as the area's DPI allows. */
function starterArtwork(
  template: StoreTemplate,
  item: StoreTemplate["products"][number],
  file: TemplatePrintFile,
  area: PrintArea,
  requirements: FileRequirements,
): Artwork {
  const family = blankFamily(item.starter);
  const place = artworkPlacement(family, item.placement);
  const aspect = file.height / file.width;
  const scale =
    Math.floor(
      Math.min(
        place.width,
        (place.height * area.heightMm) / (area.widthMm * aspect),
        (file.width * 25.4) / (requiredDpi(area, requirements) * area.widthMm),
      ) * 100,
    ) / 100;
  const height = (scale * area.widthMm * aspect) / area.heightMm;
  return {
    id: newId("art"),
    printAreaId: area.id,
    view: area.view,
    fileName: `${template.id}-artwork.png`,
    url: file.url,
    mimeType: "image/png",
    sizeBytes: file.bytes,
    pixelWidth: file.width,
    pixelHeight: file.height,
    // The poster design is printed edge to edge, background and all.
    hasAlpha: family !== "poster",
    x: place.x,
    y: Math.round((place.top === null ? 0.5 : place.top + height / 2) * 1000) / 1000,
    scale,
    rotation: 0,
  };
}
