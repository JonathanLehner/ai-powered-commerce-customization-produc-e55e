import "server-only";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { siteOrigin } from "../../email";
import { applyTemplate, requireTemplate } from "../../operations/templates";
import { PRODUCT_BLOCK_DEFS } from "../../product-template";
import { SECTION_DEFS } from "../../storefront-schema";
import { templatePreviewLink } from "../../storefront-preview";
import {
  listTemplates,
  STARTER_CATALOG,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STYLES,
  templateCopy,
  templateSummary,
} from "../../templates/index";
import { define, type ApiOperation } from "../define";

/**
 * Store templates: complete looks with sections, product page, header and
 * footer, design tokens, sample copy, imagery and suggested products. Reading
 * them changes nothing; applying one changes the storefront draft only.
 */

const templateId = z.string().min(1).describe("The template id, from listTemplates, such as \"terminal\" or \"matchday\".");
const locale = z.enum(LOCALES).optional().describe("The language the template's copy is returned or previewed in. The store's default language when left out.");

export const templateOperations: ApiOperation[] = [
  define({
    id: "listTemplates",
    method: "GET",
    path: "/templates",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "List templates",
    description: `Every store template with its category, style tags, colours, fonts and preview images. Filter by category (${TEMPLATE_CATEGORIES.join(", ")}) and style (${TEMPLATE_STYLES.join(", ")}). Changes nothing.`,
    input: z.object({
      category: z.enum(TEMPLATE_CATEGORIES).optional().describe("Only templates in this category."),
      style: z.enum(TEMPLATE_STYLES).optional().describe("Only templates with this style tag."),
      locale,
    }),
    run: async (ctx, input) => {
      const language = input.locale ?? storeLanguages(ctx.store).defaultLocale;
      return { templates: listTemplates({ category: input.category, style: input.style }).map((t) => templateSummary(t, language)) };
    },
  }),
  define({
    id: "getTemplate",
    method: "GET",
    path: "/templates/{templateId}",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Get a template",
    description:
      "One template in full: its summary, design tokens, header and footer settings, home page sections, product page blocks, collection layout, imagery and suggested shared-catalog products, with its copy in the requested language. Changes nothing.",
    input: z.object({ templateId, locale }),
    run: async (ctx, input) => {
      const template = requireTemplate(input.templateId);
      const language = input.locale ?? storeLanguages(ctx.store).defaultLocale;
      const copy = templateCopy(template, language);
      return {
        ...templateSummary(template, language),
        brand: { name: template.brand.name, tagline: copy.tagline },
        design: { theme: template.theme, ...template.design },
        layout: template.layout,
        collection: template.collection,
        sections: template.sections.map((s) => ({ type: s.type, name: SECTION_DEFS[s.type].name })),
        productPage: template.productPage.map((b) => ({ type: b.type, name: PRODUCT_BLOCK_DEFS[b.type].name })),
        images: { hero: template.assets.hero, lifestyle: template.assets.lifestyle, banner: template.assets.banner },
        starterProducts: template.products.map((p, i) => ({
          catalogProductId: STARTER_CATALOG[p.starter],
          name: copy[`product:${i}:name`],
          description: copy[`product:${i}:description`],
          colour: p.colour,
          image: template.assets.products[i] ?? null,
        })),
      };
    },
  }),
  define({
    id: "previewTemplate",
    method: "GET",
    path: "/templates/{templateId}/preview",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "Preview a template with the store's products",
    description:
      "A signed link to the store's home page drawn in the template, with the store's own name and products, valid for 24 hours. Nothing is applied: the draft and the live storefront are unchanged.",
    input: z.object({ templateId, locale }),
    run: async (ctx, input) => {
      const template = requireTemplate(input.templateId);
      const language = input.locale ?? storeLanguages(ctx.store).defaultLocale;
      return templatePreviewLink(ctx.store, template.id, language, await siteOrigin());
    },
    actions: ["storefront#previewStoreTemplate"],
  }),
  define({
    id: "applyTemplate",
    method: "POST",
    path: "/templates/{templateId}/apply",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Apply a template to the draft",
    description:
      "Makes the template the storefront draft: its sections, product page, header and footer, collection layout and design, with its copy in the store's languages. Products, orders and settings are not changed, and shoppers see nothing until publishStorefront is called. The draft it replaces is kept in the version history (previousVersionId); restore it with restoreStorefrontVersion. With addStarterProducts, the template's suggested shared-catalog products are added as draft products, once per template.",
    input: z.object({
      templateId,
      addStarterProducts: z.boolean().optional().describe("Also add the template's suggested products as drafts. Off unless set."),
    }),
    run: async (ctx, input) => applyTemplate(ctx, { templateId: input.templateId, addStarterProducts: input.addStarterProducts }),
    actions: ["storefront#applyStoreTemplate"],
  }),
];
