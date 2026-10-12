/**
 * The rules of stock, kept free of server imports so the storefront, the
 * workspace, the Admin API and `npm run inventory-check` all read the same ones.
 * The writes live in `lib/inventory.ts`.
 */
import { splitRow } from "./gift-recipients";
import type {
  InventoryLevel,
  InventoryPolicy,
  InventoryReason,
  InventorySettings,
  Store,
  StoreProduct,
} from "./types";

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = { lowStockThreshold: 5, showLowStock: false };

export const INVENTORY_POLICIES: InventoryPolicy[] = ["deny", "continue"];

/** The reasons a person can pick for a change they make by hand. */
export const MANUAL_REASONS: InventoryReason[] = ["correction", "received", "damaged"];

export const INVENTORY_REASONS: InventoryReason[] = ["correction", "received", "damaged", "import", "sold", "restock"];

/** The most a single variant can hold, which keeps a typo from becoming a billion units. */
export const MAX_STOCK = 1_000_000;

export function inventorySettings(store: Pick<Store, "inventory">): InventorySettings {
  const saved = store.inventory;
  return {
    lowStockThreshold:
      saved && Number.isInteger(saved.lowStockThreshold) && saved.lowStockThreshold >= 0
        ? saved.lowStockThreshold
        : DEFAULT_INVENTORY_SETTINGS.lowStockThreshold,
    showLowStock: saved?.showLowStock ?? DEFAULT_INVENTORY_SETTINGS.showLowStock,
  };
}

export function levelId(productId: string, variantId: string): string {
  return `${productId}:${variantId}`;
}

export function availableOf(level: Pick<InventoryLevel, "onHand" | "committed">): number {
  return level.onHand - level.committed;
}

type LevelLike = Pick<InventoryLevel, "tracked" | "policy" | "onHand" | "committed"> | null | undefined;

/** Whether `quantity` more units may be sold. An untracked variant always may. */
export function canSell(level: LevelLike, quantity = 1): boolean {
  if (!level || !level.tracked || level.policy === "continue") return true;
  return availableOf(level) >= quantity;
}

/**
 * - `untracked`: stock is not counted.
 * - `in_stock`: above the low-stock threshold.
 * - `low`: at or below the threshold, still above zero.
 * - `out`: none left; with "continue selling" it still sells.
 */
export type StockState = "untracked" | "in_stock" | "low" | "out";

export function stockState(level: LevelLike, settings: InventorySettings): StockState {
  if (!level || !level.tracked) return "untracked";
  const available = availableOf(level);
  if (available <= 0) return "out";
  return available <= settings.lowStockThreshold ? "low" : "in_stock";
}

/**
 * What a shopper is told about one variant: whether it can be bought, and the
 * units left when the store shows that for low stock.
 */
export function shopperStock(level: LevelLike, settings: InventorySettings): { soldOut: boolean; left: number | null } {
  const soldOut = !canSell(level);
  const showLeft =
    settings.showLowStock && level?.tracked && level.policy === "deny" && stockState(level, settings) === "low";
  return { soldOut, left: showLeft && level ? availableOf(level) : null };
}

/** Whether a change from `before` to `after` units available just crossed into low stock. */
export function crossedLow(before: number, after: number, settings: InventorySettings): boolean {
  return before > settings.lowStockThreshold && after <= settings.lowStockThreshold;
}

/** Order lines folded into one entry per variant. */
export function stockLines(
  items: { storeProductId: string; variantId: string; quantity: number }[],
): { productId: string; variantId: string; quantity: number }[] {
  const out = new Map<string, { productId: string; variantId: string; quantity: number }>();
  for (const item of items) {
    const key = levelId(item.storeProductId, item.variantId);
    const line = out.get(key);
    if (line) line.quantity += item.quantity;
    else out.set(key, { productId: item.storeProductId, variantId: item.variantId, quantity: item.quantity });
  }
  return [...out.values()];
}

/* ---------------------------------------------------------- inventory rows */

/** One variant as the Inventory page, the export and the API list it. */
export interface InventoryRow {
  productId: string;
  productName: string;
  productStatus: StoreProduct["status"];
  variantId: string;
  variantName: string;
  sku: string;
  enabled: boolean;
  tracked: boolean;
  policy: InventoryPolicy;
  onHand: number;
  committed: number;
  available: number;
  state: StockState;
}

export function inventoryRows(
  products: StoreProduct[],
  levels: InventoryLevel[],
  settings: InventorySettings,
): InventoryRow[] {
  const byId = new Map(levels.map((level) => [level.id, level]));
  return products
    .filter((product) => product.status !== "archived")
    .flatMap((product) =>
      product.variants.map((variant) => {
        const level = byId.get(levelId(product.id, variant.id));
        return {
          productId: product.id,
          productName: product.name,
          productStatus: product.status,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          enabled: variant.enabled,
          tracked: level?.tracked ?? false,
          policy: level?.policy ?? "deny",
          onHand: level?.onHand ?? 0,
          committed: level?.committed ?? 0,
          available: level ? availableOf(level) : 0,
          state: stockState(level, settings),
        };
      }),
    );
}

export const INVENTORY_FILTERS = ["all", "tracked", "untracked", "low", "out"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export function parseInventoryFilter(value: unknown): InventoryFilter {
  return INVENTORY_FILTERS.includes(value as InventoryFilter) ? (value as InventoryFilter) : "all";
}

export function filterInventory(rows: InventoryRow[], q: string, filter: InventoryFilter): InventoryRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "tracked" && !row.tracked) return false;
    if (filter === "untracked" && row.tracked) return false;
    if (filter === "low" && row.state !== "low") return false;
    if (filter === "out" && row.state !== "out") return false;
    if (!needle) return true;
    return `${row.productName} ${row.variantName} ${row.sku}`.toLowerCase().includes(needle);
  });
}

/** The low and sold-out tracked variants that are on sale, for the attention list. */
export function lowStockRows(rows: InventoryRow[]): InventoryRow[] {
  return rows
    .filter((row) => row.enabled && row.productStatus === "published" && (row.state === "low" || row.state === "out"))
    .sort((a, b) => a.available - b.available);
}

/* --------------------------------------------------------------------- CSV */

export const INVENTORY_CSV_COLUMNS = [
  "variant_id",
  "product",
  "variant",
  "sku",
  "tracked",
  "policy",
  "on_hand",
  "committed",
  "available",
] as const;

export function inventoryCsvRows(rows: InventoryRow[]): string[][] {
  return [
    [...INVENTORY_CSV_COLUMNS],
    ...rows.map((row) => [
      row.variantId,
      row.productName,
      row.variantName,
      row.sku,
      row.tracked ? "yes" : "no",
      row.policy,
      String(row.onHand),
      String(row.committed),
      String(row.available),
    ]),
  ];
}

/** One change an import asks for. Fields the file leaves blank stay as they are. */
export interface InventoryImportChange {
  line: number;
  productId: string;
  variantId: string;
  tracked?: boolean;
  policy?: InventoryPolicy;
  available?: number;
}

export type InventoryImportProblem = { line: number; code: "unknownVariant" | "badQuantity" | "badTracked" | "badPolicy" };

const YES = ["yes", "y", "true", "1", "ja", "oui", "sí", "si", "sim", "はい"];
const NO = ["no", "n", "false", "0", "nein", "non", "não", "nej", "nee", "いいえ"];

/**
 * Reads an inventory file: the export's own columns, matched by header, comma-
 * or tab-separated. A row names its variant by `variant_id`, or by `sku` when
 * that is unique in the store. `available` sets the units available; `on_hand`
 * is used when there is no `available` column.
 */
export function parseInventoryCsv(
  text: string,
  rows: Pick<InventoryRow, "productId" | "variantId" | "sku" | "committed">[],
): { changes: InventoryImportChange[]; problems: InventoryImportProblem[] } {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((value, index) => ({ value, line: index + 1 }))
    .filter((entry) => entry.value.trim() !== "");
  if (lines.length === 0) return { changes: [], problems: [] };
  const delimiter = lines[0].value.includes("\t") ? "\t" : lines[0].value.includes(";") && !lines[0].value.includes(",") ? ";" : ",";
  const header = splitRow(lines[0].value, delimiter).map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const column = (name: string) => header.indexOf(name);

  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  const bySku = new Map<string, (typeof rows)[number] | null>();
  for (const row of rows) {
    const key = row.sku.trim().toLowerCase();
    if (key) bySku.set(key, bySku.has(key) ? null : row);
  }

  const changes: InventoryImportChange[] = [];
  const problems: InventoryImportProblem[] = [];
  for (const { value, line } of lines.slice(1)) {
    const cells = splitRow(value, delimiter);
    const cell = (name: string) => {
      const index = column(name);
      // An exported cell a spreadsheet would read as a formula carries a leading apostrophe.
      return index < 0 ? "" : (cells[index] ?? "").trim().replace(/^'/, "");
    };
    const row = byVariant.get(cell("variant_id")) ?? bySku.get(cell("sku").toLowerCase()) ?? null;
    if (!row) {
      problems.push({ line, code: "unknownVariant" });
      continue;
    }
    const change: InventoryImportChange = { line, productId: row.productId, variantId: row.variantId };

    const tracked = cell("tracked").toLowerCase();
    if (tracked) {
      if (YES.includes(tracked)) change.tracked = true;
      else if (NO.includes(tracked)) change.tracked = false;
      else {
        problems.push({ line, code: "badTracked" });
        continue;
      }
    }
    const policy = cell("policy").toLowerCase();
    if (policy) {
      if (!INVENTORY_POLICIES.includes(policy as InventoryPolicy)) {
        problems.push({ line, code: "badPolicy" });
        continue;
      }
      change.policy = policy as InventoryPolicy;
    }
    const availableCell = column("available") >= 0 ? cell("available") : "";
    const onHandCell = column("available") < 0 ? cell("on_hand") : "";
    const raw = availableCell || onHandCell;
    if (raw) {
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || Math.abs(quantity) > MAX_STOCK) {
        problems.push({ line, code: "badQuantity" });
        continue;
      }
      // On hand includes the units checkouts hold; available does not.
      change.available = availableCell ? quantity : quantity - row.committed;
    }
    if (change.tracked !== undefined || change.policy || change.available !== undefined) changes.push(change);
  }
  return { changes, problems };
}
