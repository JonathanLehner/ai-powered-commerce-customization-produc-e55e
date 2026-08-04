/**
 * The recipient list a gifting buyer pastes in or uploads.
 *
 * A company sends its people list as a spreadsheet export, so the parser takes
 * comma- or tab-separated rows with or without a header, maps the column names
 * a person actually types ("postcode", "zip", "qty"), resolves each row to a
 * real product variant in the catalogue, and reports what is wrong per row
 * rather than failing the whole file. Nothing here touches the database, so the
 * same rules run in the check script.
 */

import { matchCountry } from "./countries";
import { convert } from "./pricing";

export interface GiftVariantOption {
  id: string;
  name: string;
  size: string;
  colour: string;
  price: number;
  enabled: boolean;
  availability: "in_stock" | "low_stock" | "out_of_stock";
}

export interface GiftProductOption {
  id: string;
  name: string;
  sku: string;
  currency: string;
  variants: GiftVariantOption[];
}

export interface ParsedRecipient {
  /** 1-based line in the pasted list, so an issue points at a row on screen. */
  line: number;
  name: string;
  email: string;
  line1: string;
  city: string;
  postalCode: string;
  /** ISO alpha-2, resolved from a code or a country name. */
  country: string;
  size: string;
  note: string;
  quantity: number;
  storeProductId: string;
  productName: string;
  variantId: string;
  variantName: string;
  /** Unit price converted into the campaign currency. */
  unitPrice: number;
  lineTotal: number;
  issues: string[];
}

export interface ParseOptions {
  products: GiftProductOption[];
  /** Used for every row that does not name a product of its own. */
  defaultProductId: string;
  currency: string;
  /** Per recipient, in `currency`. Zero means no limit. */
  spendLimit: number;
  maxRecipients?: number;
  maxQuantity?: number;
}

export interface ParseResult {
  rows: ParsedRecipient[];
  /** Rows past `maxRecipients` that were not read. */
  overflow: number;
  /** Blank and comment lines that were ignored. */
  skipped: number;
}

export const RECIPIENT_COLUMNS = [
  "name",
  "email",
  "address",
  "city",
  "postcode",
  "country",
  "size",
  "quantity",
  "product",
  "note",
] as const;

export const RECIPIENT_TEMPLATE = `${RECIPIENT_COLUMNS.join(",")}
Dana Whitfield,dana@northwind.example,14 Bridge Street,Leeds,LS1 4AP,United Kingdom,M,1,,Welcome to the team
Arun Patel,arun@northwind.example,900 Market Street,San Francisco,94103,US,L,1,,`;

type Field =
  | "name"
  | "email"
  | "line1"
  | "city"
  | "postalCode"
  | "country"
  | "size"
  | "quantity"
  | "product"
  | "note";

/** Header spellings a person actually types, mapped to the field they mean. */
const HEADER_ALIASES: Record<string, Field> = {
  name: "name",
  "full name": "name",
  recipient: "name",
  "recipient name": "name",
  employee: "name",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  "work email": "email",
  address: "line1",
  address1: "line1",
  "address 1": "line1",
  "address line 1": "line1",
  line1: "line1",
  street: "line1",
  "street address": "line1",
  city: "city",
  town: "city",
  "town or city": "city",
  postcode: "postalCode",
  "post code": "postalCode",
  "postal code": "postalCode",
  zip: "postalCode",
  "zip code": "postalCode",
  country: "country",
  size: "size",
  "garment size": "size",
  quantity: "quantity",
  qty: "quantity",
  units: "quantity",
  product: "product",
  gift: "product",
  item: "product",
  sku: "product",
  note: "note",
  message: "note",
  "gift message": "note",
};

/** Order used when the list has no header row at all. */
const POSITIONAL: Field[] = [
  "name",
  "email",
  "line1",
  "city",
  "postalCode",
  "country",
  "size",
  "quantity",
  "product",
  "note",
];

function normalizeHeader(value: string): string {
  return value
    .replace(/^﻿/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Splits one row, honouring "quoted, values" the way a spreadsheet export writes them. */
export function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      out.push(value.trim());
      value = "";
      continue;
    }
    value += char;
  }
  out.push(value.trim());
  return out;
}

function delimiterFor(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const semicolons = (sample.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function normalizeCompare(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function resolveProduct(input: string, options: ParseOptions): GiftProductOption | null {
  const fallback = options.products.find((p) => p.id === options.defaultProductId) ?? options.products[0] ?? null;
  const wanted = normalizeCompare(input);
  if (!wanted) return fallback;
  return (
    options.products.find(
      (p) => normalizeCompare(p.sku) === wanted || normalizeCompare(p.name) === wanted || p.id === input,
    ) ??
    options.products.find((p) => normalizeCompare(p.name).includes(wanted)) ??
    null
  );
}

function sellableVariants(product: GiftProductOption): GiftVariantOption[] {
  return product.variants.filter((v) => v.enabled);
}

/** The sizes a buyer can put in the size column for a product. */
export function sizesFor(product: GiftProductOption): string[] {
  return [...new Set(sellableVariants(product).map((v) => v.size).filter(Boolean))];
}

function resolveVariant(
  product: GiftProductOption,
  size: string,
  issues: string[],
): GiftVariantOption | null {
  const variants = sellableVariants(product);
  if (variants.length === 0) {
    issues.push(`${product.name} has no sellable options at the moment.`);
    return null;
  }
  const sizes = sizesFor(product);
  const wanted = normalizeCompare(size);

  // Drinkware and anything else sold in a single size cannot be mis-sized, so
  // a size column filled in for the apparel rows is simply ignored here.
  if (sizes.length <= 1) {
    const only = variants.find((v) => v.availability !== "out_of_stock");
    if (!only) {
      issues.push(`${product.name} is out of stock. Choose another gift for this recipient.`);
      return null;
    }
    return only;
  }

  if (!wanted) {
    issues.push(`Add a size. ${product.name} comes in ${sizes.join(", ")}.`);
    return null;
  }

  const matches = variants.filter((v) => normalizeCompare(v.size) === wanted);
  if (matches.length === 0) {
    issues.push(`“${size}” is not a size for ${product.name}. Available: ${sizes.join(", ") || "one size"}.`);
    return null;
  }
  const available = matches.find((v) => v.availability !== "out_of_stock");
  if (!available) {
    issues.push(`${product.name} in ${size} is out of stock. Choose another size.`);
    return null;
  }
  return available;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Turns a pasted list into recipients, each carrying the problems that stop it
 * being ordered. A row with issues is still returned — the buyer needs to see
 * which line to fix, not a single error for the whole file.
 */
export function parseRecipients(text: string, options: ParseOptions): ParseResult {
  const maxRecipients = options.maxRecipients ?? 100;
  const maxQuantity = options.maxQuantity ?? 10;

  const rawLines = text.split(/\r\n|\r|\n/);
  const meaningful: { line: number; value: string }[] = [];
  let skipped = 0;
  rawLines.forEach((value, index) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (trimmed) skipped += 1;
      return;
    }
    meaningful.push({ line: index + 1, value });
  });
  if (meaningful.length === 0) return { rows: [], overflow: 0, skipped };

  const delimiter = delimiterFor(meaningful.map((l) => l.value));
  const first = splitRow(meaningful[0].value, delimiter).map(normalizeHeader);
  const recognised = first.filter((cell) => HEADER_ALIASES[cell]).length;
  const hasHeader = recognised >= 2;

  const columns: Field[] = hasHeader
    ? first.map((cell) => HEADER_ALIASES[cell] ?? ("note" as Field))
    : POSITIONAL;
  const body = hasHeader ? meaningful.slice(1) : meaningful;
  if (hasHeader) skipped += 1;

  const rows: ParsedRecipient[] = [];
  for (const entry of body.slice(0, maxRecipients)) {
    const cells = splitRow(entry.value, delimiter);
    const value = (field: Field): string => {
      // A column the header does not carry simply reads empty.
      const index = columns.indexOf(field);
      if (index < 0) return "";
      return (cells[index] ?? "").trim();
    };

    const issues: string[] = [];
    const name = value("name");
    const email = value("email");
    const line1 = value("line1");
    const city = value("city");
    const postalCode = value("postalCode");
    const countryInput = value("country");
    const size = value("size");
    const note = value("note");
    const quantityInput = value("quantity");

    if (name.length < 2) issues.push("Add the recipient's name.");
    if (!EMAIL.test(email)) issues.push("Add a valid email address for delivery updates.");
    if (line1.length < 4) issues.push("Add the street address.");
    if (city.length < 2) issues.push("Add the town or city.");
    if (postalCode.length < 3) issues.push("Add the postal code.");

    const country = matchCountry(countryInput);
    if (!country) {
      issues.push(
        countryInput
          ? `“${countryInput}” is not a country we ship to. Use the country name or its two-letter code.`
          : "Add the delivery country.",
      );
    }

    let quantity = quantityInput ? Number(quantityInput.replace(/[^0-9]/g, "")) : 1;
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
    if (quantity > maxQuantity) {
      issues.push(`Gifts are capped at ${maxQuantity} per recipient — this row asks for ${quantity}.`);
      quantity = maxQuantity;
    }

    const productInput = value("product");
    const product = resolveProduct(productInput, options);
    if (!product) {
      issues.push(
        productInput
          ? `“${productInput}” is not in this gift catalogue.`
          : "Choose the gift for this list.",
      );
    }

    const variant = product ? resolveVariant(product, size, issues) : null;
    const unitPrice =
      product && variant ? convert(variant.price, product.currency, options.currency) : 0;
    const lineTotal = unitPrice * quantity;
    if (options.spendLimit > 0 && lineTotal > options.spendLimit) {
      issues.push("Over the spend limit for one recipient.");
    }

    rows.push({
      line: entry.line,
      name,
      email: email.toLowerCase(),
      line1,
      city,
      postalCode,
      country: country?.code ?? countryInput.toUpperCase().slice(0, 2),
      size: variant?.size ?? size,
      note,
      quantity,
      storeProductId: product?.id ?? "",
      productName: product?.name ?? productInput,
      variantId: variant?.id ?? "",
      variantName: variant?.name ?? "",
      unitPrice,
      lineTotal,
      issues,
    });
  }

  return { rows, overflow: Math.max(0, body.length - maxRecipients), skipped };
}

export function recipientsWithIssues(rows: ParsedRecipient[]): ParsedRecipient[] {
  return rows.filter((row) => row.issues.length > 0);
}
