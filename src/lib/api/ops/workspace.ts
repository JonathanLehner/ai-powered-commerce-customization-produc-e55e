import "server-only";
import { z } from "zod";
import { LOCALES, isLocale, type Locale } from "@/i18n/locales";
import {
  API_KEY_NAME_LIMIT,
  createApiKey,
  createPlatformApiKey,
  listApiKeys,
  listPlatformApiKeys,
  revokeApiKey,
  revokePlatformApiKey,
  type ApiKey,
} from "../../api-keys";
import { API_RESOURCES, isApiScope, normalizeScopes, scopeAllows, type ApiAccess, type ApiResource } from "../../api-scopes";
import { COLLECTIONS, getAgency, getUserById, listMembershipsForUser, updateUser } from "../../data";
import { siteOrigin } from "../../email";
import { PLAN_ENQUIRY_CHOICES } from "../../enquiry";
import { db } from "../../mongo";
import { markAllRead, markRead, notificationFeed, savePrefs } from "../../notification-inbox";
import { NOTIFICATION_LIST_SIZE, NOTIFICATION_TYPES, resolvePrefs, type NotificationPrefs } from "../../notifications";
import { billingPortalLink, startPayment } from "../../operations/billing";
import type { OperationContext } from "../../operations/context";
import { submitEnquiry } from "../../operations/enquiry";
import { PLAN_CURRENCIES } from "../../plans";
import { SELF_SERVE_PLANS } from "../../signup";
import { resolveStoreRole } from "../../store-access";
import type { User } from "../../types";
import { ApiError } from "../auth";
import { define, defineAdmin, id, idempotencyKey, type AdminContext, type ApiOperation } from "../define";

/**
 * What the workspace does around the store itself: its API keys and the
 * platform keys, the notifications and language of the person a key acts
 * for, the agency's plan payment links, and plan enquiries.
 *
 * A key acts for the person who made it. Keys made through the API are made
 * in that person's name, so they lose their access when the person does, and
 * can never hold a scope the key that made them does not hold.
 */

/** The person a key acts for, while they are still on the store's team. */
async function keyPerson(ctx: OperationContext | AdminContext): Promise<User> {
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { id: ctx.actor.id });
  const person = await getUserById(key ? key.createdById : ctx.actor.id);
  if (!person) throw new ApiError(403, "forbidden", "The person who made this key no longer has an account.");
  if ("store" in ctx) {
    const grant = resolveStoreRole(person, ctx.store, await listMembershipsForUser(person.id));
    if (!grant || grant.viaPlatform) {
      throw new ApiError(403, "forbidden", "The person who made this key is no longer on the store's team.");
    }
  }
  return person;
}

/** The key's own scopes, which a key it makes may not exceed. */
async function callerScopes(ctx: OperationContext): Promise<string[] | null> {
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { id: ctx.actor.id });
  return key ? key.scopes : null;
}

function presentKey(key: Omit<ApiKey, "hash" | "submissionKey">) {
  return {
    id: key.id,
    name: key.name,
    scopes: key.scopes,
    last4: key.last4,
    ...(key.platform ? { platform: true } : {}),
    ...(key.publishable ? { publishable: true } : {}),
    createdAt: key.createdAt,
    createdBy: key.createdByName,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    revokedBy: key.revokedByName,
  };
}

const keyName = z.string().trim().min(1).max(API_KEY_NAME_LIMIT).describe("A name for the key: the app or integration that will use it.");

const SECRET_ONCE =
  "The secret is in this answer only and is never shown again: hand it to the person or system that will use it now. If it is lost, revoke the key and create a new one.";

/* ------------------------------------------------------------- store keys */

const keys = [
  define({
    id: "listApiKeys",
    method: "GET",
    path: "/api-keys",
    scope: "keys:read",
    tag: "API keys",
    summary: "List the store's API keys",
    description:
      "The store's API keys, newest first, revoked ones included: name, scopes, last four characters, who made it and when it was last used. Secrets are never returned. Changes nothing.",
    input: z.object({}),
    run: async (ctx) => ({ data: (await listApiKeys(ctx.store.id)).map(presentKey) }),
  }),
  define({
    id: "createApiKey",
    method: "POST",
    path: "/api-keys",
    scope: "keys:write",
    tag: "API keys",
    summary: "Create an API key",
    description: `Creates an API key for this store with the scopes given, made in the name of the person this key acts for. It cannot hold a scope this key does not hold, and agency scopes only when that person administers the agency. ${SECRET_ONCE} Revoke it with revokeApiKey.`,
    status: 201,
    actions: ["api-keys#createKey"],
    input: z.object({
      name: keyName,
      scopes: z
        .array(z.string())
        .min(1)
        .describe(`Scopes as resource:read or resource:write; write includes read. Resources: ${API_RESOURCES.join(", ")}.`),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const unknown = input.scopes.filter((scope) => !isApiScope(scope));
      if (unknown.length > 0) {
        throw new ApiError(422, "invalid_request", `Unknown scopes: ${unknown.join(", ")}. Resources are ${API_RESOURCES.join(", ")}, each :read or :write.`, "scopes");
      }
      const person = await keyPerson(ctx);
      const held = await callerScopes(ctx);
      const scopes = normalizeScopes(input.scopes, {
        agencyAdmin: person.platformRole === "agency_admin" && person.agencyId === ctx.store.agencyId,
      });
      const beyond = held
        ? scopes.filter((scope) => {
            const [resource, access] = scope.split(":") as [ApiResource, ApiAccess];
            return !scopeAllows(held, resource, access);
          })
        : [];
      if (beyond.length > 0) {
        throw new ApiError(403, "insufficient_scope", `This key cannot grant scopes it does not hold: ${beyond.join(", ")}.`, "scopes");
      }
      if (scopes.length === 0) throw new ApiError(422, "invalid_request", "Give the key access to at least one area.", "scopes");
      const result = await createApiKey(ctx.store, { id: person.id, name: ctx.actor.name }, {
        name: input.name,
        scopes,
        submissionKey: input.idempotencyKey ?? null,
      });
      if (result.status === "duplicate") {
        throw new ApiError(409, "conflict", "This key was already created with this idempotencyKey. If its secret was not kept, revoke it and create a new one.", "idempotencyKey", {
          key: presentKey(result.key),
        });
      }
      return { key: presentKey(result.key), secret: result.secret };
    },
  }),
  define({
    id: "revokeApiKey",
    method: "POST",
    path: "/api-keys/{keyId}/revoke",
    scope: "keys:write",
    tag: "API keys",
    summary: "Revoke an API key",
    description:
      "Revokes one of the store's keys, publishable keys included: every app using it stops working at once. This cannot be undone; create a new key instead. Revoking the key making this call ends its own access. Revoking a revoked key changes nothing.",
    destructive: true,
    actions: ["api-keys#revokeKey"],
    input: z.object({ keyId: id("API key") }),
    run: async (ctx, input) => {
      if (!(await revokeApiKey(ctx.store, ctx.actor, input.keyId))) throw new ApiError(404, "not_found", "API key not found.", "keyId");
      return { revoked: true, id: input.keyId };
    },
  }),
];

/* ----------------------------------------------------------- platform keys */

const platformKeys = [
  defineAdmin({
    id: "listPlatformKeys",
    method: "GET",
    path: "/api-keys",
    summary: "List platform keys",
    description: "The platform keys, newest first, revoked ones included. Secrets are never returned. Changes nothing.",
    input: z.object({}),
    run: async () => ({ data: (await listPlatformApiKeys()).map(presentKey) }),
  }),
  defineAdmin({
    id: "createPlatformKey",
    method: "POST",
    path: "/api-keys",
    summary: "Create a platform key",
    description: `Creates a platform key holding the platform:admin scope, in the name of the platform administrator this key acts for; it stops working when they are no longer one. ${SECRET_ONCE} Revoke it with revokePlatformKey.`,
    status: 201,
    actions: ["platform-keys#createPlatformKey"],
    input: z.object({ name: keyName, idempotencyKey }),
    run: async (ctx, input) => {
      const person = await keyPerson(ctx);
      const result = await createPlatformApiKey({ id: person.id, name: ctx.actor.name }, {
        name: input.name,
        submissionKey: input.idempotencyKey ?? null,
      });
      if (result.status === "duplicate") {
        throw new ApiError(409, "conflict", "This key was already created with this idempotencyKey. If its secret was not kept, revoke it and create a new one.", "idempotencyKey", {
          key: presentKey(result.key),
        });
      }
      return { key: presentKey(result.key), secret: result.secret };
    },
  }),
  defineAdmin({
    id: "revokePlatformKey",
    method: "POST",
    path: "/api-keys/{keyId}/revoke",
    summary: "Revoke a platform key",
    description:
      "Revokes a platform key: everything using it stops working at once. This cannot be undone. Revoking the key making this call ends its own access. Revoking a revoked key changes nothing.",
    destructive: true,
    actions: ["platform-keys#revokePlatformKey"],
    input: z.object({ keyId: id("platform key") }),
    run: async (ctx, input) => {
      if (!(await revokePlatformApiKey(ctx.actor, input.keyId))) throw new ApiError(404, "not_found", "Platform key not found.", "keyId");
      return { revoked: true, id: input.keyId };
    },
  }),
];

/* ------------------------------------------------------------- the person */

const channels = z.object({
  inApp: z.boolean().optional().describe("Show it in the workspace's notification bell."),
  email: z.boolean().optional().describe("Send it by email."),
});

const account = [
  define({
    id: "listNotifications",
    method: "GET",
    path: "/account/notifications",
    scope: "account:read",
    tag: "Account",
    summary: "List notifications",
    description:
      "The notifications in this store of the person this key acts for, newest first, as the workspace's bell shows them: type, parameters, link and whether each is read, plus the unread count. Changes nothing. Mark them read with markNotificationRead or markAllNotificationsRead.",
    actions: ["notifications#loadNotifications"],
    input: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(NOTIFICATION_LIST_SIZE).describe("How many, 1 to 100."),
    }),
    run: async (ctx, input) => {
      const person = await keyPerson(ctx);
      const feed = await notificationFeed(person.id, [ctx.store.id], input.limit);
      return {
        unread: feed.unread,
        data: feed.items.map((n) => ({
          id: n.id,
          type: n.type,
          params: n.params,
          href: n.href,
          createdAt: n.createdAt,
          readAt: n.readAt,
        })),
      };
    },
  }),
  define({
    id: "markNotificationRead",
    method: "POST",
    path: "/account/notifications/{notificationId}/read",
    scope: "account:write",
    tag: "Account",
    summary: "Mark a notification read",
    description: "Marks one notification read for the person this key acts for. There is no unread again. Repeating it changes nothing.",
    actions: ["notifications#markNotificationRead"],
    input: z.object({ notificationId: id("notification") }),
    run: async (ctx, input) => {
      const person = await keyPerson(ctx);
      if (!(await markRead(person.id, input.notificationId, [ctx.store.id]))) {
        throw new ApiError(404, "not_found", "Notification not found.", "notificationId");
      }
      return { read: true, id: input.notificationId };
    },
  }),
  define({
    id: "markAllNotificationsRead",
    method: "POST",
    path: "/account/notifications/read-all",
    scope: "account:write",
    tag: "Account",
    summary: "Mark all notifications read",
    description: "Marks every unread notification in this store read for the person this key acts for, and says how many. There is no unread again.",
    actions: ["notifications#markAllNotificationsRead"],
    input: z.object({}),
    run: async (ctx) => ({ marked: await markAllRead((await keyPerson(ctx)).id, [ctx.store.id]) }),
  }),
  define({
    id: "getNotificationPreferences",
    method: "GET",
    path: "/account/notification-preferences",
    scope: "account:read",
    tag: "Account",
    summary: "Get notification preferences",
    description: `Where each kind of notification goes for the person this key acts for: the bell (inApp) and email. Types: ${NOTIFICATION_TYPES.join(", ")}. Changes nothing.`,
    input: z.object({}),
    run: async (ctx) => ({ preferences: resolvePrefs((await keyPerson(ctx)).notificationPrefs) }),
  }),
  define({
    id: "updateNotificationPreferences",
    method: "PUT",
    path: "/account/notification-preferences",
    scope: "account:write",
    tag: "Account",
    summary: "Change notification preferences",
    description:
      "Changes where some kinds of notification go for the person this key acts for; types and channels left out keep their setting. Both channels off mutes a type. Change it back the same way. These preferences apply in every store the person works in.",
    actions: ["notifications#saveNotificationPrefs"],
    input: z.object({
      preferences: z
        .partialRecord(z.enum(NOTIFICATION_TYPES), channels)
        .describe("Per notification type, the channels to change."),
    }),
    run: async (ctx, input) => {
      const person = await keyPerson(ctx);
      const current = resolvePrefs(person.notificationPrefs);
      const next: NotificationPrefs = { ...current };
      for (const [type, change] of Object.entries(input.preferences) as [keyof typeof current, z.infer<typeof channels>][]) {
        next[type] = { inApp: change.inApp ?? current[type].inApp, email: change.email ?? current[type].email };
      }
      return { preferences: await savePrefs(person.id, next) };
    },
  }),
  define({
    id: "getLanguagePreference",
    method: "GET",
    path: "/account/language",
    scope: "account:read",
    tag: "Account",
    summary: "Get the workspace language",
    description: "The language the person this key acts for reads the workspace in, and the languages it can be set to. Changes nothing.",
    input: z.object({}),
    run: async (ctx) => {
      const person = await keyPerson(ctx);
      return { language: isLocale(person.uiLanguage) ? person.uiLanguage : null, languages: LOCALES };
    },
  }),
  define({
    id: "updateLanguagePreference",
    method: "PUT",
    path: "/account/language",
    scope: "account:write",
    tag: "Account",
    summary: "Set the workspace language",
    description:
      "Sets the language the person this key acts for reads the workspace and its emails in. It does not change the storefront's languages (see updateLanguages). Set it back the same way.",
    actions: ["preferences#setUiLanguage"],
    input: z.object({ language: z.enum(LOCALES).describe("A workspace language code, such as de.") }),
    run: async (ctx, input) => {
      const person = await keyPerson(ctx);
      await updateUser(person.id, { uiLanguage: input.language });
      return { language: input.language };
    },
  }),
];

/* ------------------------------------------------------- billing and sales */

async function billingOwner(ctx: OperationContext) {
  const [person, agency] = await Promise.all([keyPerson(ctx), getAgency(ctx.store.agencyId)]);
  if (!agency) throw new ApiError(404, "not_found", "Agency not found.");
  return { person, agency, locale: (isLocale(person.uiLanguage) ? person.uiLanguage : "en") as Locale };
}

const billing = [
  define({
    id: "createBillingCheckoutLink",
    method: "POST",
    path: "/agency/billing/checkout",
    scope: "agency:write",
    tag: "Agency",
    summary: "Create a plan checkout link",
    description:
      "A Stripe Checkout link where the agency administrator adds payment details for the plan, during or after the free trial. During the trial the plan and billing cycle can be switched here; a plan smaller than the agency's live stores is ignored. Nothing is charged until the administrator completes Checkout in a browser, so give them the URL. Answers 409 when no payment is needed (the plan is active or invoiced outside the workspace). Read the result with getBillingStatus.",
    status: 201,
    actions: ["signup#continueToPayment"],
    input: z.object({
      plan: z.enum(SELF_SERVE_PLANS).optional().describe("Switch to this plan while on the trial."),
      cycle: z.enum(["monthly", "yearly"]).optional().describe("Bill monthly or yearly."),
    }),
    run: async (ctx, input) => {
      const { person, agency, locale } = await billingOwner(ctx);
      const result = await startPayment(agency, person, input, await siteOrigin(), locale);
      if (result.status === "not_needed") throw new ApiError(409, "conflict", "The agency has nothing to pay for now. See getBillingStatus.");
      if (result.status === "unavailable") throw new ApiError(409, "conflict", "Checkout cannot be opened right now. Try again later.");
      return { url: result.url };
    },
  }),
  define({
    id: "createBillingPortalLink",
    method: "POST",
    path: "/agency/billing/portal",
    scope: "agency:write",
    tag: "Agency",
    summary: "Create a billing portal link",
    description:
      "A Stripe billing portal link where the agency administrator updates the card, downloads invoices or cancels the plan in a browser. Opening the link changes nothing by itself. Answers 409 when the agency has no subscription to manage yet; use createBillingCheckoutLink first.",
    status: 201,
    actions: ["billing#openBillingPortal"],
    input: z.object({}),
    run: async (ctx) => {
      const { person, agency } = await billingOwner(ctx);
      const url = await billingPortalLink(agency, { id: person.id, name: ctx.actor.name }, await siteOrigin());
      if (!url) throw new ApiError(409, "conflict", "The agency has no subscription to manage yet. Use createBillingCheckoutLink first.");
      return { url };
    },
  }),
  define({
    id: "createPlanEnquiry",
    method: "POST",
    path: "/agency/plan-enquiries",
    scope: "agency:write",
    tag: "Agency",
    summary: "Send a plan enquiry",
    description:
      "Asks Parcelith's sales team about a plan, as the pricing page's contact form does: they reply by email and the sender gets a confirmation. Name, email and company default to the person this key acts for and their agency. It cannot be withdrawn once sent; the same idempotencyKey never sends it twice.",
    status: 201,
    actions: ["contact#submitPlanEnquiry"],
    input: z.object({
      plan: z.enum(PLAN_ENQUIRY_CHOICES as [string, ...string[]]).describe("The plan asked about, or undecided."),
      message: z.string().max(4000).default("").describe("What the agency needs."),
      wantsCall: z.boolean().default(false).describe("Whether they would like a call."),
      currency: z.enum(PLAN_CURRENCIES).optional().describe("The currency to quote in."),
      name: z.string().optional().describe("Who to reply to. The key's person when left out."),
      email: z.string().optional().describe("Where to reply. The key's person when left out."),
      company: z.string().optional().describe("The company. The agency's name when left out."),
      idempotencyKey,
    }),
    run: async (ctx, input) => {
      const { person, agency, locale } = await billingOwner(ctx);
      const result = await submitEnquiry(
        {
          name: input.name ?? person.name,
          email: input.email ?? person.email,
          company: input.company ?? agency.name,
          message: input.message,
          plan: input.plan,
          currency: input.currency ?? "",
          wantsCall: input.wantsCall,
          submissionKey: input.idempotencyKey ?? "",
        },
        locale,
      );
      if (!result.ok) throw new ApiError(422, "invalid_request", result.message, result.field);
      return { sent: true, duplicate: result.duplicate, id: result.record?.id ?? null };
    },
  }),
];

export const workspaceOperations: ApiOperation[] = [...keys, ...platformKeys, ...account, ...billing];
