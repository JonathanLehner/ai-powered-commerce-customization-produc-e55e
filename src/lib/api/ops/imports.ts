import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  cancelImport,
  deleteRedirect,
  importFromFiles,
  importProgress,
  saveRedirect,
} from "../../operations/shopify-import";
import type { OperationContext } from "../../operations/context";
import {
  IMPORT_KINDS,
  detectKind,
  jobIssues,
  jobProgress,
  parseCsv,
  readCustomers,
  readOrders,
  readProducts,
  type ImportIssue,
  type ShopifyImportJob,
} from "../../shopify";
import { listImports } from "../../shopify-import";
import { listRedirects } from "../../url-redirects";
import type { UrlRedirect } from "../../types";
import { currencyDecimals } from "../../util";
import { define, id, notFound, type ApiOperation } from "../define";

/**
 * Importing from Shopify: preview the export files, import them in the
 * background, follow the progress and the per-row report. And the redirects
 * that send a Shopify store's old addresses to their pages here.
 */

async function issueTexts(issues: ImportIssue[]) {
  const t = await getTranslations({ locale: "en", namespace: "import.issues" });
  return issues.map((issue) => ({
    file: issue.kind,
    line: issue.line,
    record: issue.ref,
    severity: issue.severity,
    code: issue.key,
    message: t(issue.key, issue.values ?? {}),
  }));
}

export async function presentImport(job: ShopifyImportJob) {
  const issues = jobIssues(job);
  return {
    id: job.id,
    status: job.status,
    progress: jobProgress(job),
    received: job.counts,
    processed: job.processed,
    created: job.created,
    updated: job.updated,
    failed: job.failed,
    issueCount: issues.length,
    issues: await issueTexts(issues.slice(0, 200)),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function presentRedirect(redirect: UrlRedirect) {
  return { id: redirect.id, path: redirect.path, target: redirect.target, source: redirect.source, createdAt: redirect.createdAt };
}

const files = {
  productsCsv: z.string().max(25_000_000).optional().describe("Shopify's product CSV export, as text."),
  customersCsv: z.string().max(25_000_000).optional().describe("Shopify's customer CSV export, as text."),
  ordersCsv: z.string().max(25_000_000).optional().describe("Shopify's order CSV export, as text."),
};

async function job(ctx: OperationContext, importId: string) {
  return importProgress(ctx, importId).catch(() => notFound("Import"));
}

export const importOperations: ApiOperation[] = [
  define({
    id: "previewShopifyImport",
    method: "POST",
    path: "/imports/preview",
    scope: "store:read",
    tag: "Import",
    summary: "Preview a Shopify import",
    description:
      "Reads Shopify export files without importing anything: how many products, variants, images, customers and orders they hold, the first products as they would be imported, and every problem by file and line.",
    input: z.object(files),
    run: async (ctx, input) => {
      const decimals = currencyDecimals(ctx.store.defaultCurrency);
      const issues: ImportIssue[] = [];
      const summary: Record<string, unknown> = {};
      if (input.productsCsv?.trim()) {
        const table = parseCsv(input.productsCsv);
        const read = detectKind(table.header) === "products" ? readProducts(table, decimals) : { products: [], issues: [] };
        issues.push(...read.issues);
        summary.products = read.products.length;
        summary.variants = read.products.reduce((sum, p) => sum + p.variants.length, 0);
        summary.images = read.products.reduce((sum, p) => sum + p.images.length, 0);
        summary.sample = read.products.slice(0, 10).map((p) => ({
          handle: p.handle,
          title: p.title,
          status: p.status,
          options: p.options,
          variants: p.variants.length,
          images: p.images.length,
          seoTitle: p.seoTitle,
          prices: p.variants.map((v) => v.price),
          stock: p.variants.some((v) => v.quantity !== null) ? p.variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0) : null,
        }));
      }
      if (input.customersCsv?.trim()) {
        const read = readCustomers(parseCsv(input.customersCsv));
        issues.push(...read.issues);
        summary.customers = read.customers.length;
      }
      if (input.ordersCsv?.trim()) {
        const read = readOrders(parseCsv(input.ordersCsv), ctx.store.defaultCurrency);
        issues.push(...read.issues);
        summary.orders = read.orders.length;
      }
      return { ...summary, issueCount: issues.length, issues: await issueTexts(issues.slice(0, 200)) };
    },
  }),
  define({
    id: "createShopifyImport",
    method: "POST",
    path: "/imports",
    scope: "store:write",
    tag: "Import",
    status: 201,
    summary: "Import from Shopify",
    description: `Imports Shopify's product export, and optionally its customer and order exports, in the background: products with their handles, options, variants, images, SEO fields and stock, then customers, then orders. A product whose handle is taken gets a new address and a redirect from its old one. Follow it with getShopifyImport. Files: ${IMPORT_KINDS.join(", ")}.`,
    input: z.object({
      ...files,
      submissionKey: z.string().min(8).max(100).optional().describe("Sending the same key again returns the first import instead of starting another."),
    }),
    actions: ["shopify-import#startShopifyImport", "shopify-import#uploadShopifyImportPart", "shopify-import#queueShopifyImport"],
    run: async (ctx, input) => presentImport(await importFromFiles(ctx, input)),
  }),
  define({
    id: "listShopifyImports",
    method: "GET",
    path: "/imports",
    scope: "store:read",
    tag: "Import",
    summary: "List Shopify imports",
    description: "The store's latest imports, newest first.",
    input: z.object({}),
    run: async (ctx) => ({ data: await Promise.all((await listImports(ctx.store.id, 20)).map(presentImport)) }),
  }),
  define({
    id: "getShopifyImport",
    method: "GET",
    path: "/imports/{importId}",
    scope: "store:read",
    tag: "Import",
    summary: "Get an import's progress and report",
    description:
      "Status (uploading, queued, running, done, failed or cancelled), progress in percent, what was created, updated and failed per file, and the problems by file and line. Fetching a running import also moves it along.",
    input: z.object({ importId: id("import") }),
    actions: ["shopify-import#shopifyImportProgress"],
    run: async (ctx, input) => presentImport(await job(ctx, input.importId)),
  }),
  define({
    id: "cancelShopifyImport",
    method: "POST",
    path: "/imports/{importId}/cancel",
    scope: "store:write",
    tag: "Import",
    summary: "Cancel an import",
    description: "Stops an import that is still running. What it already imported stays.",
    input: z.object({ importId: id("import") }),
    actions: ["shopify-import#cancelShopifyImport"],
    run: async (ctx, input) => {
      await job(ctx, input.importId);
      return presentImport(await cancelImport(ctx, input.importId));
    },
  }),
  define({
    id: "listRedirects",
    method: "GET",
    path: "/redirects",
    scope: "storefront:read",
    tag: "Import",
    summary: "List URL redirects",
    description:
      "Permanent (301) redirects from old Shopify addresses (/products/…, /collections/…, /pages/…) on the store's own domain. The import adds one for every product whose handle changed.",
    input: z.object({}),
    run: async (ctx) => ({ data: (await listRedirects(ctx.store.id)).map(presentRedirect) }),
  }),
  define({
    id: "createRedirect",
    method: "POST",
    path: "/redirects",
    scope: "storefront:write",
    tag: "Import",
    status: 201,
    summary: "Add a URL redirect",
    description: "Redirects an old /products/, /collections/ or /pages/ address to a page of the storefront, such as /collections/summer. Saving the same address again changes where it goes.",
    input: z.object({
      path: z.string().min(1).max(300).describe("The old address, such as /pages/about-us."),
      target: z.string().min(1).max(300).describe("Where it goes, such as /pages/about."),
    }),
    actions: ["shopify-import#saveRedirect"],
    run: async (ctx, input) => presentRedirect(await saveRedirect(ctx, input)),
  }),
  define({
    id: "deleteRedirect",
    method: "DELETE",
    path: "/redirects/{redirectId}",
    scope: "storefront:write",
    tag: "Import",
    summary: "Remove a URL redirect",
    description: "The old address stops redirecting.",
    destructive: true,
    input: z.object({ redirectId: id("redirect") }),
    actions: ["shopify-import#deleteRedirect"],
    run: async (ctx, input) => {
      if (!(await deleteRedirect(ctx, input.redirectId))) notFound("Redirect");
      return { removed: true };
    },
  }),
];
