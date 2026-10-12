import "server-only";
import { z } from "zod";
import { getCustomer } from "../../customer-data";
import { getStorefront } from "../../data";
import { reorderCollections } from "../../operations/collections";
import { deleteCustomerData } from "../../operations/customers";
import { restoreStorefrontVersion, revertStorefront } from "../../operations/storefront";
import { ApiError } from "../auth";
import { define, id, notFound, type ApiOperation } from "../define";

/**
 * Collections order, customer data erasure and the storefront version history:
 * what the workspace does here that the original registry did not cover.
 */

function versionSummary(version: { id: string; label: string; kind?: string; savedAt: string; savedBy: string }) {
  return { id: version.id, label: version.label, kind: version.kind ?? "published", savedAt: version.savedAt, savedBy: version.savedBy };
}

export const storeContentOperations: ApiOperation[] = [
  define({
    id: "reorderCollections",
    method: "PUT",
    path: "/collections/order",
    scope: "collections:write",
    tag: "Collections",
    summary: "Reorder collections",
    description:
      "Puts the store's collections in the order given, which is the order the storefront lists them in. Collections left out keep their place after them; unknown ids are skipped.",
    actions: ["collections#reorderCollections"],
    input: z.object({ ids: z.array(z.string()).min(1).max(500).describe("Collection ids in the order wanted.") }),
    run: async (ctx, input) => ({ ids: await reorderCollections(ctx, input.ids) }),
  }),
  define({
    id: "deleteCustomerData",
    method: "POST",
    path: "/customers/{customerId}/erase",
    scope: "customers:write",
    tag: "Customers",
    summary: "Delete a customer's personal data",
    description:
      "Erases the customer's name, email address, postal address and phone number from their orders and the store's records, for a data deletion request. Order amounts stay for the books. This cannot be undone; send confirm: true. Repeating it changes nothing.",
    destructive: true,
    actions: ["customers#deleteCustomerData"],
    input: z.object({
      customerId: id("customer"),
      confirm: z.literal(true).describe("Must be true: the deletion cannot be undone."),
    }),
    run: async (ctx, input) => {
      const customer = (await getCustomer(ctx.store.id, input.customerId)) ?? notFound("Customer");
      const { orders } = await deleteCustomerData(ctx, customer);
      return { deleted: true, id: customer.id, orders };
    },
  }),
  define({
    id: "listStorefrontVersions",
    method: "GET",
    path: "/storefront/versions",
    scope: "storefront:read",
    tag: "Storefront",
    summary: "List storefront versions",
    description:
      "The storefront page's saved history, newest first: each saved draft and published version with its id, name, kind (draft or published), when and by whom. Restore one into the draft with restoreStorefrontVersion.",
    input: z.object({}),
    run: async (ctx) => ({ data: ((await getStorefront(ctx.store.id))?.history ?? []).map(versionSummary) }),
  }),
  define({
    id: "restoreStorefrontVersion",
    method: "POST",
    path: "/storefront/versions/{versionId}/restore",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Restore a storefront version",
    description:
      "Copies a version from the history into the draft, replacing the draft. Shoppers keep seeing the published version until publishStorefront.",
    actions: ["storefront#restoreVersion"],
    input: z.object({ versionId: id("storefront version") }),
    run: async (ctx, input) => {
      const version = (await restoreStorefrontVersion(ctx, input.versionId)) ?? notFound("Storefront version");
      return { restored: true, version: versionSummary(version) };
    },
  }),
  define({
    id: "revertStorefront",
    method: "POST",
    path: "/storefront/revert",
    scope: "storefront:write",
    tag: "Storefront",
    summary: "Discard the storefront draft",
    description: "Replaces the draft with the version shoppers see now, discarding unpublished changes.",
    actions: ["storefront#revertStorefront"],
    input: z.object({}),
    run: async (ctx) => {
      if (!(await revertStorefront(ctx))) throw new ApiError(409, "conflict", "The storefront has not been published yet.");
      return { reverted: true };
    },
  }),
];
