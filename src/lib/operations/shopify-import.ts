import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, recordAudit } from "../data";
import { db } from "../mongo";
import {
  IMPORT_KINDS,
  chunkRecords,
  detectKind,
  isJobOpen,
  parseCsv,
  redirectSource,
  redirectTarget,
  type CsvRecord,
  type ImportKind,
  type ShopifyImportJob,
} from "../shopify";
import {
  advanceImport,
  appendImportPart,
  cancelImportJob,
  createImportJob,
  getImport,
  queueImportJob,
} from "../shopify-import";
import type { UrlRedirect } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Importing a store from Shopify, and the redirects that keep its old
 * addresses working. The workspace's import page and the Admin API both run
 * these; the work itself is in `@/lib/shopify-import`.
 */

/** The most parts one file may be posted in, and records in one part. */
const MAX_PARTS = 400;
const MAX_PART_RECORDS = 25_000;

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.import" });
}

function audit(ctx: OperationContext, action: string, summary: string, meta: Record<string, string | number>) {
  recordAudit({
    category: "product_import",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta,
  });
}

async function openImport(ctx: OperationContext, importId: string): Promise<ShopifyImportJob> {
  const t = await messages(ctx);
  const job = await getImport(ctx.store.id, importId);
  if (!job) throw new OperationError("not_found", t("notFound"));
  return job;
}

/** Starts an import that waits for its files. The same key returns the same import. */
export function startImport(ctx: OperationContext, submissionKey: string | null): Promise<ShopifyImportJob> {
  return createImportJob(ctx.store, ctx.actor, submissionKey);
}

/** Files one part of a file. Posting a part again replaces it. */
export async function addImportPart(
  ctx: OperationContext,
  importId: string,
  input: { kind: ImportKind; part: number; header: string[]; records: CsvRecord[] },
): Promise<ShopifyImportJob> {
  const t = await messages(ctx);
  const job = await openImport(ctx, importId);
  if (job.status !== "uploading") throw new OperationError("conflict", t("alreadyStarted"));
  if (!IMPORT_KINDS.includes(input.kind)) throw new OperationError("invalid", t("wrongFile"), "kind");
  if (!Number.isInteger(input.part) || input.part < 0 || input.part >= MAX_PARTS) {
    throw new OperationError("invalid", t("fileTooLarge"), "part");
  }
  if (input.records.length > MAX_PART_RECORDS) throw new OperationError("invalid", t("fileTooLarge"), "records");
  if (detectKind(input.header) !== input.kind) throw new OperationError("invalid", t(`wrongFile_${input.kind}`), input.kind);
  const records = input.records
    .filter((record) => Number.isInteger(record.line) && Array.isArray(record.cells))
    .map((record) => ({ line: record.line, cells: record.cells.map((cell) => String(cell ?? "").slice(0, 20_000)) }));
  return appendImportPart(ctx.store, job, input.kind, input.part, input.header.map(String), records);
}

/** Hands the import to the background once its files are in. */
export async function queueImport(ctx: OperationContext, importId: string): Promise<ShopifyImportJob> {
  const t = await messages(ctx);
  const job = await openImport(ctx, importId);
  if (job.status === "uploading") {
    if (job.counts.products + job.counts.customers + job.counts.orders === 0) {
      throw new OperationError("invalid", t("nothingToImport"), "products");
    }
    audit(ctx, "store.shopify_import_started", `Started a Shopify import of ${job.counts.products} products, ${job.counts.customers} customers and ${job.counts.orders} orders`, {
      importId: job.id,
      products: job.counts.products,
      customers: job.counts.customers,
      orders: job.counts.orders,
    });
  }
  return queueImportJob(job);
}

/**
 * Where an import is up to. Reading an import that is still running also
 * moves it along, so it keeps going while anyone is watching.
 */
export async function importProgress(ctx: OperationContext, importId: string): Promise<ShopifyImportJob> {
  const job = await openImport(ctx, importId);
  if (!isJobOpen(job)) return job;
  return (await advanceImport(job.id, 6_000)) ?? job;
}

export async function cancelImport(ctx: OperationContext, importId: string): Promise<ShopifyImportJob> {
  const job = await openImport(ctx, importId);
  const cancelled = await cancelImportJob(job);
  if (cancelled.status === "cancelled" && job.status !== "cancelled") {
    audit(ctx, "store.shopify_import_cancelled", "Cancelled a Shopify import", { importId: job.id });
  }
  return cancelled;
}

/**
 * The API's way in: whole files as text. They are read, split and filed the
 * same way the import page posts them, then queued.
 */
export async function importFromFiles(
  ctx: OperationContext,
  input: { productsCsv?: string; customersCsv?: string; ordersCsv?: string; submissionKey?: string | null },
): Promise<ShopifyImportJob> {
  const t = await messages(ctx);
  const files: [ImportKind, string | undefined][] = [
    ["products", input.productsCsv],
    ["customers", input.customersCsv],
    ["orders", input.ordersCsv],
  ];
  const tables = files.flatMap(([kind, text]) => {
    if (!text?.trim()) return [];
    const table = parseCsv(text);
    if (detectKind(table.header) !== kind) throw new OperationError("invalid", t(`wrongFile_${kind}`), `${kind}Csv`);
    return [{ kind, table }];
  });
  if (!tables.some((entry) => entry.kind === "products")) throw new OperationError("invalid", t("productsRequired"), "productsCsv");

  let job = await startImport(ctx, input.submissionKey ?? null);
  if (job.status !== "uploading") return job;
  for (const { kind, table } of tables) {
    const parts = chunkRecords(kind, table);
    if (parts.length > MAX_PARTS) throw new OperationError("invalid", t("fileTooLarge"), `${kind}Csv`);
    for (const [part, records] of parts.entries()) {
      job = await appendImportPart(ctx.store, job, kind, part, table.header, records);
    }
  }
  return queueImport(ctx, job.id);
}

/* -------------------------------------------------------------- redirects */

/** Adds a redirect from an old Shopify address, or points an existing one somewhere new. */
export async function saveRedirect(ctx: OperationContext, input: { path: string; target: string }): Promise<UrlRedirect> {
  const t = await messages(ctx);
  const path = redirectSource(input.path);
  if (!path) throw new OperationError("invalid", t("redirectPathInvalid"), "path");
  const target = redirectTarget(input.target);
  if (!target) throw new OperationError("invalid", t("redirectTargetInvalid"), "target");
  if (target.toLowerCase() === path) throw new OperationError("invalid", t("redirectLoop"), "target");
  const count = await db.count(COLLECTIONS.urlRedirects, { storeId: ctx.store.id });
  const existing = await db.findOne<UrlRedirect>(COLLECTIONS.urlRedirects, { storeId: ctx.store.id, path });
  if (!existing && count >= 5000) throw new OperationError("conflict", t("redirectLimit", { max: 5000 }), "path");
  const now = new Date().toISOString();
  const saved = await db.findOneAndUpdate<UrlRedirect>(
    COLLECTIONS.urlRedirects,
    { storeId: ctx.store.id, path },
    {
      $set: { target, source: "manual" },
      $setOnInsert: { id: newId("rdr"), storeId: ctx.store.id, path, createdAt: now },
    },
    { upsert: true },
  );
  audit(ctx, "store.redirect_saved", `Redirected ${path} to ${target}`, { path, target });
  revalidatePath(`/app/stores/${ctx.store.id}/import`);
  return saved as UrlRedirect;
}

export async function deleteRedirect(ctx: OperationContext, redirectId: string): Promise<boolean> {
  const found = await db.findOne<UrlRedirect>(COLLECTIONS.urlRedirects, { storeId: ctx.store.id, id: redirectId });
  if (!found) return false;
  await db.deleteOne(COLLECTIONS.urlRedirects, { storeId: ctx.store.id, id: redirectId });
  audit(ctx, "store.redirect_deleted", `Removed the redirect from ${found.path}`, { path: found.path });
  revalidatePath(`/app/stores/${ctx.store.id}/import`);
  return true;
}
