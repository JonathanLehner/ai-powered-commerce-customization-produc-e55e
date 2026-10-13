import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, recordAudit } from "../data";
import { db } from "../mongo";
import { newId } from "../util";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ENDPOINTS_PER_STORE,
  endpointUrlProblem,
  normaliseEndpointUrl,
  parseTopics,
} from "../webhook-rules";
import {
  attemptDelivery,
  findDelivery,
  findEndpoint,
  listEndpoints,
  newWebhookSecret,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "../webhooks";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's webhook endpoints: adding, changing, turning on and off, rotating
 * the signing secret, removing, and sending a logged delivery again. Only
 * store administrators reach these: the workspace actions need the settings
 * capability, and the API's `webhooks` scope needs the key's maker to still
 * administer the store.
 */

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.webhooks" });
}

function audit(ctx: OperationContext, action: string, summary: string, endpoint: Pick<WebhookEndpoint, "id" | "url">) {
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
    meta: { url: endpoint.url },
  });
}

function refresh(storeId: string, endpointId?: string) {
  revalidatePath(`/app/stores/${storeId}/setup/webhooks`);
  if (endpointId) revalidatePath(`/app/stores/${storeId}/setup/webhooks/${endpointId}`);
}

export { findDelivery, findEndpoint, listEndpoints };

export interface EndpointInput {
  url?: string;
  description?: string;
  topics?: unknown;
  enabled?: boolean;
}

async function readUrl(ctx: OperationContext, value: string): Promise<string> {
  const t = await messages(ctx);
  const problem = endpointUrlProblem(value);
  if (problem) throw new OperationError("invalid", t(`url.${problem}`), "url");
  return normaliseEndpointUrl(value);
}

async function readTopics(ctx: OperationContext, value: unknown) {
  const topics = parseTopics(value);
  if (topics.length === 0) throw new OperationError("invalid", (await messages(ctx))("topicsRequired"), "topics");
  return topics;
}

/** Adds an endpoint. A resubmitted form with the same key returns the endpoint it already added. */
export async function createEndpoint(
  ctx: OperationContext,
  input: EndpointInput & { url: string; submissionKey?: string | null },
): Promise<WebhookEndpoint> {
  const t = await messages(ctx);
  if (input.submissionKey) {
    const already = await db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, {
      storeId: ctx.store.id,
      submissionKey: input.submissionKey,
    });
    if (already) return already;
  }
  const url = await readUrl(ctx, input.url);
  const topics = await readTopics(ctx, input.topics);
  const description = (input.description ?? "").trim().slice(0, MAX_DESCRIPTION_LENGTH);
  const existing = await listEndpoints(ctx.store.id);
  if (existing.length >= MAX_ENDPOINTS_PER_STORE) {
    throw new OperationError("conflict", t("limit", { max: MAX_ENDPOINTS_PER_STORE }), "url");
  }
  if (existing.some((endpoint) => endpoint.url === url)) {
    throw new OperationError("conflict", t("duplicate"), "url");
  }

  const now = new Date().toISOString();
  const endpoint: WebhookEndpoint = {
    id: newId("whe"),
    storeId: ctx.store.id,
    url,
    description,
    topics,
    secret: newWebhookSecret(),
    enabled: true,
    disabledReason: null,
    disabledAt: null,
    failureStreak: 0,
    lastDeliveryAt: null,
    lastStatus: null,
    createdByName: ctx.actor.name,
    submissionKey: input.submissionKey ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.webhookEndpoints, endpoint as unknown as Record<string, unknown>);
  audit(ctx, "webhook.created", `Added the webhook endpoint ${url} for ${topics.join(", ")}`, endpoint);
  refresh(ctx.store.id);
  return endpoint;
}

/**
 * Changes an endpoint's address, description, topics, or whether it is on.
 * Turning it back on clears its failure streak, so it gets a fresh start.
 */
export async function updateEndpoint(
  ctx: OperationContext,
  endpoint: WebhookEndpoint,
  input: EndpointInput,
): Promise<WebhookEndpoint> {
  const t = await messages(ctx);
  const patch: Partial<WebhookEndpoint> = {};
  if (input.url !== undefined) {
    const url = await readUrl(ctx, input.url);
    if (url !== endpoint.url) {
      const others = await listEndpoints(ctx.store.id);
      if (others.some((other) => other.id !== endpoint.id && other.url === url)) {
        throw new OperationError("conflict", t("duplicate"), "url");
      }
      patch.url = url;
    }
  }
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  if (input.topics !== undefined) patch.topics = await readTopics(ctx, input.topics);
  if (input.enabled !== undefined && input.enabled !== endpoint.enabled) {
    patch.enabled = input.enabled;
    patch.disabledReason = input.enabled ? null : "manual";
    patch.disabledAt = input.enabled ? null : new Date().toISOString();
    if (input.enabled) patch.failureStreak = 0;
  }
  if (Object.keys(patch).length === 0) return endpoint;

  const next = { ...patch, updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.webhookEndpoints, { storeId: ctx.store.id, id: endpoint.id }, { $set: next });
  if (patch.enabled === false) {
    // Nothing more goes out to an endpoint that was turned off.
    await db.updateMany(
      COLLECTIONS.webhookDeliveries,
      { endpointId: endpoint.id, status: { $in: ["pending", "retrying"] } },
      { $set: { status: "cancelled", nextAttemptAt: null, updatedAt: next.updatedAt } },
    );
  }
  const changed = Object.keys(patch).filter((key) => key !== "disabledReason" && key !== "disabledAt" && key !== "failureStreak");
  audit(
    ctx,
    patch.enabled === true ? "webhook.enabled" : patch.enabled === false ? "webhook.disabled_manually" : "webhook.updated",
    patch.enabled === true
      ? `Turned on the webhook endpoint ${patch.url ?? endpoint.url}`
      : patch.enabled === false
        ? `Turned off the webhook endpoint ${patch.url ?? endpoint.url}`
        : `Changed ${changed.join(", ")} on the webhook endpoint ${patch.url ?? endpoint.url}`,
    { id: endpoint.id, url: patch.url ?? endpoint.url },
  );
  refresh(ctx.store.id, endpoint.id);
  return { ...endpoint, ...next };
}

/** Replaces the signing secret. Deliveries from now on are signed with the new one. */
export async function rotateSecret(ctx: OperationContext, endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
  const next = { secret: newWebhookSecret(), updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.webhookEndpoints, { storeId: ctx.store.id, id: endpoint.id }, { $set: next });
  audit(ctx, "webhook.secret_rotated", `Rotated the signing secret of the webhook endpoint ${endpoint.url}`, endpoint);
  refresh(ctx.store.id, endpoint.id);
  return { ...endpoint, ...next };
}

/** Removes the endpoint and its delivery log. */
export async function deleteEndpoint(ctx: OperationContext, endpoint: WebhookEndpoint): Promise<void> {
  await db.deleteOne(COLLECTIONS.webhookEndpoints, { storeId: ctx.store.id, id: endpoint.id });
  await db.deleteMany(COLLECTIONS.webhookDeliveries, { endpointId: endpoint.id });
  audit(ctx, "webhook.deleted", `Removed the webhook endpoint ${endpoint.url}`, endpoint);
  refresh(ctx.store.id);
}

/**
 * Sends a logged delivery again, now, with the same `webhook-id` so a
 * receiver that already processed it can tell. Waits for the answer, so the
 * log shows it straight away.
 */
export async function resendDelivery(ctx: OperationContext, delivery: WebhookDelivery): Promise<WebhookDelivery> {
  const t = await messages(ctx);
  const endpoint = await findEndpoint(ctx.store.id, delivery.endpointId);
  if (!endpoint) throw new OperationError("not_found", t("notFound"));
  if (!endpoint.enabled) throw new OperationError("conflict", t("resendDisabled"));

  const now = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.webhookDeliveries,
    { id: delivery.id, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] },
    { $set: { status: "pending", nextAttemptAt: now, updatedAt: now } },
  );
  const sent = await attemptDelivery(delivery.id, true);
  if (!sent) throw new OperationError("conflict", t("resendBusy"));
  audit(ctx, "webhook.resent", `Resent ${delivery.topic} delivery ${delivery.id} to ${endpoint.url}`, endpoint);
  refresh(ctx.store.id, endpoint.id);
  return sent;
}
