import "server-only";
import { z } from "zod";
import { LOCALES, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getStorefront, listProductCollections, listStoreProducts } from "../../data";
import { siteOrigin } from "../../email";
import type { OperationContext } from "../../operations/context";
import { editStorefrontDraft, parseTree } from "../../operations/storefront";
import { sectionAddedSummary, sectionChangedSummary } from "../../storefront-activity";
import { storefrontPreviewLink } from "../../storefront-preview";
import { SECTION_ORDER, type CraftTree, type SectionType } from "../../storefront-schema";
import { layoutValues, LAYOUT_DEFAULTS, LAYOUT_FIELDS } from "../../storefront-layout";
import {
  newBlockId,
  PRODUCT_BLOCK_DEFS,
  PRODUCT_BLOCK_LIMIT,
  PRODUCT_BLOCK_ORDER,
  PRODUCT_PAGE_PROP,
  productBlocks,
  translatableBlockFields,
  type ProductBlock,
  type ProductBlockType,
} from "../../product-template";
import {
  addSection,
  checkFieldValue,
  describeField,
  duplicateSection,
  emptyTree,
  listSections,
  moveSection,
  removeSection,
  SECTION_LIMIT,
  SectionEditError,
  sectionTypes,
  updateSection,
  type FieldRules,
} from "../../storefront-sections";
import { translateStorefrontDraft } from "../../operations/translations";
import {
  I18N_PROP,
  outdatedTreeFields,
  SEO_FIELDS,
  SITE_FIELDS,
  siteContent,
  withTranslation,
  type FieldTranslations,
} from "../../translations";
import { storeUpload, UPLOAD_SCOPES } from "../../uploads";
import { ApiError } from "../auth";
import { shippingClaimNotes } from "../claims";
import { define, type ApiOperation } from "../define";

/**
 * The storefront page one section at a time, for an AI editor or any client
 * that would rather not send the whole node tree: list, read, add, change,
 * move, duplicate and remove sections of the draft, edit the header, footer and
 * search copy, preview the draft behind a signed link, and upload images for
 * image fields. Every edit changes the draft only; shoppers see it once
 * publishStorefront is called.
 */

const NEXT_STEPS =
  "This changes the draft only: shoppers keep seeing the published page. Call previewStorefront to look at the draft, and publishStorefront when it is ready. Undo with another edit, or discard every unpublished change with revertStorefront.";

const sectionId = z.string().min(1).describe("The section id, from listStorefrontSections. Ids stay the same across edits.");
const fields = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .describe(
    "Field values by key, such as { \"headline\": \"Summer drop\", \"tone\": \"dark\" }. The keys and allowed values of each section type are in listStorefrontSectionTypes; fields left out keep their value.",
  );
const position = z
  .number()
  .int()
  .min(0)
  .max(SECTION_LIMIT)
  .describe("Where the section goes, 0 being the top of the page.");
const sectionLocale = z
  .enum(LOCALES)
  .optional()
  .describe(
    "Write the text fields' copy in this enabled language instead of the default one. Leave out to change the default language and the non-text fields.",
  );

async function draftOf(ctx: OperationContext): Promise<CraftTree> {
  const storefront = await getStorefront(ctx.store.id);
  return (parseTree(storefront?.draft) ?? parseTree(storefront?.published) ?? emptyTree()) as CraftTree;
}

async function fieldRules(ctx: OperationContext): Promise<FieldRules> {
  const [collections, products] = await Promise.all([listProductCollections(ctx.store.id), listStoreProducts(ctx.store.id)]);
  return { collectionIds: collections.map((c) => c.id), productIds: products.map((p) => p.id) };
}

function checkLocale(ctx: OperationContext, locale: Locale | undefined, field = "locale") {
  if (locale && !storeLanguages(ctx.store).locales.includes(locale)) {
    throw new ApiError(422, "invalid_request", `The store does not have ${locale} enabled. Enable it with updateLanguages first.`, field);
  }
}

/**
 * The enabled languages whose copy on the draft no longer matches the default
 * language, with how many fields each, so a caller that just changed the
 * source knows to update them. Empty when every translation is current.
 */
function outdatedTranslations(ctx: OperationContext, tree: unknown) {
  const { locales, defaultLocale } = storeLanguages(ctx.store);
  const counts: Record<string, number> = {};
  for (const locale of locales) {
    const count = locale === defaultLocale ? 0 : Object.keys(outdatedTreeFields(tree, locale)).length;
    if (count > 0) counts[locale] = count;
  }
  if (Object.keys(counts).length === 0) return {};
  return {
    outdatedTranslations: counts,
    outdatedNote:
      "These languages still show the copy as it was before. Update them with translateStorefrontDraft, once per language, or write the new copy with the locale argument.",
  };
}

/** Runs a section edit, turning its problems into a field-level API error listing every one. */
async function edit(ctx: OperationContext, summary: string | ((base: CraftTree) => string), change: (tree: CraftTree) => CraftTree) {
  try {
    const tree = await editStorefrontDraft(ctx, summary, change);
    return { sections: listSections(tree), ...outdatedTranslations(ctx, tree), ...(await shippingClaimNotes(ctx, tree)) };
  } catch (error) {
    if (error instanceof SectionEditError) {
      const [first] = error.issues;
      throw new ApiError(
        error.kind === "not_found" ? 404 : 422,
        error.kind === "not_found" ? "not_found" : "invalid_request",
        error.message,
        first?.field,
        { issues: error.issues },
      );
    }
    throw error;
  }
}

const ROOT_FIELDS = [...SITE_FIELDS, ...SEO_FIELDS];
const ROOT_LIMITS: Record<string, number> = { text: 300, textarea: 1000 };

export const storefrontSectionOperations: ApiOperation[] = [
  define({
    id: "listStorefrontSectionTypes",
    method: "GET",
    path: "/storefront/section-types",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "List the section types",
    description:
      "The kinds of section a storefront page can hold, with every field each one takes: its key, type (text, textarea, select, number, url, toggle), the allowed options or range, whether it is translated, and its default. Read this before addStorefrontSection or updateStorefrontSection. Changes nothing.",
    input: z.object({}),
    run: async () => ({ data: sectionTypes() }),
  }),
  define({
    id: "listStorefrontSections",
    method: "GET",
    path: "/storefront/sections",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "List the draft's sections",
    description:
      "The sections of the storefront draft, top to bottom, each with its stable id, type, position, field values and translations. Before anything has been saved the draft is the published page. Changes nothing. Edit a section with updateStorefrontSection, moveStorefrontSection, duplicateStorefrontSection or removeStorefrontSection.",
    input: z.object({}),
    run: async (ctx) => ({ sections: listSections(await draftOf(ctx)) }),
  }),
  define({
    id: "getStorefrontSection",
    method: "GET",
    path: "/storefront/sections/{sectionId}",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get a section",
    description: "One section of the storefront draft: its type, position, every field value and its translations. Changes nothing.",
    input: z.object({ sectionId }),
    run: async (ctx, input) => {
      const section = listSections(await draftOf(ctx)).find((s) => s.id === input.sectionId);
      if (!section) throw new ApiError(404, "not_found", "No section with this id on the draft. Call listStorefrontSections for the ids.", "sectionId");
      return section;
    },
  }),
  define({
    id: "addStorefrontSection",
    method: "POST",
    path: "/storefront/sections",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Add a section",
    description: `Adds a section of the given type to the draft at a position (the end when left out). Fields left out take the type's defaults; each value is checked against the type and every problem is returned under error.issues as { field, message }. Returns the new section's id and the draft's sections. Remove it again with removeStorefrontSection. ${NEXT_STEPS}`,
    status: 201,
    input: z.object({
      type: z.enum(SECTION_ORDER as [SectionType, ...SectionType[]]).describe("The section type, from listStorefrontSectionTypes."),
      position: position.optional(),
      fields: fields.optional(),
    }),
    run: async (ctx, input) => {
      const rules = await fieldRules(ctx);
      let added = "";
      const result = await edit(ctx, sectionAddedSummary(input.type), (tree) => {
        const next = addSection(tree, input, rules);
        added = next.id;
        return next.tree;
      });
      return { id: added, ...result };
    },
  }),
  define({
    id: "updateStorefrontSection",
    method: "PATCH",
    path: "/storefront/sections/{sectionId}",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Change a section's fields",
    description: `Changes some fields of a draft section; the others keep their value. Unknown fields and values that break a field's rule are refused together under error.issues as { field, message }, with the allowed values in the message, and nothing is saved. With a locale, the text fields are written as that language's copy; an empty string clears a translation. Returns the draft's sections. ${NEXT_STEPS}`,
    input: z.object({ sectionId, fields, locale: sectionLocale }),
    run: async (ctx, input) => {
      checkLocale(ctx, input.locale);
      const rules = await fieldRules(ctx);
      const { defaultLocale } = storeLanguages(ctx.store);
      return edit(
        ctx,
        (base) =>
          sectionChangedSummary(
            base[input.sectionId]?.type?.resolvedName,
            Object.keys(input.fields),
            input.locale && input.locale !== defaultLocale ? input.locale : undefined,
          ),
        (tree) => updateSection(tree, { ...input, defaultLocale }, rules),
      );
    },
  }),
  define({
    id: "moveStorefrontSection",
    method: "POST",
    path: "/storefront/sections/{sectionId}/move",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Move a section",
    description: `Moves a draft section to a new position, 0 being the top; the others close up around it. Returns the draft's sections. Move it back the same way. ${NEXT_STEPS}`,
    input: z.object({ sectionId, position }),
    run: async (ctx, input) => edit(ctx, `Moved a storefront draft section to position ${input.position}`, (tree) => moveSection(tree, input)),
  }),
  define({
    id: "duplicateStorefrontSection",
    method: "POST",
    path: "/storefront/sections/{sectionId}/duplicate",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Duplicate a section",
    description: `Copies a draft section, its translations included, to just below it. Returns the copy's id and the draft's sections. Remove the copy with removeStorefrontSection. ${NEXT_STEPS}`,
    status: 201,
    input: z.object({ sectionId }),
    run: async (ctx, input) => {
      let copy = "";
      const result = await edit(ctx, "Duplicated a storefront draft section", (tree) => {
        const next = duplicateSection(tree, input);
        copy = next.id;
        return next.tree;
      });
      return { id: copy, ...result };
    },
  }),
  define({
    id: "removeStorefrontSection",
    method: "DELETE",
    path: "/storefront/sections/{sectionId}",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Remove a section",
    description: `Takes a section off the draft. The published page keeps it until publishStorefront. To bring it back, add a new section, restore a saved version with restoreStorefrontVersion, or discard the draft with revertStorefront. Returns the draft's sections. ${NEXT_STEPS}`,
    input: z.object({ sectionId }),
    run: async (ctx, input) => edit(ctx, "Removed a section from the storefront draft", (tree) => removeSection(tree, input)),
  }),
  define({
    id: "getStorefrontSiteContent",
    method: "GET",
    path: "/storefront/site",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get the header, footer and search copy",
    description:
      "The draft's site-wide copy around the sections: up to three rotating announcement bar messages, the header's navigation labels, the footer note and newsletter copy, and the search title and description, in the default language and in every enabled language. Empty means the built-in default, or hidden for the announcement. Changes nothing. The header and footer layout is in getStorefrontLayout.",
    input: z.object({}),
    run: async (ctx) => {
      const tree = await draftOf(ctx);
      const { locales, defaultLocale } = storeLanguages(ctx.store);
      return {
        defaultLocale,
        content: Object.fromEntries(locales.map((locale) => [locale, siteContent(tree, locale, defaultLocale)])),
      };
    },
  }),
  define({
    id: "updateStorefrontSiteContent",
    method: "PATCH",
    path: "/storefront/site",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Change the header, footer and search copy",
    description: `Changes some of the draft's site-wide copy; the rest keeps its value. With a locale other than the default, the values are that language's translation and an empty string clears it. ${NEXT_STEPS}`,
    input: z.object({
      announcement: z.string().max(ROOT_LIMITS.text).optional().describe("The bar above the header. Empty hides it."),
      announcement2: z.string().max(ROOT_LIMITS.text).optional().describe("A second announcement; the bar rotates through them."),
      announcement3: z.string().max(ROOT_LIMITS.text).optional().describe("A third announcement."),
      navShop: z.string().max(ROOT_LIMITS.text).optional().describe("The header's link to all products. Empty uses the built-in label."),
      navOrders: z.string().max(ROOT_LIMITS.text).optional().describe("The header's link to order lookup. Empty uses the built-in label."),
      footerNote: z.string().max(ROOT_LIMITS.textarea).optional().describe("A line in the footer."),
      newsletterHeading: z.string().max(ROOT_LIMITS.text).optional().describe("The footer newsletter's heading. Empty uses the built-in one."),
      newsletterBody: z.string().max(ROOT_LIMITS.textarea).optional().describe("The footer newsletter's line under the heading. Empty uses the built-in one."),
      metaTitle: z.string().max(ROOT_LIMITS.text).optional().describe("The home page title in search results. Empty uses the store name."),
      metaDescription: z.string().max(ROOT_LIMITS.textarea).optional().describe("The description in search results and share previews."),
      locale: sectionLocale,
    }),
    run: async (ctx, { locale, ...values }) => {
      checkLocale(ctx, locale);
      const changed = ROOT_FIELDS.map((f) => f.key).filter((key) => values[key] !== undefined);
      if (changed.length === 0) throw new ApiError(422, "invalid_request", "Name at least one field to change.");
      const { locales, defaultLocale } = storeLanguages(ctx.store);
      const tree = await editStorefrontDraft(ctx, `Changed the storefront's ${changed.join(", ")}`, (base) => {
        const next = structuredClone(base);
        const props = { ...(next.ROOT.props ?? {}) };
        if (!locale || locale === defaultLocale) {
          for (const key of changed) props[key] = values[key];
        } else {
          let translations = props[I18N_PROP] as FieldTranslations | undefined;
          for (const key of changed) {
            translations = withTranslation(translations, locale, key, values[key] ?? "", false, String(props[key] ?? ""));
          }
          props[I18N_PROP] = translations;
        }
        next.ROOT.props = props;
        return next;
      });
      return {
        defaultLocale,
        content: Object.fromEntries(locales.map((l) => [l, siteContent(tree, l, defaultLocale)])),
        ...outdatedTranslations(ctx, tree),
        ...(await shippingClaimNotes(ctx, tree)),
      };
    },
  }),
  define({
    id: "previewStorefront",
    method: "GET",
    path: "/storefront/preview",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Preview the draft",
    description:
      "A signed link to the storefront home page as the draft has it, in the store's theme, for checking edits before publishStorefront. Anyone with the link can open it until expiresAt (24 hours); shoppers never see the draft otherwise. Changes nothing.",
    input: z.object({
      locale: z.enum(LOCALES).optional().describe("Show the draft in this enabled language. The default language when left out."),
    }),
    run: async (ctx, input) => {
      checkLocale(ctx, input.locale);
      const { defaultLocale } = storeLanguages(ctx.store);
      return storefrontPreviewLink(ctx.store, input.locale ?? defaultLocale, await siteOrigin());
    },
  }),
  define({
    id: "uploadStorefrontImage",
    method: "POST",
    path: "/storefront/images",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Upload an image",
    description:
      "Stores an image or video and returns its hosted URL. Use the URL as logoUrl in updateTheme, in any image or video field of a section with updateStorefrontSection, or in a product page block. Uploading changes nothing on the storefront by itself. Send the file base64-encoded.",
    status: 201,
    input: z.object({
      kind: z
        .enum(["logo", "section", "video"])
        .describe("logo: PNG, JPG, WEBP or SVG up to 8 MB. section: a PNG, JPG or WEBP photo up to 8 MB for a section's image. video: an MP4 or WebM up to 12 MB for a section's video (upload larger files in the editor)."),
      contentType: z.string().min(1).describe("The file's MIME type, such as image/png."),
      fileName: z.string().max(200).default("").describe("Optional. The original file name."),
      data: z
        .string()
        .min(1)
        .max(Math.ceil((12 * 1024 * 1024 * 4) / 3) + 4)
        .describe("The file's bytes, base64-encoded."),
    }),
    run: async (_ctx, input) => {
      const bytes = new Uint8Array(Buffer.from(input.data, "base64"));
      const scope = input.kind === "logo" ? "logo" : input.kind === "video" ? "sectionVideo" : "section";
      if (input.kind !== "video" && bytes.byteLength > UPLOAD_SCOPES[scope].maxBytes) {
        throw new ApiError(422, "invalid_request", "The file is over 8 MB.", "data");
      }
      const result = await storeUpload(scope, bytes, input.contentType, input.fileName);
      if (!result.ok) throw new ApiError(422, "invalid_request", result.message, "data");
      return result.image;
    },
  }),
  define({
    id: "getStorefrontLayout",
    method: "GET",
    path: "/storefront/layout",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get the header and footer settings",
    description:
      "The draft's header and footer settings: the announcement countdown, header layout (logo left or centred), sticky header, header over a full-bleed hero, mega menu with collection photos, footer layout, footer newsletter, payment methods, trust badges and social links, with every field's allowed values. Changes nothing. The copy (announcement messages, labels, footer note) is in getStorefrontSiteContent.",
    input: z.object({}),
    run: async (ctx) => ({
      settings: layoutValues(await draftOf(ctx)),
      fields: LAYOUT_FIELDS.map((field) => describeField(field, LAYOUT_DEFAULTS[field.key])),
    }),
  }),
  define({
    id: "updateStorefrontLayout",
    method: "PATCH",
    path: "/storefront/layout",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Change the header and footer settings",
    description: `Changes some header and footer settings of the draft; the others keep their value. Keys and allowed values are in getStorefrontLayout; every bad value is returned under error.issues. ${NEXT_STEPS}`,
    input: z.object({
      settings: z
        .record(z.string(), z.union([z.string(), z.boolean()]))
        .describe("Settings by key, such as { \"headerLayout\": \"center\", \"megaMenu\": true }."),
    }),
    run: async (ctx, input) => {
      const rules = await fieldRules(ctx);
      const issues: { field: string; message: string }[] = [];
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input.settings)) {
        const field = LAYOUT_FIELDS.find((f) => f.key === key);
        if (!field) {
          issues.push({ field: `settings.${key}`, message: `No such setting. The settings are: ${LAYOUT_FIELDS.map((f) => f.key).join(", ")}.` });
          continue;
        }
        const checked = checkFieldValue(field, value, rules);
        if ("message" in checked) issues.push({ field: `settings.${key}`, message: checked.message });
        else values[key] = checked.value;
      }
      if (Object.keys(input.settings).length === 0) issues.push({ field: "settings", message: "Name at least one setting to change." });
      if (issues.length > 0) throw new ApiError(422, "invalid_request", issues.map((i) => `\`${i.field}\`: ${i.message}`).join(" "), issues[0].field, { issues });
      const tree = await editStorefrontDraft(ctx, `Changed the storefront's ${Object.keys(values).join(", ")}`, (base) => {
        const next = structuredClone(base);
        next.ROOT.props = { ...(next.ROOT.props ?? {}), ...values };
        return next;
      });
      return { settings: layoutValues(tree) };
    },
  }),
  define({
    id: "getProductPageTemplate",
    method: "GET",
    path: "/storefront/product-page",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get the product page template",
    description:
      "The blocks every product page of the draft is built from, top to bottom (gallery and buy box, description tabs, size guide, features, text, reviews, related products, recently viewed), each with its id, type and settings, plus every block type with its fields. Changes nothing. Change it with updateProductPageTemplate.",
    input: z.object({}),
    run: async (ctx) => ({
      blocks: productBlocks(await draftOf(ctx)),
      blockTypes: PRODUCT_BLOCK_ORDER.map((type) => {
        const def = PRODUCT_BLOCK_DEFS[type];
        return {
          type,
          name: def.name,
          description: def.description,
          single: def.single,
          fields: def.fields.map((field) => describeField(field, def.defaults[field.key])),
        };
      }),
    }),
  }),
  define({
    id: "updateProductPageTemplate",
    method: "PUT",
    path: "/storefront/product-page",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Change the product page template",
    description: `Replaces the draft's product page template with these blocks, in order. Send every block to keep: a block with an id from getProductPageTemplate keeps its translations, one without gets a new id. The gallery and buy box block is required, and blocks marked single may appear once. Settings left out take the block type's defaults; text settings are the default language's copy, and a locale writes that language's translation instead. ${NEXT_STEPS}`,
    input: z.object({
      blocks: z
        .array(
          z.object({
            id: z.string().max(40).optional().describe("The block's id from getProductPageTemplate, to keep its translations."),
            type: z.enum(PRODUCT_BLOCK_ORDER as [ProductBlockType, ...ProductBlockType[]]),
            settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
          }),
        )
        .min(1)
        .max(PRODUCT_BLOCK_LIMIT),
      locale: sectionLocale,
    }),
    run: async (ctx, input) => {
      checkLocale(ctx, input.locale);
      const rules = await fieldRules(ctx);
      const { defaultLocale } = storeLanguages(ctx.store);
      const translating = Boolean(input.locale && input.locale !== defaultLocale);
      const issues: { field: string; message: string }[] = [];
      if (!input.blocks.some((b) => b.type === "ProductMain")) issues.push({ field: "blocks", message: "Keep the ProductMain block: shoppers buy from it." });
      for (const type of PRODUCT_BLOCK_ORDER) {
        if (PRODUCT_BLOCK_DEFS[type].single && input.blocks.filter((b) => b.type === type).length > 1) {
          issues.push({ field: "blocks", message: `${type} can appear once.` });
        }
      }
      const tree = await editStorefrontDraft(ctx, "Changed the product page template", (base) => {
        const current = productBlocks(base);
        const blocks: ProductBlock[] = input.blocks.map((block, index) => {
          const def = PRODUCT_BLOCK_DEFS[block.type];
          const before = current.find((b) => b.id === block.id && b.type === block.type);
          const props: Record<string, unknown> = { ...(before?.props ?? def.defaults) };
          for (const [key, value] of Object.entries(block.settings)) {
            const field = def.fields.find((f) => f.key === key);
            if (!field) {
              issues.push({ field: `blocks.${index}.settings.${key}`, message: `${block.type} has no such setting. Its settings are: ${def.fields.map((f) => f.key).join(", ") || "none"}.` });
              continue;
            }
            if (translating && !translatableBlockFields(block.type).includes(key)) {
              issues.push({ field: `blocks.${index}.settings.${key}`, message: "Only text settings are translated. Change this one without a locale." });
              continue;
            }
            const checked = checkFieldValue(field, value, rules);
            if ("message" in checked) {
              issues.push({ field: `blocks.${index}.settings.${key}`, message: checked.message });
            } else if (translating) {
              props[I18N_PROP] = withTranslation(
                props[I18N_PROP] as FieldTranslations | undefined,
                input.locale!,
                key,
                String(checked.value),
                false,
                String(props[key] ?? ""),
              );
            } else {
              props[key] = checked.value;
            }
          }
          return { id: before ? before.id : newBlockId(), type: block.type, props };
        });
        if (issues.length > 0) throw new SectionEditError(issues);
        const next = structuredClone(base);
        next.ROOT.props = { ...(next.ROOT.props ?? {}), [PRODUCT_PAGE_PROP]: blocks };
        return next;
      }).catch((error) => {
        if (error instanceof SectionEditError) {
          throw new ApiError(422, "invalid_request", error.message, error.issues[0]?.field, { issues: error.issues });
        }
        throw error;
      });
      if (issues.length > 0) throw new ApiError(422, "invalid_request", issues.map((i) => `\`${i.field}\`: ${i.message}`).join(" "), issues[0].field, { issues });
      return { blocks: productBlocks(tree), ...outdatedTranslations(ctx, tree), ...(await shippingClaimNotes(ctx, tree)) };
    },
  }),
  define({
    id: "translateStorefrontDraft",
    method: "POST",
    path: "/storefront/translations/{language}",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Translate the draft's copy into one language",
    description: `Machine-translates every text field of the storefront draft (sections, header and footer copy, search copy, product page template) that is missing or out of date in one enabled language, in one call. Translations that still match the default language are kept. Use it to translate the storefront into a language, and after changing copy in the default language, for each language listed under outdatedTranslations. Products, collections and gift portals are translated with translateMissing. Returns how many fields were translated. ${NEXT_STEPS}`,
    input: z.object({
      language: z.enum(LOCALES).describe("An enabled language other than the default."),
    }),
    run: async (ctx, input) => {
      checkLocale(ctx, input.language, "language");
      const { defaultLocale } = storeLanguages(ctx.store);
      if (input.language === defaultLocale) {
        throw new ApiError(422, "invalid_request", "This is the store's default language. Name another enabled language.", "language");
      }
      const { count } = await translateStorefrontDraft(ctx, input.language);
      return { language: input.language, translated: count, ...outdatedTranslations(ctx, await draftOf(ctx)) };
    },
  }),
];
