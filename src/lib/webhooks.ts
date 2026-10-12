import "server-only";
import { after } from "next/server";
import { Webhook } from "standardwebhooks";
import { COLLECTIONS, getStore, recordAudit } from "./data";
import { db } from "./mongo";
import type { WebhookAttempt, WebhookDelivery, WebhookEndpoint, WebhookTopic } from "./types";
import { newId } from "./util";
import {
  DELIVERY_TIMEOUT_MS,
  DISABLE_AFTER_FAILURES,
  MAX_ATTEMPTS,
  isDelivered,
  nextAttemptAt,
  webhookBody,
} from "./webhook-rules";

/**
 * Outgoing webhooks: a store's events posted to the endpoints its team added,
 * signed with each endpoint's own secret in the Standard Webhooks format.
 *
 * An event is written as one delivery per subscribed endpoint and the first
 * attempt is made after the response has gone out. A failed attempt is tried
 * again on the schedule in `webhook-rules.ts` by `runDueDeliveries`, which the
 * jobs route and the workspace call. An endpoint that keeps failing is switched
 * off and its team is notified.
 *
 * Nothing here may break the change that raised the event: emitting never
 * throws and never waits on a receiver.
 */

/** A new signing secret: `whsec_` and 24 random bytes in base64. */
export function newWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${btoa(String.fromCharCode(...bytes))}`;
}

/** The three Standard Webhooks headers for one attempt. */
export function signDelivery(secret: string, id: string, payload: string, at: Date) {
  return {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
    "webhook-signature": new Webhook(secret).sign(id, at, payload),
  };
}

export function listEndpoints(storeId: string) {
  return db.find<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { storeId }, { sort: { createdAt: 1 } });
}

export function getEndpoint(storeId: string, id: string) {
  return db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { storeId, id });
}

export function listDeliveries(storeId: string, endpointId: string, limit = 50) {
  return db.find<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    { storeId, endpointId },
    { sort: { createdAt: -1 }, limit },
  );
}

export function getDelivery(storeId: string, id: string) {
  return db.findOne<WebhookDelivery>(COLLECTIONS.webhookDeliveries, { storeId, id });
}

/* ---------------------------------------------------------------- emitting */

/** How long the delivery log keeps an event. */
const KEEP_DAYS = 30;

/**
 * Raises one event in a store. Returns at once; the deliveries are written and
 * first attempted after the response, or inline outside a request.
 */
export function emitWebhook(storeId: string, topic: WebhookTopic, data: unknown): void {
  const at = new Date();
  const run = () =>
    queueEvent(storeId, topic, data, at).catch((error: unknown) =>
      console.error(`Webhook ${topic} for ${storeId} could not be queued`, error),
    );
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Writes the event's deliveries and makes their first attempt. Exported for the check script. */
export async function queueEvent(storeId: string, topic: WebhookTopic, data: unknown, at = new Date()) {
  const endpoints = await db.find<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, {
    storeId,
    status: "enabled",
    topics: topic,
  });
  if (endpoints.length === 0) return [];
  const payload = webhookBody(topic, data, at);
  const now = at.toISOString();
  const deliveries: WebhookDelivery[] = endpoints.map((endpoint) => ({
    id: newId("msg"),
    storeId,
    endpointId: endpoint.id,
    topic,
    payload,
    status: "pending",
    attempts: [],
    responseCode: null,
    nextAttemptAt: now,
    lockedUntil: null,
    expiresAt: new Date(at.getTime() + KEEP_DAYS * 86_400_000),
    createdAt: now,
    updatedAt: now,
  }));
  await db.insertMany(COLLECTIONS.webhookDeliveries, deliveries as unknown as Record<string, unknown>[]);
  return Promise.all(
    deliveries.map(async (delivery, index) => {
      const claimed = await claim(delivery.id);
      return claimed ? attempt(claimed, endpoints[index], false) : delivery;
    }),
  );
}

/* -------------------------------------------------------------- delivering */

const LOCK_MS = DELIVERY_TIMEOUT_MS * 3;

/** Takes a delivery for one attempt; null when another worker already holds it or it is settled. */
async function claim(id: string, manual = false): Promise<WebhookDelivery | null> {
  const now = new Date();
  return db.findOneAndUpdate<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    {
      id,
      ...(manual ? {} : { status: { $in: ["pending", "retrying"] } }),
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now.toISOString() } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS).toISOString() } },
  );
}

/** Posts the body once and records how it went. */
async function post(endpoint: WebhookEndpoint, delivery: WebhookDelivery): Promise<Omit<WebhookAttempt, "manual">> {
  const at = new Date();
  const started = Date.now();
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Parcelith-Webhooks/1.0",
        ...signDelivery(endpoint.secret, delivery.id, delivery.payload, at),
      },
      body: delivery.payload,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const text = await response.text().catch(() => "");
    return {
      at: at.toISOString(),
      responseCode: response.status,
      response: text.slice(0, 300),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      at: at.toISOString(),
      responseCode: null,
      response: timedOut ? "Timed out" : error instanceof Error ? error.message.slice(0, 300) : "Could not connect",
      durationMs: Date.now() - started,
    };
  }
}

/**
 * One attempt at a claimed delivery. A manual resend is a single attempt: it
 * schedules nothing further whatever the outcome.
 */
async function attempt(delivery: WebhookDelivery, endpoint: WebhookEndpoint, manual: boolean): Promise<WebhookDelivery> {
  const result: WebhookAttempt = { ...(await post(endpoint, delivery)), manual };
  const attempts = [...delivery.attempts, result];
  const ok = isDelivered(result.responseCode);
  const automatic = attempts.filter((entry) => !entry.manual).length;
  const next = ok || manual || automatic >= MAX_ATTEMPTS ? null : nextAttemptAt(automatic, new Date(result.at));
  const patch: Partial<WebhookDelivery> = {
    attempts,
    responseCode: result.responseCode,
    status: ok ? "succeeded" : next ? "retrying" : "failed",
    nextAttemptAt: next ? next.toISOString() : null,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  };
  await db.updateOne(COLLECTIONS.webhookDeliveries, { id: delivery.id }, { $set: patch });
  await recordOutcome(endpoint, ok);
  return { ...delivery, ...patch };
}

/** Resets the failure count on a success; past the limit, switches the endpoint off and tells the team. */
async function recordOutcome(endpoint: WebhookEndpoint, ok: boolean) {
  if (ok) {
    if (endpoint.consecutiveFailures !== 0) {
      await db.updateOne(COLLECTIONS.webhookEndpoints, { id: endpoint.id }, { $set: { consecutiveFailures: 0 } });
    }
    return;
  }
  const updated = await db.findOneAndUpdate<WebhookEndpoint>(
    COLLECTIONS.webhookEndpoints,
    { id: endpoint.id },
    { $inc: { consecutiveFailures: 1 } },
  );
  if (!updated || updated.status !== "enabled" || updated.consecutiveFailures < DISABLE_AFTER_FAILURES) return;
  await disableFailingEndpoint(updated);
}

async function disableFailingEndpoint(endpoint: WebhookEndpoint) {
  const now = new Date().toISOString();
  // Guarded on the status, so two failures landing together switch it off once.
  const switched = await db.updateOne(
    COLLECTIONS.webhookEndpoints,
    { id: endpoint.id, status: "enabled" },
    { $set: { status: "disabled", disabledReason: "failing", disabledAt: now, updatedAt: now } },
  );
  if (!switched.matchedCount) return;
  await settleOpenDeliveries(endpoint.id);
  const store = await getStore(endpoint.storeId);
  recordAudit({
    category: "store_setup",
    action: "webhook.disabled",
    summary: `Webhook endpoint ${endpoint.url} was turned off after ${endpoint.consecutiveFailures} failed deliveries in a row`,
    storeId: endpoint.storeId,
    agencyId: store?.agencyId ?? null,
    actorId: "system",
    actorName: "Parcelith webhooks",
    entity: "webhook_endpoint",
    entityId: endpoint.id,
    meta: { url: endpoint.url, failures: endpoint.consecutiveFailures },
    notify: {
      type: "webhook_disabled",
      href: `/app/stores/${endpoint.storeId}/setup/webhooks/${endpoint.id}`,
      params: { name: endpoint.url },
    },
  });
}

/** Stops the retries of an endpoint that was switched off; they can still be resent by hand. */
export async function settleOpenDeliveries(endpointId: string) {
  await db.updateMany(
    COLLECTIONS.webhookDeliveries,
    { endpointId, status: { $in: ["pending", "retrying"] } },
    { $set: { status: "failed", nextAttemptAt: null, updatedAt: new Date().toISOString() } },
  );
}

/**
 * Sends one delivery again, now, whatever state it is in. Null when another
 * attempt at it is in flight.
 */
export async function resendDelivery(delivery: WebhookDelivery, endpoint: WebhookEndpoint) {
  const claimed = await claim(delivery.id, true);
  return claimed ? attempt(claimed, endpoint, true) : null;
}

/**
 * Makes the attempts that are due: retries whose time has come, and first
 * attempts that never ran because the process stopped. `storeId` keeps a
 * workspace visit to its own store's queue.
 */
export async function runDueDeliveries(options: { storeId?: string; limit?: number } = {}): Promise<number> {
  const now = new Date().toISOString();
  const due = await db.find<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    {
      ...(options.storeId ? { storeId: options.storeId } : {}),
      status: { $in: ["pending", "retrying"] },
      nextAttemptAt: { $lte: now },
    },
    { sort: { nextAttemptAt: 1 }, limit: options.limit ?? 25 },
  );
  if (due.length === 0) return 0;
  const endpoints = new Map(
    (await db.findIn<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, "id", due.map((d) => d.endpointId))).map((e) => [e.id, e]),
  );
  let sent = 0;
  for (const delivery of due) {
    const endpoint = endpoints.get(delivery.endpointId);
    if (!endpoint || endpoint.status !== "enabled") {
      await settleOpenDeliveries(delivery.endpointId);
      continue;
    }
    const claimed = await claim(delivery.id);
    if (!claimed) continue;
    const done = await attempt(claimed, endpoint, false);
    sent += 1;
    // A switched-off endpoint takes no more attempts in this run.
    if (done.status !== "succeeded") {
      const fresh = await db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { id: endpoint.id });
      if (fresh) endpoints.set(endpoint.id, fresh);
    }
  }
  return sent;
}
