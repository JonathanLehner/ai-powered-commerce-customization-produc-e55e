/**
 * Shopify's CSV exports, read into what an import needs: products (grouped by
 * handle, with their options, variants, images, SEO fields and stock),
 * customers and orders. Every problem is reported against the file's own line
 * number, as a message key under `import.issues` with its values, so the
 * preview in the browser and the report of the import that ran on the server
 * say the same thing in the merchant's language.
 *
 * Both the old (`Variant Price`, `Image Src`) and the 2024 (`Price`,
 * `Product image URL`) column names are understood.
 *
 * Pure: the import page previews with it and the server imports with it, and
 * `npm run shopify-import-check` covers it.
 */

/* --------------------------------------------------------------------- CSV */

export interface CsvRecord {
  /** The line the record starts on, counting the header as line 1. */
  line: number;
  cells: string[];
}

export interface CsvTable {
  header: string[];
  records: CsvRecord[];
}

/** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): CsvTable {
  const rows: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((value) => value !== "")) rows.push({ line: start, cells });
      cells = [];
      cell = "";
      line++;
      start = line;
    } else cell += char;
  }
  cells.push(cell);
  if (cells.some((value) => value !== "")) rows.push({ line: start, cells });
  const [header, ...records] = rows;
  return { header: (header?.cells ?? []).map((name) => name.trim()), records };
}

/** Reads a record's cells by column name, ignoring case and trying each alias. */
function columns(header: string[]) {
  const index = new Map(header.map((name, i) => [name.toLowerCase(), i] as const));
  const find = (aliases: readonly string[]) => {
    for (const alias of aliases) {
      const at = index.get(alias.toLowerCase());
      if (at !== undefined) return at;
    }
    return -1;
  };
  return {
    has: (aliases: readonly string[]) => find(aliases) >= 0,
    reader: (record: CsvRecord) => (aliases: readonly string[]) => {
      const at = find(aliases);
      return at >= 0 ? (record.cells[at] ?? "").trim() : "";
    },
  };
}

/* ------------------------------------------------------------------ issues */

export type ImportKind = "products" | "customers" | "orders";

export type IssueKey =
  | "missingColumns"
  | "missingHandle"
  | "missingTitle"
  | "invalidPrice"
  | "invalidCost"
  | "invalidQuantity"
  | "invalidImage"
  | "duplicateVariant"
  | "noVariants"
  | "tooManyVariants"
  | "invalidEmail"
  | "duplicateEmail"
  | "missingOrderName"
  | "invalidTotal"
  | "noLineItems"
  | "invalidCurrency"
  | "imageFailed"
  | "productLimit"
  | "unmatchedProduct"
  | "giftCardSkipped"
  | "rowFailed";

export interface ImportIssue {
  kind: ImportKind;
  /** The CSV line, or 0 when the problem is with the file as a whole. */
  line: number;
  /** Handle, email or order name the row belongs to. */
  ref: string;
  key: IssueKey;
  values?: Record<string, string | number>;
  /** An error skips the record; a warning imports it without the part in question. */
  severity: "error" | "warning";
}

/** The most rows of each kind one import takes. */
export const IMPORT_LIMITS = { products: 2000, variantsPerProduct: 100, customers: 20000, orders: 20000 } as const;

/** Decimal text in a currency's major unit (`24.99`, `1,299.00`) to minor units, or null. */
export function parseAmount(raw: string, decimals: number): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  // `1,299.00` and `1299,00`: the last separator is the decimal one when it has 1 or 2 digits after it.
  const match = /^(-?[\d.,]*?)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1].replace(/[.,]/g, "");
  const value = Number(`${whole || "0"}.${match[2] ?? "0"}`);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10 ** decimals);
}

/** Shopify's TRUE/FALSE, yes/no and 1/0. */
function truthy(raw: string): boolean {
  return /^(true|yes|y|1)$/i.test(raw.trim());
}

/** Product body HTML as the paragraphs a product description holds. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|tr)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5000);
}

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const GRAMS_PER_UNIT: Record<string, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };

/**
 * A variant's weight in whole grams. Shopify writes it in grams whatever unit
 * the shop displays; other exports give a weight and its unit instead.
 */
export function gramsOf(grams: string, weight: string, unit: string): number {
  const exact = Number.parseFloat(grams);
  if (Number.isFinite(exact) && exact > 0) return Math.round(exact);
  const value = Number.parseFloat(weight);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * (GRAMS_PER_UNIT[unit.trim().toLowerCase()] ?? 1));
}

/** A handle as Shopify writes them, which is also a valid storefront address segment. */
export function cleanHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9À-￿-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

/* ---------------------------------------------------------------- products */

const P = {
  handle: ["Handle", "URL handle"],
  title: ["Title"],
  body: ["Body (HTML)", "Description"],
  vendor: ["Vendor"],
  type: ["Type"],
  category: ["Product Category", "Product category"],
  tags: ["Tags"],
  published: ["Published", "Published on online store"],
  status: ["Status"],
  sku: ["Variant SKU", "SKU"],
  grams: ["Variant Grams", "Weight value (grams)"],
  weight: ["Variant Weight", "Weight"],
  weightUnit: ["Variant Weight Unit", "Weight unit for display"],
  tracker: ["Variant Inventory Tracker", "Inventory tracker"],
  quantity: ["Variant Inventory Qty", "Inventory quantity"],
  policy: ["Variant Inventory Policy", "Continue selling when out of stock"],
  price: ["Variant Price", "Price"],
  compareAt: ["Variant Compare At Price", "Compare-at price"],
  cost: ["Cost per item"],
  image: ["Image Src", "Product image URL"],
  imagePosition: ["Image Position", "Image position"],
  imageAlt: ["Image Alt Text", "Image alt text"],
  variantImage: ["Variant Image", "Variant image URL"],
  giftCard: ["Gift Card", "Gift card"],
  seoTitle: ["SEO Title", "SEO title"],
  seoDescription: ["SEO Description", "SEO description"],
} as const;

const optionName = (n: number) => [`Option${n} Name`];
const optionValue = (n: number) => [`Option${n} Value`];

export interface ShopifyVariant {
  line: number;
  /** One value per option of the product, in option order. */
  options: string[];
  sku: string;
  /** Minor units of the shop currency. */
  price: number;
  compareAtPrice: number | null;
  cost: number | null;
  grams: number;
  /** Stock on hand, when Shopify tracked it. */
  quantity: number | null;
  policy: "deny" | "continue";
  image: string | null;
}

export interface ShopifyImage {
  src: string;
  position: number;
  alt: string;
}

export interface ShopifyProduct {
  handle: string;
  /** The first line of the product in the file. */
  line: number;
  title: string;
  description: string;
  vendor: string;
  type: string;
  tags: string[];
  status: "active" | "draft" | "archived";
  published: boolean;
  giftCard: boolean;
  seoTitle: string;
  seoDescription: string;
  options: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

/** Which export a file is, from its header. */
export function detectKind(header: string[]): ImportKind | null {
  const { has } = columns(header);
  if (has(P.handle) && (has(P.title) || has(P.price))) return "products";
  if (has(["Name"]) && has(["Lineitem name"])) return "orders";
  if (has(["Email"]) && (has(["First Name"]) || has(["Last Name"]))) return "customers";
  return null;
}

export function readProducts(table: CsvTable, decimals: number): { products: ShopifyProduct[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const { has, reader } = columns(table.header);
  const missing = [P.handle, P.price].filter((aliases) => !has(aliases)).map((aliases) => aliases[0]);
  if (missing.length > 0) {
    issues.push({ kind: "products", line: 0, ref: "", key: "missingColumns", values: { columns: missing.join(", ") }, severity: "error" });
    return { products: [], issues };
  }

  const byHandle = new Map<string, ShopifyProduct>();
  const order: string[] = [];
  let overLimit = false;
  const issue = (line: number, ref: string, key: IssueKey, severity: ImportIssue["severity"], values?: ImportIssue["values"]) =>
    issues.push({ kind: "products", line, ref, key, severity, ...(values ? { values } : {}) });

  for (const record of table.records) {
    const get = reader(record);
    const handle = cleanHandle(get(P.handle));
    if (!handle) {
      issue(record.line, "", "missingHandle", "error");
      continue;
    }
    let product = byHandle.get(handle);
    if (!product) {
      if (byHandle.size >= IMPORT_LIMITS.products) {
        if (!overLimit) issue(record.line, handle, "productLimit", "error", { max: IMPORT_LIMITS.products });
        overLimit = true;
        continue;
      }
      const status = get(P.status).toLowerCase();
      product = {
        handle,
        line: record.line,
        title: get(P.title),
        description: htmlToText(get(P.body)),
        vendor: get(P.vendor),
        type: get(P.type) || get(P.category).split(">").pop()?.trim() || "",
        tags: get(P.tags)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 30),
        status: status === "draft" || status === "archived" ? status : "active",
        published: has(P.published) ? truthy(get(P.published)) : true,
        giftCard: truthy(get(P.giftCard)),
        seoTitle: get(P.seoTitle),
        seoDescription: get(P.seoDescription),
        options: [1, 2, 3].map((n) => get(optionName(n))).filter(Boolean),
        variants: [],
        images: [],
      };
      byHandle.set(handle, product);
      order.push(handle);
    } else if (!product.title && get(P.title)) {
      product.title = get(P.title);
    }

    const image = get(P.image);
    if (image) {
      if (!isHttpUrl(image)) issue(record.line, handle, "invalidImage", "warning");
      else if (!product.images.some((existing) => existing.src === image)) {
        const position = Number.parseInt(get(P.imagePosition), 10);
        product.images.push({ src: image, position: Number.isFinite(position) ? position : product.images.length + 1, alt: get(P.imageAlt) });
      }
    }

    // A row is a variant when it carries a price or an option value; rows
    // with only an image add the image.
    const values = [1, 2, 3].map((n) => get(optionValue(n)));
    const priceText = get(P.price);
    if (!priceText && !values.some(Boolean) && !get(P.sku)) continue;

    const price = parseAmount(priceText, decimals);
    if (price === null) {
      issue(record.line, handle, "invalidPrice", "error", { value: priceText });
      continue;
    }
    const costText = get(P.cost);
    const cost = costText ? parseAmount(costText, decimals) : null;
    if (costText && cost === null) issue(record.line, handle, "invalidCost", "warning", { value: costText });
    const quantityText = get(P.quantity);
    const quantity = quantityText ? Number.parseInt(quantityText, 10) : null;
    if (quantityText && (quantity === null || !Number.isFinite(quantity))) {
      issue(record.line, handle, "invalidQuantity", "warning", { value: quantityText });
    }
    const options = product.options.map((_, i) => values[i] || "");
    const key = options.join(" / ").toLowerCase();
    if (product.variants.some((variant) => variant.options.join(" / ").toLowerCase() === key)) {
      issue(record.line, handle, "duplicateVariant", "error", { variant: options.join(" / ") || handle });
      continue;
    }
    if (product.variants.length >= IMPORT_LIMITS.variantsPerProduct) {
      issue(record.line, handle, "tooManyVariants", "error", { max: IMPORT_LIMITS.variantsPerProduct });
      continue;
    }
    const tracked = has(P.tracker) ? get(P.tracker).toLowerCase() === "shopify" : quantity !== null;
    const policyText = get(P.policy).toLowerCase();
    const variantImage = get(P.variantImage);
    product.variants.push({
      line: record.line,
      options,
      sku: get(P.sku).slice(0, 64),
      price,
      compareAtPrice: parseAmount(get(P.compareAt), decimals),
      cost,
      grams: gramsOf(get(P.grams), get(P.weight), get(P.weightUnit)),
      quantity: tracked && quantity !== null && Number.isFinite(quantity) ? quantity : null,
      policy: policyText === "continue" || truthy(policyText) ? "continue" : "deny",
      image: variantImage && isHttpUrl(variantImage) ? variantImage : null,
    });
  }

  const products: ShopifyProduct[] = [];
  for (const handle of order) {
    const product = byHandle.get(handle)!;
    if (!product.title) {
      issue(product.line, handle, "missingTitle", "error");
      continue;
    }
    if (product.variants.length === 0) {
      issue(product.line, handle, "noVariants", "error");
      continue;
    }
    product.images.sort((a, b) => a.position - b.position);
    // A variant photo that is not among the product's images is one of them too.
    for (const variant of product.variants) {
      if (variant.image && !product.images.some((image) => image.src === variant.image)) {
        product.images.push({ src: variant.image, position: product.images.length + 1, alt: "" });
      }
    }
    products.push(product);
  }
  return { products, issues };
}

/* --------------------------------------------------------------- customers */

export interface ShopifyCustomer {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  acceptsMarketing: boolean;
  address: {
    company: string;
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    phone: string;
  } | null;
  tags: string[];
  note: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function readCustomers(table: CsvTable): { customers: ShopifyCustomer[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const { has, reader } = columns(table.header);
  if (!has(["Email"])) {
    issues.push({ kind: "customers", line: 0, ref: "", key: "missingColumns", values: { columns: "Email" }, severity: "error" });
    return { customers: [], issues };
  }
  const seen = new Set<string>();
  const customers: ShopifyCustomer[] = [];
  for (const record of table.records) {
    const get = reader(record);
    const email = get(["Email"]).toLowerCase();
    if (!EMAIL.test(email)) {
      issues.push({ kind: "customers", line: record.line, ref: email, key: "invalidEmail", severity: "error" });
      continue;
    }
    if (seen.has(email)) {
      issues.push({ kind: "customers", line: record.line, ref: email, key: "duplicateEmail", severity: "warning" });
      continue;
    }
    if (customers.length >= IMPORT_LIMITS.customers) break;
    seen.add(email);
    const line1 = get(["Default Address Address1", "Address1"]);
    const country = get(["Default Address Country Code", "Country Code"]).toUpperCase();
    customers.push({
      line: record.line,
      email,
      firstName: get(["First Name"]),
      lastName: get(["Last Name"]),
      phone: get(["Phone"]),
      acceptsMarketing: truthy(get(["Accepts Email Marketing", "Accepts Marketing"])),
      address: line1
        ? {
            company: get(["Default Address Company", "Company"]),
            line1,
            line2: get(["Default Address Address2", "Address2"]),
            city: get(["Default Address City", "City"]),
            region: get(["Default Address Province Code", "Province Code"]),
            postalCode: get(["Default Address Zip", "Zip"]),
            country: /^[A-Z]{2}$/.test(country) ? country : "",
            phone: get(["Default Address Phone"]),
          }
        : null,
      tags: get(["Tags"])
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      note: get(["Note"]).slice(0, 2000),
    });
  }
  return { customers, issues };
}

/* ------------------------------------------------------------------ orders */

export interface ShopifyOrderLine {
  line: number;
  name: string;
  sku: string;
  quantity: number;
  /** Minor units of the order currency. */
  price: number;
}

export interface ShopifyOrder {
  line: number;
  /** `#1001`. */
  name: string;
  email: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  subtotal: number;
  shipping: number;
  taxes: number;
  discount: number;
  discountCode: string;
  total: number;
  refunded: number;
  shippingMethod: string;
  customer: {
    name: string;
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  items: ShopifyOrderLine[];
}

/** Shopify's `2024-03-01 10:15:00 +0100` as ISO, or null. */
function shopifyDate(raw: string): string | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})?$/.exec(raw.trim());
  const date = match ? new Date(`${match[1]}T${match[2]}${match[3]}:${match[4] ?? "00"}`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Minor-unit decimals of a currency; JPY-like currencies have none. */
export function decimalsOf(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function readOrders(table: CsvTable, shopCurrency: string): { orders: ShopifyOrder[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const { has, reader } = columns(table.header);
  const missing = [["Name"], ["Lineitem name"]].filter((aliases) => !has(aliases)).map((aliases) => aliases[0]);
  if (missing.length > 0) {
    issues.push({ kind: "orders", line: 0, ref: "", key: "missingColumns", values: { columns: missing.join(", ") }, severity: "error" });
    return { orders: [], issues };
  }
  const byName = new Map<string, ShopifyOrder>();
  const failed = new Set<string>();
  for (const record of table.records) {
    const get = reader(record);
    const name = get(["Name"]);
    if (!name) {
      issues.push({ kind: "orders", line: record.line, ref: "", key: "missingOrderName", severity: "error" });
      continue;
    }
    if (failed.has(name)) continue;
    let order = byName.get(name);
    if (!order) {
      if (byName.size >= IMPORT_LIMITS.orders) break;
      const currency = (get(["Currency"]) || shopCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        issues.push({ kind: "orders", line: record.line, ref: name, key: "invalidCurrency", values: { value: currency }, severity: "error" });
        failed.add(name);
        continue;
      }
      const decimals = decimalsOf(currency);
      const amount = (aliases: string[]) => parseAmount(get(aliases), decimals) ?? 0;
      const total = parseAmount(get(["Total"]), decimals);
      if (total === null) {
        issues.push({ kind: "orders", line: record.line, ref: name, key: "invalidTotal", values: { value: get(["Total"]) }, severity: "error" });
        failed.add(name);
        continue;
      }
      const createdAt = shopifyDate(get(["Created at"])) ?? new Date(0).toISOString();
      order = {
        line: record.line,
        name,
        email: get(["Email"]).toLowerCase(),
        currency,
        financialStatus: get(["Financial Status"]).toLowerCase(),
        fulfillmentStatus: get(["Fulfillment Status"]).toLowerCase(),
        createdAt,
        paidAt: shopifyDate(get(["Paid at"])),
        cancelledAt: shopifyDate(get(["Cancelled at"])),
        subtotal: amount(["Subtotal"]),
        shipping: amount(["Shipping"]),
        taxes: amount(["Taxes"]),
        discount: amount(["Discount Amount"]),
        discountCode: get(["Discount Code"]),
        total,
        refunded: amount(["Refunded Amount"]),
        shippingMethod: get(["Shipping Method"]),
        customer: {
          name: get(["Shipping Name", "Billing Name"]),
          line1: get(["Shipping Address1", "Shipping Street", "Billing Address1"]),
          line2: get(["Shipping Address2", "Billing Address2"]),
          city: get(["Shipping City", "Billing City"]),
          region: get(["Shipping Province", "Billing Province"]),
          postalCode: get(["Shipping Zip", "Billing Zip"]),
          country: get(["Shipping Country", "Billing Country"]).toUpperCase(),
          phone: get(["Shipping Phone", "Phone"]),
        },
        items: [],
      };
      byName.set(name, order);
    }
    const itemName = get(["Lineitem name"]);
    if (!itemName) continue;
    const quantity = Number.parseInt(get(["Lineitem quantity"]), 10);
    order.items.push({
      line: record.line,
      name: itemName.slice(0, 200),
      sku: get(["Lineitem sku"]),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      price: parseAmount(get(["Lineitem price"]), decimalsOf(order.currency)) ?? 0,
    });
  }
  const orders: ShopifyOrder[] = [];
  for (const order of byName.values()) {
    if (order.items.length === 0) {
      issues.push({ kind: "orders", line: order.line, ref: order.name, key: "noLineItems", severity: "error" });
      continue;
    }
    orders.push(order);
  }
  return { orders, issues };
}

/* ---------------------------------------------------------- upload chunks */

/**
 * Splits a file's records into parts the browser can post one at a time
 * under the server's body limit, never splitting a product (rows sharing a
 * handle) or an order (rows sharing a name) across two parts.
 */
export function chunkRecords(kind: ImportKind, table: CsvTable, maxChars = 600_000): CsvRecord[][] {
  const { reader } = columns(table.header);
  const keyOf = (record: CsvRecord) =>
    kind === "products" ? cleanHandle(reader(record)(P.handle)) : kind === "orders" ? reader(record)(["Name"]) : null;
  const parts: CsvRecord[][] = [];
  let current: CsvRecord[] = [];
  let size = 0;
  let lastKey: string | null = null;
  for (const record of table.records) {
    const length = record.cells.reduce((sum, cell) => sum + cell.length + 4, 16);
    const key = keyOf(record);
    const sameGroup = key !== null && key !== "" && key === lastKey;
    if (current.length > 0 && size + length > maxChars && !sameGroup) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(record);
    size += length;
    lastKey = key;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/* ------------------------------------------------------------- import jobs */

export type ImportStatus = "uploading" | "queued" | "running" | "done" | "failed" | "cancelled";

export const IMPORT_KINDS: readonly ImportKind[] = ["products", "customers", "orders"];

type PerKind = Record<ImportKind, number>;

/** One import, as the progress screen and the API show it. */
export interface ShopifyImportJob {
  id: string;
  storeId: string;
  status: ImportStatus;
  /** The form's key, so a resubmitted start finds this import again. */
  submissionKey: string | null;
  /** Records received, per kind. */
  counts: PerKind;
  processed: PerKind;
  created: PerKind;
  updated: PerKind;
  failed: PerKind;
  /** Problems found while reading each uploaded part, keyed `kind:part`. */
  partIssues: Record<string, ImportIssue[]>;
  /** Problems found while importing. */
  issues: ImportIssue[];
  /** Held while a worker is importing, so two never import the same rows. */
  leaseUntil: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** The most problems one import keeps; the count beyond it is still reported. */
export const ISSUE_LIMIT = 500;

/** Every problem of an import, reading problems first, by line. */
export function jobIssues(job: Pick<ShopifyImportJob, "partIssues" | "issues">): ImportIssue[] {
  const reading = Object.entries(job.partIssues)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .flatMap(([, list]) => list);
  // A file-level problem is found again in every part of that file; it is reported once.
  const seen = new Set<string>();
  return [...reading, ...job.issues].filter((issue) => {
    if (issue.line !== 0) return true;
    const key = `${issue.kind}:${issue.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Share of the received records handled so far, 0 to 100. */
export function jobProgress(job: Pick<ShopifyImportJob, "counts" | "processed" | "status">): number {
  if (job.status === "done") return 100;
  const total = IMPORT_KINDS.reduce((sum, kind) => sum + job.counts[kind], 0);
  if (total === 0) return 0;
  const done = IMPORT_KINDS.reduce((sum, kind) => sum + job.processed[kind], 0);
  return Math.min(99, Math.floor((done / total) * 100));
}

export function isJobOpen(job: Pick<ShopifyImportJob, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

/* -------------------------------------------------------------- addresses */

/** Product, collection and page addresses of a Shopify store, which have the same shape here. */
export const SHOPIFY_PATH_KINDS = ["products", "collections", "pages"] as const;

/**
 * What a storefront address that matched no page might redirect to, given its
 * segments below the store: a recorded redirect to look up for
 * `/products/<handle>`, `/collections/<handle>` and `/pages/<handle>`, and the
 * page Shopify's own nested addresses mean (`/collections/<c>/products/<p>` is
 * that product, `/collections/all` the catalog).
 */
export function redirectRoute(rest: string[]): { lookup: string | null; fallback: string | null } | null {
  const parts = rest.map((part) => {
    try {
      return decodeURIComponent(part).toLowerCase();
    } catch {
      return part.toLowerCase();
    }
  });
  if (parts.length === 4 && parts[0] === "collections" && parts[2] === "products") {
    return { lookup: `/products/${parts[3]}`, fallback: `/products/${parts[3]}` };
  }
  if (parts.length === 2 && parts[0] === "collections" && parts[1] === "all") return { lookup: "/collections/all", fallback: "/products" };
  if (parts.length === 2 && (SHOPIFY_PATH_KINDS as readonly string[]).includes(parts[0]) && parts[1]) {
    return { lookup: `/${parts[0]}/${parts[1]}`, fallback: null };
  }
  return null;
}

/** A redirect's source address, `/products/old-handle`, or null when it is not one of the three Shopify kinds. */
export function redirectSource(raw: string): string | null {
  const path = raw.trim().replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2 || !(SHOPIFY_PATH_KINDS as readonly string[]).includes(parts[0])) return null;
  const handle = cleanHandle(parts[1]);
  return handle ? `/${parts[0]}/${handle}` : null;
}

/** A redirect's target: a path on the storefront, such as `/products/new-handle` or `/`. */
export function redirectTarget(raw: string): string | null {
  const path = raw.trim().replace(/^https?:\/\/[^/]+/i, "");
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || /\s/.test(path)) return null;
  return path;
}
