import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, recordAudit } from "../data";
import { db } from "../mongo";
import type { WebhookDelivery, WebhookEndpoint } from "../types";
import { newId } from "../util";
import { MAX_ENDPOINTS, normalizeTopics, webhookUrlProblem } from "../webhook-rules";
import { getEndpoint, listEndpoints, newWebhookSecret, resendDelivery, settleOpenDeliveries } from "../webhooks";
import { OperationError, type OperationContext } from "./context";

/**
 * Webhook endpoints as Settings → Webhooks and the Admin API change them.
 */

export interface EndpointInput {
  url: string;
  description?: string;
  topics: unknown[];
}

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.webhooks" });
}

function revalidate(ctx: OperationContext, endpointId?: string) {
  revalidatePath(`/app/stores/${ctx.store.id}/setup/webhooks`);
  if (endpointId) revalidatePath(`/app/stores/${ctx.store.id}/setup/webhooks/${endpointId}`);
}

function audit(ctx: OperationContext, action: string, summary: string, endpoint: WebhookEndpoint, meta: Record<string, string | number | boolean | null> = {}) {
  recordAudit({
    category: "store_setup",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "webhook_endpoint",
    entityId: endpoint.id,
    meta: { url: endpoint.url, ...meta },
  });
}

async function checkInput(ctx: OperationContext, input: EndpointInput) {
  const t = await messages(ctx);
  const url = String(input.url ?? "").trim();
  const problem = webhookUrlProblem(url);
  if (problem) throw new OperationError("invalid", t(`url.${problem}`), "url");
  const topics = normalizeTopics(Array.isArray(input.topics) ? input.topics : []);
  if (topics.length === 0) throw new OperationError("invalid", t("topicsRequired"), "topics");
  const description = String(input.description ?? "").trim();
  if (description.length > 120) throw new OperationError("invalid", t("descriptionTooLong", { max: 120 }), "description");
  return { url, topics, description };
}

export async function findEndpoint(ctx: OperationContext, id: string): Promise<WebhookEndpoint> {
  const endpoint = await getEndpoint(ctx.store.id, id);
  if (!endpoint) throw new OperationError("not_found", (await messages(ctx))("notFound"), "endpointId");
  return endpoint;
}

export async function createEndpoint(
  ctx: OperationContext,
  input: EndpointInput & { submissionKey?: string | null },
): Promise<WebhookEndpoint> {
  const t = await messages(ctx);
  const checked = await checkInput(ctx, input);
  const key = input.submissionKey?.trim() || null;
  if (key) {
    const replayed = await db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { storeId: ctx.store.id, submissionKey: key });
    if (replayed) return replayed;
  }
  const existing = await listEndpoints(ctx.store.id);
  if (existing.length >= MAX_ENDPOINTS) throw new OperationError("conflict", t("tooMany", { max: MAX_ENDPOINTS }));
  if (existing.some((endpoint) => endpoint.url === checked.url)) {
    throw new OperationError("conflict", t("duplicate"), "url");
  }
  const now = new Date().toISOString();
  const endpoint: WebhookEndpoint = {
    id: newId("whe"),
    storeId: ctx.store.id,
    ...checked,
    secret: newWebhookSecret(),
    status: "enabled",
    disabledReason: null,
    disabledAt: null,
    consecutiveFailures: 0,
    submissionKey: key,
    createdBy: ctx.actor.name,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.webhookEndpoints, endpoint as unknown as Record<string, unknown>);
  audit(ctx, "webhook.created", `Added webhook endpoint ${endpoint.url}`, endpoint, { topics: endpoint.topics.join(",") });
  revalidate(ctx);
  return endpoint;
}

export async function updateEndpoint(
  ctx: OperationContext,
  endpoint: WebhookEndpoint,
  input: Partial<EndpointInput>,
): Promise<WebhookEndpoint> {
  const checked = await checkInput(ctx, {
    url: input.url ?? endpoint.url,
    description: input.description ?? endpoint.description,
    topics: input.topics ?? endpoint.topics,
  });
  if (checked.url !== endpoint.url) {
    const clash = await db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, {
      storeId: ctx.store.id,
      url: checked.url,
      id: { $ne: endpoint.id },
    });
    if (clash) throw new OperationError("conflict", (await messages(ctx))("duplicate"), "url");
  }
  const patch = { ...checked, updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.webhookEndpoints, { id: endpoint.id, storeId: ctx.store.id }, { $set: patch });
  audit(ctx, "webhook.updated", `Updated webhook endpoint ${checked.url}`, { ...endpoint, ...patch }, { topics: checked.topics.join(",") });
  revalidate(ctx, endpoint.id);
  return { ...endpoint, ...patch };
}

/** Turns an endpoint on or off. Turning it on clears the failure count, so it gets a fresh run. */
export async function setEndpointEnabled(
  ctx: OperationContext,
  endpoint: WebhookEndpoint,
  enabled: boolean,
): Promise<WebhookEndpoint> {
  if ((endpoint.status === "enabled") === enabled) return endpoint;
  const now = new Date().toISOString();
  const patch: Partial<WebhookEndpoint> = enabled
    ? { status: "enabled", disabledReason: null, disabledAt: null, consecutiveFailures: 0, updatedAt: now }
    : { status: "disabled", disabledReason: "manual", disabledAt: now, updatedAt: now };
  await db.updateOne(COLLECTIONS.webhookEndpoints, { id: endpoint.id, storeId: ctx.store.id }, { $set: patch });
  if (!enabled) await settleOpenDeliveries(endpoint.id);
  audit(ctx, enabled ? "webhook.enabled" : "webhook.disabled", `${enabled ? "Turned on" : "Turned off"} webhook endpoint ${endpoint.url}`, endpoint);
  revalidate(ctx, endpoint.id);
  return { ...endpoint, ...patch };
}

export async function rotateEndpointSecret(ctx: OperationContext, endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
  const patch = { secret: newWebhookSecret(), updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.webhookEndpoints, { id: endpoint.id, storeId: ctx.store.id }, { $set: patch });
  audit(ctx, "webhook.secret_rotated", `Rotated the signing secret of webhook endpoint ${endpoint.url}`, endpoint);
  revalidate(ctx, endpoint.id);
  return { ...endpoint, ...patch };
}

export async function deleteEndpoint(ctx: OperationContext, endpoint: WebhookEndpoint): Promise<void> {
  await db.deleteOne(COLLECTIONS.webhookEndpoints, { id: endpoint.id, storeId: ctx.store.id });
  await db.deleteMany(COLLECTIONS.webhookDeliveries, { endpointId: endpoint.id, storeId: ctx.store.id });
  audit(ctx, "webhook.deleted", `Deleted webhook endpoint ${endpoint.url}`, endpoint);
  revalidate(ctx);
}

/** Sends one delivery again, now. Refused while the endpoint is off. */
export async function resend(ctx: OperationContext, endpoint: WebhookEndpoint, deliveryId: string): Promise<WebhookDelivery> {
  const t = await messages(ctx);
  const delivery = await db.findOne<WebhookDelivery>(COLLECTIONS.webhookDeliveries, {
    storeId: ctx.store.id,
    endpointId: endpoint.id,
    id: deliveryId,
  });
  if (!delivery) throw new OperationError("not_found", t("deliveryNotFound"), "deliveryId");
  if (endpoint.status !== "enabled") throw new OperationError("conflict", t("endpointOff"));
  const done = await resendDelivery(delivery, endpoint);
  if (!done) throw new OperationError("conflict", t("inFlight"));
  audit(ctx, "webhook.resent", `Resent ${delivery.topic} ${delivery.id} to ${endpoint.url}`, endpoint, {
    delivery: delivery.id,
    responseCode: done.responseCode,
  });
  revalidate(ctx, endpoint.id);
  return done;
}

/** An endpoint as the API returns it. The secret only goes out when it is created or rotated. */
export function presentEndpoint(endpoint: WebhookEndpoint, withSecret = false) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secret, submissionKey: _key, ...rest } = endpoint;
  return withSecret ? { ...rest, secret } : rest;
}

export function presentDelivery(delivery: WebhookDelivery) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lockedUntil: _lock, expiresAt: _expires, payload, ...rest } = delivery;
  return { ...rest, payload: JSON.parse(payload) as unknown };
}
