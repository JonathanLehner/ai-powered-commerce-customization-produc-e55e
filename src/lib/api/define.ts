import "server-only";
import { z } from "zod";
import { LOCALES, type Locale } from "@/i18n/locales";
import type { AdminScope, ApiScope } from "../api-scopes";
import type { RecordPage } from "../data";
import type { Actor, OperationContext } from "../operations/context";
import { isStoredAsset } from "../uploads";
import { ApiError } from "./auth";

/**
 * How an Admin API operation is described, and the small pieces every
 * operation module shares. The registry itself is `API_OPERATIONS` in
 * `./operations`, which gathers the modules under `./ops`.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const API_TAGS = [
  "Store",
  "Domains",
  "Currencies",
  "Import",
  "Products",
  "Variants",
  "Artwork and mockups",
  "Inventory",
  "Shipping",
  "Taxes",
  "Collections",
  "Orders",
  "Customers",
  "Discounts",
  "Gift cards",
  "Reviews",
  "Content",
  "Navigation",
  "Storefront",
  "Translations",
  "Gifting",
  "Campaigns",
  "Sourcing",
  "Assistant",
  "Team",
  "Analytics",
  "Activity",
  "Agency",
  "Platform administration",
] as const;

export type ApiTag = (typeof API_TAGS)[number];

/** What a platform operation is given: the platform key, under its name, in English. */
export interface AdminContext {
  actor: Actor;
  locale: Locale;
}

export interface ApiOperation {
  /** The OpenAPI operationId. The MCP tool is the same name in snake_case. */
  id: string;
  method: HttpMethod;
  /**
   * Under `/api/v1/stores/{storeId}`, or under `/api/v1/admin` for a platform
   * operation; `{name}` segments are path parameters.
   */
  path: string;
  scope: ApiScope | AdminScope;
  /** A platform operation: run with a platform key, outside any store. */
  admin?: true;
  tag: ApiTag;
  summary: string;
  description: string;
  input: z.ZodObject;
  /** The success status; 200 unless given. */
  status?: 200 | 201;
  /** Removes or overwrites something that cannot be brought back from the API. */
  destructive?: boolean;
  /**
   * The workspace server actions this operation does the work of, as
   * `file#export` under `src/app/actions` (`gifting#createGiftCatalogue`).
   * `npm run api-coverage-check` fails for an exported action no operation
   * names and that is not on the UI-only list.
   */
  actions?: string[];
  run(ctx: OperationContext | AdminContext, input: never): Promise<unknown>;
}

/** A store operation, run with a store key. */
export function define<S extends z.ZodObject>(
  operation: Omit<ApiOperation, "input" | "run" | "admin" | "scope"> & {
    scope: ApiScope;
    input: S;
    run(ctx: OperationContext, input: z.output<S>): Promise<unknown>;
  },
): ApiOperation {
  return operation as unknown as ApiOperation;
}

/** A platform operation, run with a platform key under `/api/v1/admin`. */
export function defineAdmin<S extends z.ZodObject>(
  operation: Omit<ApiOperation, "input" | "run" | "admin" | "scope" | "tag"> & {
    input: S;
    run(ctx: AdminContext, input: z.output<S>): Promise<unknown>;
  },
): ApiOperation {
  return { ...operation, admin: true, scope: "platform:admin", tag: "Platform administration" } as unknown as ApiOperation;
}

/** The MCP tool for an operation: `listProducts` → `list_products`. */
export function toolName(operation: Pick<ApiOperation, "id">): string {
  return operation.id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** The path parameters an operation's path names, `storeId` excluded. */
export function pathParams(operation: Pick<ApiOperation, "path">): string[] {
  return [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

/** The full path under `/api/v1`, as OpenAPI and the reference print it. */
export function fullPath(operation: Pick<ApiOperation, "path" | "admin">): string {
  const rest = operation.path === "/" ? "" : operation.path;
  return operation.admin ? `/admin${rest}` : `/stores/{storeId}${rest}`;
}

/* ----------------------------------------------------------------- shared */

export const id = (what: string) => z.string().min(1).describe(`The ${what} id.`);
export const money = (what: string) =>
  z.number().int().describe(`${what}, in minor units of the currency (cents): 2500 is 25.00.`);
export const locale = z.enum(LOCALES).describe("A language code the store has enabled, such as de.");
export const idempotencyKey = z
  .string()
  .min(8)
  .max(100)
  .optional()
  .describe("Any unique string. Sending the same request again with the same key returns the first result instead of creating a second record.");
export const assetUrl = z
  .string()
  .refine(isStoredAsset, "Use an image already uploaded to the store's asset storage (https://assets.clawcorp.ai/…).");

export const paging = {
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Records per page, 1 to 100."),
  cursor: z.string().optional().describe("The nextCursor of the previous page."),
};

/** A date range for reports and logs: `YYYY-MM-DD`, both ends included. */
export const dateRange = {
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .optional()
    .describe("First day, YYYY-MM-DD (UTC)."),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .optional()
    .describe("Last day, YYYY-MM-DD (UTC), included."),
};

export function decodeCursor(cursor: string | undefined): [string, string] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string")) {
      return value as [string, string];
    }
  } catch {
    // Reported below.
  }
  throw new ApiError(422, "invalid_request", "`cursor` is not one this API returned.", "cursor");
}

export function page<T, R>(rows: RecordPage<T>, present: (row: T) => R) {
  return {
    data: rows.data.map(present),
    nextCursor: rows.next ? Buffer.from(JSON.stringify(rows.next)).toString("base64url") : null,
  };
}

/** A plain list paged by offset, for records read whole (logs, small lists). */
export function offsetPage<T>(rows: T[], limit: number, cursor: string | undefined) {
  const start = cursor ? Number(Buffer.from(cursor, "base64url").toString("utf8")) : 0;
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiError(422, "invalid_request", "`cursor` is not one this API returned.", "cursor");
  }
  const end = start + limit;
  return {
    data: rows.slice(start, end),
    nextCursor: end < rows.length ? Buffer.from(String(end)).toString("base64url") : null,
  };
}

export function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} not found.`);
}
