import "server-only";
import { z } from "zod";
import { LOCALES, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getStorefront, listProductCollections } from "../../data";
import { siteOrigin } from "../../email";
import type { OperationContext } from "../../operations/context";
import { editStorefrontDraft, parseTree } from "../../operations/storefront";
import { storefrontPreviewLink } from "../../storefront-preview";
import { SECTION_ORDER, type CraftTree, type SectionType } from "../../storefront-schema";
import {
  addSection,
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
import { I18N_PROP, SEO_FIELDS, SITE_FIELDS, siteContent, withTranslation, type FieldTranslations } from "../../translations";
import { storeUpload, UPLOAD_SCOPES } from "../../uploads";
import { ApiError } from "../auth";
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
  return { collectionIds: (await listProductCollections(ctx.store.id)).map((c) => c.id) };
}

function checkLocale(ctx: OperationContext, locale: Locale | undefined, field = "locale") {
  if (locale && !storeLanguages(ctx.store).locales.includes(locale)) {
    throw new ApiError(422, "invalid_request", `The store does not have ${locale} enabled. Enable it with updateLanguages first.`, field);
  }
}

/** Runs a section edit, turning its problems into a field-level API error listing every one. */
async function edit(ctx: OperationContext, summary: string, change: (tree: CraftTree) => CraftTree) {
  try {
    const tree = await editStorefrontDraft(ctx, summary, change);
    return { sections: listSections(tree) };
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
      const result = await edit(ctx, `Added a ${input.type} section to the storefront draft`, (tree) => {
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
        `Changed ${Object.keys(input.fields).join(", ")} of a storefront draft section${input.locale && input.locale !== defaultLocale ? ` in ${input.locale}` : ""}`,
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
      "The draft's site-wide copy around the sections: announcement bar, the header's navigation labels, the footer note, and the search title and description, in the default language and in every enabled language. Empty means the built-in default, or hidden for the announcement. Changes nothing.",
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
      navShop: z.string().max(ROOT_LIMITS.text).optional().describe("The header's link to all products. Empty uses the built-in label."),
      navOrders: z.string().max(ROOT_LIMITS.text).optional().describe("The header's link to order lookup. Empty uses the built-in label."),
      footerNote: z.string().max(ROOT_LIMITS.textarea).optional().describe("A line in the footer."),
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
          for (const key of changed) translations = withTranslation(translations, locale, key, values[key] ?? "");
          props[I18N_PROP] = translations;
        }
        next.ROOT.props = props;
        return next;
      });
      return { defaultLocale, content: Object.fromEntries(locales.map((l) => [l, siteContent(tree, l, defaultLocale)])) };
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
      "Stores an image and returns its hosted URL. Use the URL as logoUrl in updateTheme, or in any url field of a section (imageUrl) with updateStorefrontSection. Uploading changes nothing on the storefront by itself. Send the file base64-encoded.",
    status: 201,
    input: z.object({
      kind: z
        .enum(["logo", "section"])
        .describe("logo: PNG, JPG, WEBP or SVG up to 8 MB. section: a PNG, JPG or WEBP photo up to 8 MB for a section's image."),
      contentType: z.string().min(1).describe("The file's MIME type, such as image/png."),
      fileName: z.string().max(200).default("").describe("Optional. The original file name."),
      data: z
        .string()
        .min(1)
        .max(Math.ceil((UPLOAD_SCOPES.logo.maxBytes * 4) / 3) + 4)
        .describe("The file's bytes, base64-encoded."),
    }),
    run: async (_ctx, input) => {
      const bytes = new Uint8Array(Buffer.from(input.data, "base64"));
      // A section photo follows the same rules as a collection's header image.
      const result = await storeUpload(input.kind === "logo" ? "logo" : "collection", bytes, input.contentType, input.fileName);
      if (!result.ok) throw new ApiError(422, "invalid_request", result.message, "data");
      return result.image;
    },
  }),
];
