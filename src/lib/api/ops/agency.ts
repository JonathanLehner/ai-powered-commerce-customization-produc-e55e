import "server-only";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import { TRIAL_DAYS, billingPending } from "../../billing";
import { countActiveStoresForAgency, getAgency } from "../../data";
import {
  agencyPeople,
  agencyStores,
  createStore,
  invitePerson,
  removePersonEverywhere,
  type AgencyContext,
} from "../../operations/agency";
import type { OperationContext } from "../../operations/context";
import { STORE_ROLES } from "../../people";
import { storeAllowance } from "../../plans";
import { nextInvoice } from "../../stripe";
import { THEMES, type ThemeKey } from "../../types";
import { CURRENCY_OPTIONS } from "../../util";
import { define, notFound, type ApiOperation } from "../define";
import { presentStore } from "../present";
import { presentMembership, presentPerson } from "../present-team";

/**
 * The agency that owns the key's store: its stores, its people and its plan.
 * Only a key made by the agency's administrator holds the agency scope, and the
 * API checks on every call that its maker still administers the agency.
 */

function agencyOf(ctx: OperationContext): AgencyContext {
  return { agencyId: ctx.store.agencyId, actor: ctx.actor, locale: ctx.locale };
}

export const agencyOperations: ApiOperation[] = [
  define({
    id: "listAgencyStores",
    method: "GET",
    path: "/agency/stores",
    scope: "agency:read",
    tag: "Agency",
    summary: "List the agency's stores",
    description:
      "Every store of the agency that owns this store, archived ones included (`status`). Each store has its own API keys; this key works on its own store only.",
    actions: ["stores#storesForAgency"],
    input: z.object({}),
    run: async (ctx) => ({ data: (await agencyStores(agencyOf(ctx))).map(presentStore) }),
  }),
  define({
    id: "createStore",
    method: "POST",
    path: "/agency/stores",
    scope: "agency:write",
    tag: "Agency",
    summary: "Create a store",
    description:
      "Opens a new store for the agency, with a starter storefront draft. Refused (409) while the agency's subscription is awaiting payment, or when the plan's live-store limit is reached: archive a store or move to a larger plan first. The new store needs its own API key.",
    status: 201,
    actions: ["stores#createStore"],
    input: z.object({
      name: z.string().describe("The store name shoppers see. At least 3 characters; its storefront address is made from it."),
      clientName: z.string().describe("The client or brand the store is run for."),
      defaultCurrency: z
        .enum(CURRENCY_OPTIONS.map((option) => option.code) as [string, ...string[]])
        .default("USD")
        .describe("The ISO currency prices are written in, such as EUR."),
      defaultLanguage: z.enum(LOCALES).default("en").describe(`The storefront's default language: ${LOCALES.join(", ")}.`),
      theme: z
        .enum(Object.keys(THEMES) as [ThemeKey, ...ThemeKey[]])
        .default("atelier")
        .describe("The storefront theme."),
    }),
    run: async (ctx, input) => presentStore(await createStore(agencyOf(ctx), input)),
  }),
  define({
    id: "listAgencyPeople",
    method: "GET",
    path: "/agency/people",
    scope: "agency:read",
    tag: "Agency",
    summary: "List the agency's people",
    description:
      "Everyone who can reach the agency's stores, one entry per person: agency administrators first (they reach every store), then each invited person with their role and invitation status in every store they are on. `stores` lists the agency's stores for reference.",
    input: z.object({}),
    run: async (ctx) => {
      const { stores, people } = await agencyPeople(agencyOf(ctx));
      return {
        stores: stores.map((store) => ({ id: store.id, name: store.name, status: store.status })),
        data: people.map(presentPerson),
      };
    },
  }),
  define({
    id: "invitePerson",
    method: "POST",
    path: "/agency/people",
    scope: "agency:write",
    tag: "Agency",
    summary: "Invite a person to several stores",
    description:
      "Gives one person a role in each of the listed active stores at once. Stores they are already on are left as they are, so sending the same request again adds nothing twice. Someone who already has an account is active at once; anyone else is emailed a link per store.",
    status: 201,
    actions: ["team#invitePerson"],
    input: z.object({
      email: z.string().describe("The person's email address."),
      name: z.string().describe("Their name, at least 2 characters."),
      language: z
        .string()
        .optional()
        .describe("The language code the invitation emails are written in, when the person has no account yet."),
      stores: z
        .array(
          z.object({
            storeId: z.string().min(1).describe("One of the agency's active stores."),
            role: z.enum(STORE_ROLES as [string, ...string[]]).describe("store_admin, catalog_manager, order_manager or viewer."),
          }),
        )
        .min(1)
        .max(500)
        .describe("The stores to add them to, with their role in each."),
    }),
    run: async (ctx, input) => {
      const { added } = await invitePerson(agencyOf(ctx), {
        email: input.email,
        name: input.name,
        language: input.language,
        roles: input.stores.map((entry): [string, string] => [entry.storeId, entry.role]),
      });
      return { data: added.map(presentMembership) };
    },
  }),
  define({
    id: "removePersonFromStores",
    method: "POST",
    path: "/agency/people/remove",
    scope: "agency:write",
    tag: "Agency",
    summary: "Remove a person from the agency's stores",
    description:
      "Takes a person off the stores whose memberships are listed (from listAgencyPeople), in one step. Only the memberships named are removed, and only those belonging to that email in the agency's stores; each store records its own activity entry.",
    destructive: true,
    actions: ["team#removePersonEverywhere"],
    input: z.object({
      email: z.string().min(1).describe("The person's email address."),
      membershipIds: z.array(z.string().min(1)).min(1).max(500).describe("The memberships to remove."),
    }),
    run: async (ctx, input) => ({ removed: await removePersonEverywhere(agencyOf(ctx), input) }),
  }),
  define({
    id: "getBillingStatus",
    method: "GET",
    path: "/agency/billing",
    scope: "agency:read",
    tag: "Agency",
    summary: "Get the agency's plan and billing status",
    description:
      "Read only. The agency's plan, how many live stores it allows and how many are in use, and the subscription's status, billing period and next invoice. `billing` is null for an agency invoiced outside the workspace. A `pending` subscription has not finished checkout and starts with a free trial of `trialDays` days. Plans are changed by the agency administrator in the workspace.",
    input: z.object({}),
    run: async (ctx) => {
      const agencyId = ctx.store.agencyId;
      const [agency, activeStores] = await Promise.all([getAgency(agencyId), countActiveStoresForAgency(agencyId)]);
      if (!agency) notFound("Agency");
      const allowance = storeAllowance(agency.plan, activeStores);
      const billing = agency.billing;
      const upcoming =
        billing?.stripeCustomerId && billing.stripeSubscriptionId && billing.status !== "canceled"
          ? await nextInvoice(billing.stripeCustomerId, billing.stripeSubscriptionId)
          : null;
      return {
        agency: { id: agency.id, name: agency.name },
        plan: { key: allowance.plan.key, name: allowance.plan.name, auditExport: allowance.plan.auditExport },
        stores: {
          limit: allowance.limit,
          used: allowance.used,
          remaining: allowance.remaining,
          atLimit: allowance.atLimit,
          nextPlan: allowance.nextPlan ? { key: allowance.nextPlan.key, name: allowance.nextPlan.name, limit: allowance.nextPlan.storeLimit } : null,
        },
        billing: billing
          ? {
              status: billing.status,
              plan: billing.plan,
              cycle: billing.cycle,
              currency: billing.currency,
              trialDays: billingPending(agency) ? TRIAL_DAYS : null,
              activatedAt: billing.activatedAt,
              currentPeriodEnd: billing.currentPeriodEnd ?? null,
              cancelAtPeriodEnd: billing.cancelAtPeriodEnd ?? false,
              nextInvoice: upcoming
                ? { amountDue: upcoming.amountDue, currency: upcoming.currency, date: upcoming.date }
                : null,
            }
          : null,
      };
    },
  }),
];
