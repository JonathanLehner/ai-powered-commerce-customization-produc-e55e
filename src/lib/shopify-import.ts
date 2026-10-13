import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { syncCustomers } from "./customer-data";
import { COLLECTIONS, getStore, getStoreProductBySlug, getTaxBracket, recordAudit } from "./data";
import { changeStock } from "./inventory";
import { db } from "./mongo";
import { computeBreakdown } from "./pricing";
import { publishBlockersFor } from "./publish-blockers";
import { SEO_LIMITS } from "./seo";
import {
  ISSUE_LIMIT,
  readCustomers,
  readOrders,
  readProducts,
  type CsvRecord,
  type ImportIssue,
  type ImportKind,
  type ShopifyCustomer,
  type ShopifyImportJob,
  type ShopifyOrder,
  type ShopifyProduct,
} from "./shopify";
import { baseStoreSku, nextFreeSku } from "./sku";
import type { Customer, MockupImage, Order, Store, StoreProduct, StoreVariant, UrlRedirect } from "./types";
import { storeUpload } from "./uploads";
import { currencyDecimals, newId, slugify } from "./util";

/**
 * Runs a Shopify import in the background.
 *
 * The browser reads the files, previews them, and posts their records in
 * parts; each part is read again here with the same reader (`@/lib/shopify`),
 * so nothing the browser says is taken on trust. The records wait in
 * `shopify_import_rows` and are imported a few at a time — products first,
 * since orders point at them, then customers, then orders — by whichever
 * request holds the import's lease: the one that queued it (after its
 * response, through `after()`), and then the progress page's polls, so an
 * import keeps moving for as long as anyone is watching it and picks up where
 * it stopped if a worker is cut off.
 */

interface ImportRow {
  id: string;
  importId: string;
  storeId: string;
  kind: ImportKind;
  /** `part * 100000 + index`, so rows import in file order. */
  seq: number;
  part: number;
  payload: ShopifyProduct | ShopifyCustomer | ShopifyOrder;
  status: "pending" | "done";
}

const KIND_ORDER: ImportKind[] = ["products", "customers", "orders"];
const BATCH: Record<ImportKind, number> = { products: 4, customers: 100, orders: 40 };
const LEASE_MS = 60_000;
const IMAGES_PER_PRODUCT = 10;

const zero = () => ({ products: 0, customers: 0, orders: 0 });

export function getImport(storeId: string, importId: string): Promise<ShopifyImportJob | null> {
  return db.findOne<ShopifyImportJob>(COLLECTIONS.shopifyImports, { storeId, id: importId });
}

export function listImports(storeId: string, limit = 10): Promise<ShopifyImportJob[]> {
  return db.find<ShopifyImportJob>(COLLECTIONS.shopifyImports, { storeId }, { sort: { createdAt: -1 }, limit });
}

/** Starts an import that is waiting for its records. A repeated start with the same key returns the same import. */
export async function createImportJob(
  store: Store,
  actor: { id: string; name: string },
  submissionKey: string | null,
): Promise<ShopifyImportJob> {
  if (submissionKey) {
    const existing = await db.findOne<ShopifyImportJob>(COLLECTIONS.shopifyImports, { storeId: store.id, submissionKey });
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const job: ShopifyImportJob = {
    id: newId("imp"),
    storeId: store.id,
    status: "uploading",
    submissionKey,
    counts: zero(),
    processed: zero(),
    created: zero(),
    updated: zero(),
    failed: zero(),
    partIssues: {},
    issues: [],
    leaseUntil: null,
    createdById: actor.id,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  await db.insertOne(COLLECTIONS.shopifyImports, job as unknown as Record<string, unknown>);
  return job;
}

/**
 * Reads one part of a file and files its records. Posting the same part again
 * replaces it, so a retried upload never doubles anything.
 */
export async function appendImportPart(
  store: Store,
  job: ShopifyImportJob,
  kind: ImportKind,
  part: number,
  header: string[],
  records: CsvRecord[],
): Promise<ShopifyImportJob> {
  const table = { header, records };
  const read =
    kind === "products"
      ? (() => {
          const { products, issues } = readProducts(table, currencyDecimals(store.defaultCurrency));
          return { payloads: products as ImportRow["payload"][], issues };
        })()
      : kind === "customers"
        ? (() => {
            const { customers, issues } = readCustomers(table);
            return { payloads: customers as ImportRow["payload"][], issues };
          })()
        : (() => {
            const { orders, issues } = readOrders(table, store.defaultCurrency);
            return { payloads: orders as ImportRow["payload"][], issues };
          })();

  await db.deleteMany(COLLECTIONS.shopifyImportRows, { importId: job.id, kind, part });
  if (read.payloads.length > 0) {
    await db.insertMany(
      COLLECTIONS.shopifyImportRows,
      read.payloads.map(
        (payload, index): ImportRow => ({
          id: `${job.id}:${kind}:${part}:${index}`,
          importId: job.id,
          storeId: store.id,
          kind,
          seq: part * 100_000 + index,
          part,
          payload,
          status: "pending",
        }),
      ) as unknown as Record<string, unknown>[],
    );
  }
  const count = await db.count(COLLECTIONS.shopifyImportRows, { importId: job.id, kind });
  const patch = {
    [`counts.${kind}`]: count,
    [`partIssues.${kind}:${part}`]: read.issues.slice(0, ISSUE_LIMIT),
    updatedAt: new Date().toISOString(),
  };
  await db.updateOne(COLLECTIONS.shopifyImports, { id: job.id }, { $set: patch });
  return (await getImport(store.id, job.id)) ?? job;
}

/** Hands the import to the background once every part is in. */
export async function queueImportJob(job: ShopifyImportJob): Promise<ShopifyImportJob> {
  if (job.status === "uploading") {
    await db.updateOne(
      COLLECTIONS.shopifyImports,
      { id: job.id, status: "uploading" },
      { $set: { status: "queued", updatedAt: new Date().toISOString() } },
    );
  }
  const run = () => advanceImport(job.id, 25_000).catch((error: unknown) => console.error("Import could not run", error));
  try {
    after(run);
  } catch {
    // Outside a request (a script): the progress reads move it along.
  }
  return (await getImport(job.storeId, job.id)) ?? job;
}

export async function cancelImportJob(job: ShopifyImportJob): Promise<ShopifyImportJob> {
  if (job.status === "done" || job.status === "cancelled" || job.status === "failed") return job;
  await db.updateOne(
    COLLECTIONS.shopifyImports,
    { id: job.id },
    { $set: { status: "cancelled", finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } },
  );
  await db.deleteMany(COLLECTIONS.shopifyImportRows, { importId: job.id, status: "pending" });
  return (await getImport(job.storeId, job.id)) ?? job;
}

/** Takes the import's lease, or null while another worker holds it. */
async function lease(importId: string): Promise<ShopifyImportJob | null> {
  const now = new Date();
  return db.findOneAndUpdate<ShopifyImportJob>(
    COLLECTIONS.shopifyImports,
    {
      id: importId,
      status: { $in: ["queued", "running"] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now.toISOString() } }],
    },
    {
      $set: {
        status: "running",
        leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(),
        updatedAt: now.toISOString(),
      },
    },
  );
}

/**
 * Imports as many records as fit in `budgetMs`, if no one else is. Returns the
 * import as it stands afterwards.
 */
export async function advanceImport(importId: string, budgetMs: number): Promise<ShopifyImportJob | null> {
  const job = await lease(importId);
  if (!job) return db.findOne<ShopifyImportJob>(COLLECTIONS.shopifyImports, { id: importId });
  const deadline = Date.now() + budgetMs;
  const store = await getStore(job.storeId);
  if (!store) {
    await db.updateOne(COLLECTIONS.shopifyImports, { id: job.id }, { $set: { status: "failed", leaseUntil: null } });
    return null;
  }
  if (!job.startedAt) {
    await db.updateOne(COLLECTIONS.shopifyImports, { id: job.id }, { $set: { startedAt: new Date().toISOString() } });
  }
  const context = new ImportContext(store, job);

  let finished = false;
  while (Date.now() < deadline) {
    const next = await nextRows(job.id);
    if (!next) {
      finished = true;
      break;
    }
    await context.run(next.kind, next.rows);
    // Renew the lease while working; give up quietly if the import was cancelled meanwhile.
    const renewed = await db.findOneAndUpdate<ShopifyImportJob>(
      COLLECTIONS.shopifyImports,
      { id: job.id, status: "running" },
      { $set: { leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() } },
    );
    if (!renewed) return getImport(store.id, job.id);
  }

  const now = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.shopifyImports,
    { id: job.id, status: "running" },
    {
      $set: {
        leaseUntil: null,
        updatedAt: now,
        ...(finished ? { status: "done", finishedAt: now } : {}),
      },
    },
  );
  if (finished) await context.finish();
  return getImport(store.id, job.id);
}

async function nextRows(importId: string): Promise<{ kind: ImportKind; rows: ImportRow[] } | null> {
  for (const kind of KIND_ORDER) {
    const rows = await db.find<ImportRow>(
      COLLECTIONS.shopifyImportRows,
      { importId, kind, status: "pending" },
      { sort: { seq: 1 }, limit: BATCH[kind] },
    );
    if (rows.length > 0) return { kind, rows };
  }
  return null;
}

/* ------------------------------------------------------------- the import */

class ImportContext {
  private readonly store: Store;
  private readonly job: ShopifyImportJob;
  private readonly actor: { id: string; name: string };
  /** Variant SKUs of the store, for matching order lines to products. */
  private skuIndex: Map<string, { productId: string; variantId: string; supplierId: string }> | null = null;
  private readonly orderEmails = new Set<string>();

  constructor(store: Store, job: ShopifyImportJob) {
    this.store = store;
    this.job = job;
    this.actor = { id: job.createdById, name: job.createdByName };
  }

  async run(kind: ImportKind, rows: ImportRow[]) {
    for (const row of rows) {
      const counters: Record<string, number> = { [`processed.${kind}`]: 1 };
      const issues: ImportIssue[] = [];
      try {
        const outcome =
          kind === "products"
            ? await this.product(row.payload as ShopifyProduct, issues)
            : kind === "customers"
              ? await this.customer(row.payload as ShopifyCustomer)
              : await this.order(row.payload as ShopifyOrder, issues);
        counters[`${outcome}.${kind}`] = 1;
      } catch (error) {
        console.error("Import row failed", row.id, error);
        const payload = row.payload as { line: number; handle?: string; email?: string; name?: string };
        issues.push({
          kind,
          line: payload.line,
          ref: payload.handle ?? payload.email ?? payload.name ?? "",
          key: "rowFailed",
          severity: "error",
        });
        counters[`failed.${kind}`] = 1;
      }
      await db.updateOne(COLLECTIONS.shopifyImportRows, { id: row.id }, { $set: { status: "done" } });
      await db.updateOne(
        COLLECTIONS.shopifyImports,
        { id: this.job.id },
        {
          $inc: counters,
          ...(issues.length > 0 ? { $push: { issues: { $each: issues, $slice: ISSUE_LIMIT } } } : {}),
          $set: { updatedAt: new Date().toISOString() },
        },
      );
    }
    if (kind === "orders" && this.orderEmails.size > 0) {
      await syncCustomers(this.store, [...this.orderEmails]);
      this.orderEmails.clear();
    }
  }

  async finish() {
    await db.deleteMany(COLLECTIONS.shopifyImportRows, { importId: this.job.id });
    const done = (await getImport(this.store.id, this.job.id)) ?? this.job;
    recordAudit({
      category: "product_import",
      action: "store.shopify_imported",
      summary: `Imported from Shopify: ${done.created.products + done.updated.products} products, ${done.created.customers + done.updated.customers} customers, ${done.created.orders} orders`,
      storeId: this.store.id,
      agencyId: this.store.agencyId,
      actorId: this.actor.id,
      actorName: this.actor.name,
      entity: "store",
      entityId: this.store.id,
      meta: {
        importId: this.job.id,
        products: done.created.products + done.updated.products,
        customers: done.created.customers + done.updated.customers,
        orders: done.created.orders,
        failed: done.failed.products + done.failed.customers + done.failed.orders,
      },
    });
    try {
      revalidatePath(`/app/stores/${this.store.id}`, "layout");
      revalidatePath(`/s/${this.store.slug}`, "layout");
    } catch {
      // After the response there is nothing left to revalidate for.
    }
  }

  /* ------------------------------------------------------------ products */

  private async product(source: ShopifyProduct, issues: ImportIssue[]): Promise<"created" | "updated" | "failed"> {
    const { store } = this;
    if (source.giftCard) {
      issues.push({ kind: "products", line: source.line, ref: source.handle, key: "giftCardSkipped", severity: "warning" });
      return "failed";
    }
    const existing = await db.findOne<StoreProduct>(COLLECTIONS.storeProducts, {
      storeId: store.id,
      "imported.handle": source.handle,
    });
    const now = new Date().toISOString();

    let slug = existing?.slug ?? "";
    if (!slug) {
      const base = slugify(source.handle) || slugify(source.title) || "product";
      slug = base;
      for (let n = 2; await getStoreProductBySlug(store.id, slug); n++) slug = `${base}-${n}`;
    }
    if (slug !== source.handle) await this.redirect(`/products/${source.handle}`, `/products/${slug}`);

    const mockups = await this.images(source, existing, issues);
    const variants = this.variants(source, existing);
    const first = variants[0];
    const bracket = store.defaultTaxBracketId ? await getTaxBracket(store.defaultTaxBracketId) : null;
    const costs = computeBreakdown({
      supplierCost: first.baseCost,
      customizationCost: 0,
      shippingEstimate: 0,
      sellingPrice: first.price,
      taxRate: bracket?.rate ?? 0,
      pricesIncludeTax: store.pricesIncludeTax,
      currency: store.defaultCurrency,
      taxBracketId: bracket?.id ?? null,
    });

    const searchText = `${source.type} ${source.title} ${source.tags.join(" ")}`.toLowerCase();
    const product: StoreProduct = {
      id: existing?.id ?? newId("prd"),
      storeId: store.id,
      catalogProductId: "shopify",
      supplierId: "",
      name: source.title.slice(0, 120),
      slug,
      sku: existing?.sku ?? baseStoreSku(store.channelCode, source.title),
      description: source.description,
      seoTitle: source.seoTitle.slice(0, SEO_LIMITS.seoTitle),
      seoDescription: source.seoDescription.slice(0, SEO_LIMITS.seoDescription),
      tags: source.tags,
      category: /\b(mug|mugs|cup|cups|tumbler|bottle|drinkware)\b/.test(searchText) ? "drinkware" : "apparel",
      status: existing?.status ?? "draft",
      visibility: existing?.visibility ?? "public",
      price: first.price,
      currency: store.defaultCurrency,
      taxBracketId: bracket?.id ?? null,
      variants,
      artworks: [],
      mockups,
      shopperCustomization: existing?.shopperCustomization ?? {
        artworkUpload: false,
        textLine: false,
        textLabel: "",
        maxTextLength: 0,
      },
      costs,
      translations: existing?.translations ?? {},
      imported: { platform: "shopify", handle: source.handle, importId: this.job.id },
      importedBy: existing?.importedBy ?? this.actor.name,
      importedAt: existing?.importedAt ?? now,
      updatedAt: now,
      publishedAt: existing?.publishedAt ?? null,
    };

    // Live on Shopify goes live here when nothing stands in the way; anything
    // else waits as a draft with the reasons on its page.
    if (source.status === "archived") product.status = "archived";
    else if (source.status === "draft" || !source.published) product.status = existing?.status === "published" ? "published" : "draft";
    else {
      const blockers = (await publishBlockersFor([product], "en")).get(product.id) ?? [];
      product.status = blockers.length === 0 ? "published" : "draft";
    }
    if (product.status === "published") product.publishedAt ??= now;

    if (existing) {
      await db.updateOne(COLLECTIONS.storeProducts, { storeId: store.id, id: existing.id }, { $set: product });
    } else {
      await db.insertOne(COLLECTIONS.storeProducts, product as unknown as Record<string, unknown>);
    }

    for (const [index, variant] of source.variants.entries()) {
      if (variant.quantity === null) continue;
      const saved = product.variants[index];
      await changeStock(
        store,
        { productId: product.id, variantId: saved.id, label: { productName: product.name, variantName: saved.name, sku: saved.sku } },
        { tracked: true, policy: variant.policy, available: Math.max(0, variant.quantity), reason: "import" },
        this.actor,
      );
    }
    this.skuIndex = null;
    return existing ? "updated" : "created";
  }

  private variants(source: ShopifyProduct, existing: StoreProduct | null): StoreVariant[] {
    const colourAt = source.options.findIndex((name) => /colou?r|farbe|couleur|kleur|colore|färg/i.test(name));
    const sizeAt = source.options.findIndex((name) => /size|größe|grösse|taille|talla|maat|taglia|storlek/i.test(name));
    const taken = new Set<string>();
    return source.variants.map((variant) => {
      const name = variant.options.filter(Boolean).join(" / ") || "Default";
      const previous =
        existing?.variants.find((v) => variant.sku && v.sku === variant.sku) ?? existing?.variants.find((v) => v.name === name);
      const sku = nextFreeSku(variant.sku || `${baseStoreSku(this.store.channelCode, source.title)}-${taken.size + 1}`, taken);
      taken.add(sku);
      const quantity = variant.quantity;
      return {
        id: previous?.id ?? newId("svar"),
        catalogVariantId: "shopify",
        name: name.slice(0, 120),
        colour: colourAt >= 0 ? variant.options[colourAt] : "",
        colourHex: previous?.colourHex ?? "",
        size: sizeAt >= 0 ? variant.options[sizeAt] : "",
        sku,
        baseCost: variant.cost ?? 0,
        price: variant.price,
        enabled: true,
        availability:
          quantity === null || variant.policy === "continue" ? "in_stock" : quantity <= 0 ? "out_of_stock" : quantity < 5 ? "low_stock" : "in_stock",
        weightGrams: variant.grams,
      };
    });
  }

  /**
   * The product's photos, copied into the store's own asset storage: a
   * Shopify CDN address stops working once the old shop is closed. Photos
   * copied on an earlier run of the same product are reused.
   */
  private async images(source: ShopifyProduct, existing: StoreProduct | null, issues: ImportIssue[]): Promise<MockupImage[]> {
    const now = new Date().toISOString();
    const known = new Map((existing?.mockups ?? []).map((mockup) => [mockup.id, mockup]));
    const out: MockupImage[] = [];
    for (const image of source.images.slice(0, IMAGES_PER_PRODUCT)) {
      const id = `mck_${hash(image.src)}`;
      const previous = known.get(id);
      if (previous) {
        out.push(previous);
        continue;
      }
      const stored = await copyImage(image.src);
      if (!stored) {
        issues.push({ kind: "products", line: source.line, ref: source.handle, key: "imageFailed", values: { url: image.src.slice(0, 200) }, severity: "warning" });
        continue;
      }
      const variant = source.variants.find((v) => v.image === image.src);
      const colourAt = source.options.findIndex((name) => /colou?r|farbe|couleur|kleur|colore|färg/i.test(name));
      out.push({
        id,
        view: "front",
        url: stored.url,
        shareUrl: stored.mimeType === "image/jpeg" || stored.mimeType === "image/png" ? stored.url : null,
        colour: variant && colourAt >= 0 ? variant.options[colourAt] : "",
        generatedAt: now,
        approved: true,
        approvedBy: this.actor.name,
        approvedAt: now,
      });
    }
    return out;
  }

  private async redirect(path: string, target: string) {
    const now = new Date().toISOString();
    await db.upsertOne(
      COLLECTIONS.urlRedirects,
      { storeId: this.store.id, path },
      {
        $set: { target, source: "shopify_import" },
        $setOnInsert: { id: newId("rdr"), storeId: this.store.id, path, createdAt: now } satisfies Omit<UrlRedirect, "target" | "source">,
      },
    );
  }

  /* ----------------------------------------------------------- customers */

  private async customer(source: ShopifyCustomer): Promise<"created" | "updated"> {
    const { store } = this;
    const now = new Date().toISOString();
    const name = [source.firstName, source.lastName].filter(Boolean).join(" ").slice(0, 120);
    const existing = await db.findOne<Customer>(COLLECTIONS.customers, { storeId: store.id, email: source.email });
    // The same email again further down the file: the first row stands.
    if (existing?.imported?.importId === this.job.id) return "updated";
    const address = source.address
      ? {
          id: newId("adr"),
          name: name || source.address.company,
          line1: source.address.line1,
          ...(source.address.line2 ? { line2: source.address.line2 } : {}),
          city: source.address.city,
          ...(source.address.region ? { region: source.address.region } : {}),
          postalCode: source.address.postalCode,
          country: source.address.country,
          ...(source.address.phone || source.phone ? { phone: source.address.phone || source.phone } : {}),
          isDefault: true,
        }
      : null;
    const set: Record<string, unknown> = {
      marketing: { subscribed: source.acceptsMarketing, updatedAt: now },
      imported: { platform: "shopify", importId: this.job.id },
      updatedAt: now,
    };
    if (!existing?.name && name) set.name = name;
    if (!existing?.country && source.address?.country) set.country = source.address.country;
    if (address && !(existing?.addresses?.length)) set.addresses = [address];
    const notes = source.note
      ? [{ id: newId("note"), body: source.note, authorId: this.actor.id, authorName: this.actor.name, at: now }]
      : [];
    await db.upsertOne(
      COLLECTIONS.customers,
      { storeId: store.id, email: source.email },
      {
        $set: set,
        $setOnInsert: {
          id: newId("cus"),
          storeId: store.id,
          email: source.email,
          ...(set.name ? {} : { name: "" }),
          ...(set.country ? {} : { country: "" }),
          ...(set.addresses ? {} : { addresses: [] }),
          firstOrderAt: "",
          lastOrderAt: "",
          orderCount: 0,
          lifetimeSpend: 0,
          refundedTotal: 0,
          refundCount: 0,
          currency: store.defaultCurrency,
          preferredLanguage: store.defaultLanguage,
          preferredCurrency: store.defaultCurrency,
          notes,
          anonymisedAt: null,
          createdAt: now,
        },
      },
    );
    return existing ? "updated" : "created";
  }

  /* -------------------------------------------------------------- orders */

  private async index() {
    if (this.skuIndex) return this.skuIndex;
    const products = await db.find<StoreProduct>(COLLECTIONS.storeProducts, { storeId: this.store.id });
    this.skuIndex = new Map();
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.sku) this.skuIndex.set(variant.sku.toLowerCase(), { productId: product.id, variantId: variant.id, supplierId: product.supplierId });
      }
    }
    return this.skuIndex;
  }

  private async order(source: ShopifyOrder, issues: ImportIssue[]): Promise<"created" | "updated"> {
    const { store } = this;
    const already = await db.findOne<Order>(COLLECTIONS.orders, { storeId: store.id, "imported.name": source.name });
    if (already) return "updated";
    const skus = await this.index();
    const at = source.createdAt;
    const cancelled = Boolean(source.cancelledAt) || source.financialStatus === "voided";
    const refundedFully = source.financialStatus === "refunded";
    const paid = ["paid", "partially_refunded", "refunded", "partially_paid"].includes(source.financialStatus);
    const fulfilled = source.fulfillmentStatus === "fulfilled";
    const status: Order["status"] = cancelled || refundedFully || !paid ? "cancelled" : fulfilled ? "delivered" : "paid";
    const code = `SH-${source.name.replace(/[^0-9A-Za-z]/g, "").slice(0, 20) || newId("x").slice(2, 10)}`;

    const items = source.items.map((item) => {
      const match = item.sku ? skus.get(item.sku.toLowerCase()) : undefined;
      if (!match && item.sku) {
        issues.push({ kind: "orders", line: item.line, ref: source.name, key: "unmatchedProduct", values: { sku: item.sku }, severity: "warning" });
      }
      return {
        id: newId("oit"),
        storeProductId: match?.productId ?? "",
        variantId: match?.variantId ?? "",
        productName: item.name,
        variantName: "",
        quantity: item.quantity,
        unitPrice: item.price,
        supplierCost: 0,
        customization: { artworkUrl: null, artworkFileName: null, text: null, previewUrl: null },
        supplierId: match?.supplierId ?? "",
      };
    });

    const order: Order = {
      id: newId("ord"),
      storeId: store.id,
      code,
      status,
      currency: source.currency,
      locale: store.defaultLanguage,
      customer: {
        name: source.customer.name || source.email,
        email: source.email,
        line1: source.customer.line1,
        ...(source.customer.line2 ? { line2: source.customer.line2 } : {}),
        city: source.customer.city,
        ...(source.customer.region ? { region: source.customer.region } : {}),
        postalCode: source.customer.postalCode,
        country: /^[A-Z]{2}$/.test(source.customer.country) ? source.customer.country : store.stripe.country,
        ...(source.customer.phone ? { phone: source.customer.phone } : {}),
      },
      items,
      subtotal: source.subtotal,
      shipping: source.shipping,
      shippingRate: source.shippingMethod
        ? { zoneId: "", zoneName: "", rateId: "", name: source.shippingMethod.slice(0, 120), minDays: 0, maxDays: 0, amount: source.shipping }
        : null,
      discount:
        source.discount > 0
          ? { codeId: "", code: source.discountCode || "SHOPIFY", kind: "fixed", value: source.discount, amount: source.discount }
          : null,
      taxAmount: source.taxes,
      taxRate: 0,
      taxLines: source.taxes > 0 ? [{ rate: 0, amount: source.taxes }] : [],
      tax: { mode: "manual", inclusive: store.pricesIncludeTax },
      total: source.total,
      payment: {
        provider: "stripe",
        status: refundedFully ? "refunded" : paid ? "succeeded" : "failed",
        paymentIntentId: null,
        stripeAccountId: null,
        last4: null,
        failureMessage: null,
        paidAt: paid ? (source.paidAt ?? at) : null,
      },
      fulfillment: {
        supplierId: null,
        supplierName: null,
        routing: status === "paid" ? "manual_required" : "submitted",
        supplierOrderRef: source.name,
        submittedAt: null,
        submissionMessage: null,
        carrier: null,
        trackingNumber: null,
        trackingUrl: null,
        exception: null,
      },
      refunds:
        source.refunded > 0
          ? [{ id: newId("rfd"), amount: Math.min(source.refunded, source.total), reason: "Refunded on Shopify", at, actor: this.actor.name }]
          : [],
      events: [{ at, status: "Imported", note: `Imported from Shopify as ${source.name}.`, actor: this.actor.name }],
      imported: { platform: "shopify", name: source.name, importId: this.job.id },
      idempotencyKey: `shopify:${store.id}:${source.name}`,
      createdAt: at,
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.insertOne(COLLECTIONS.orders, order as unknown as Record<string, unknown>);
    } catch (error) {
      // The code is taken by an order this store already has.
      if ((error as { code?: number }).code !== 11000) throw error;
      order.code = `${code}-${newId("x").slice(2, 6).toUpperCase()}`;
      await db.insertOne(COLLECTIONS.orders, order as unknown as Record<string, unknown>);
    }
    if (source.email) this.orderEmails.add(source.email);
    return "created";
  }
}

/** A short stable key for an image address, so a re-import finds the copy it already made. */
function hash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/** Copies a photo from the old shop into the store's asset storage. Null when it cannot be read as an image. */
async function copyImage(src: string): Promise<{ url: string; mimeType: string } | null> {
  try {
    const response = await fetch(src, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const name = new URL(src).pathname.split("/").pop() ?? "image";
    const stored = await storeUpload("mockup", bytes, type, name);
    return stored.ok ? { url: stored.image.url, mimeType: stored.image.mimeType } : null;
  } catch {
    return null;
  }
}
