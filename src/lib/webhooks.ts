import "server-only";
import { after } from "next/server";
import { Webhook } from "standardwebhooks";
import { COLLECTIONS, recordAudit } from "./data";
import { db } from "./mongo";
import type { Store } from "./types";
import { newId } from "./util";
import {
  DELIVERY_TIMEOUT_MS,
  RESPONSE_SNIPPET_LENGTH,
  deliveredStatus,
  nextAttemptAt,
  shouldDisable,
  webhookPayload,
  type WebhookTopic,
} from "./webhook-rules";

/**
 * Sending a store's events to the endpoints its administrators registered.
 *
 * An event is written as one delivery per subscribed endpoint, after the
 * response has gone out, and tried straight away. Each attempt is signed with
 * the endpoint's own secret in the Standard Webhooks format by the
 * `standardwebhooks` package. A failed delivery is tried again on the schedule
 * in `./webhook-rules` by whichever request runs the scheduler next
 * (`./scheduler`); an endpoint that keeps failing is turned off and its store
 * team notified.
 */

export interface WebhookEndpoint {
  id: string;
  storeId: string;
  url: string;
  description: string;
  topics: WebhookTopic[];
  /** `whsec_` and the base64 key, as Standard Webhooks writes it. */
  secret: string;
  enabled: boolean;
  /** Why it is off: `failures` when it was turned off automatically. */
  disabledReason: "failures" | "manual" | null;
  disabledAt: string | null;
  /** Failed attempts in a row since the last success. */
  failureStreak: number;
  lastDeliveryAt: string | null;
  lastStatus: "succeeded" | "failed" | null;
  createdByName: string;
  submissionKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookAttempt {
  at: string;
  /** The HTTP status the endpoint answered with; null when it did not answer. */
  responseCode: number | null;
  /** `timeout` or `network` when there was no answer. */
  error: "timeout" | "network" | null;
  durationMs: number;
  responseBody: string | null;
  /** Set on an attempt someone asked for with Resend. */
  manual?: boolean;
}

export type DeliveryStatus = "pending" | "retrying" | "succeeded" | "failed" | "cancelled";

export interface WebhookDelivery {
  /** Also the `webhook-id` header, the same on every attempt, so a receiver can drop repeats. */
  id: string;
  storeId: string;
  endpointId: string;
  topic: WebhookTopic;
  payload: string;
  status: DeliveryStatus;
  attempts: WebhookAttempt[];
  responseCode: number | null;
  nextAttemptAt: string | null;
  leaseUntil: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the log entry is deleted. */
  expiresAt: Date;
}

const LOG_DAYS = 30;
const LEASE_MS = 60_000;

/* ---------------------------------------------------------------- reads */

export function listEndpoints(storeId: string): Promise<WebhookEndpoint[]> {
  return db.find<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { storeId }, { sort: { createdAt: 1 } });
}

export function findEndpoint(storeId: string, endpointId: string): Promise<WebhookEndpoint | null> {
  return db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { storeId, id: endpointId });
}

export function listDeliveries(storeId: string, endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
  return db.find<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    { storeId, endpointId },
    { sort: { createdAt: -1, id: -1 }, limit },
  );
}

export function findDelivery(storeId: string, deliveryId: string): Promise<WebhookDelivery | null> {
  return db.findOne<WebhookDelivery>(COLLECTIONS.webhookDeliveries, { storeId, id: deliveryId });
}

/** A new signing secret: 24 random bytes, base64, with the Standard Webhooks prefix. */
export function newWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${btoa(String.fromCharCode(...bytes))}`;
}

/* ---------------------------------------------------------------- events */

/** Work started outside a request (the check scripts), so they can wait for it. */
const inflight = new Set<Promise<unknown>>();

/** Waits for event work started outside a request. Only the check scripts need this. */
export async function settleWebhookWork(): Promise<void> {
  while (inflight.size > 0) await Promise.all([...inflight]);
}

function background(work: () => Promise<unknown>): void {
  const run = () => work().catch((error: unknown) => console.error("Webhook work failed", error));
  try {
    after(run);
  } catch {
    const pending = run();
    inflight.add(pending);
    void pending.finally(() => inflight.delete(pending));
  }
}

/**
 * Sends `topic` to every enabled endpoint of the store subscribed to it. Runs
 * after the response; `load` reads the record as it is now, and is only
 * called when someone is listening. The store can be given as a lookup when
 * the caller does not have it to hand. Never throws.
 */
export function emitWebhook(
  storeId: string | (() => Promise<string | null | undefined>),
  topic: WebhookTopic,
  load: () => Promise<unknown>,
): void {
  background(async () => {
    const id = typeof storeId === "string" ? storeId : await storeId();
    if (id) await enqueueWebhook(id, topic, load);
  });
}

/** Writes the deliveries for one event and makes their first attempt. Returns their ids. */
export async function enqueueWebhook(
  storeId: string,
  topic: WebhookTopic,
  load: () => Promise<unknown>,
): Promise<string[]> {
  const endpoints = await db.find<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, {
    storeId,
    enabled: true,
    topics: topic,
  });
  if (endpoints.length === 0) return [];
  const data = await load();
  if (data === null || data === undefined) return [];

  const now = new Date();
  const payload = webhookPayload(topic, data, now);
  const deliveries: WebhookDelivery[] = endpoints.map((endpoint) => ({
    id: newId("msg"),
    storeId,
    endpointId: endpoint.id,
    topic,
    payload,
    status: "pending",
    attempts: [],
    responseCode: null,
    nextAttemptAt: now.toISOString(),
    leaseUntil: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOG_DAYS * 86_400_000),
  }));
  await db.insertMany(COLLECTIONS.webhookDeliveries, deliveries as unknown as Record<string, unknown>[]);
  await Promise.all(deliveries.map((delivery) => attemptDelivery(delivery.id)));
  return deliveries.map((delivery) => delivery.id);
}

/* -------------------------------------------------------------- delivery */

async function post(endpoint: WebhookEndpoint, delivery: WebhookDelivery, manual: boolean): Promise<WebhookAttempt> {
  const sentAt = new Date();
  const signature = new Webhook(endpoint.secret).sign(delivery.id, sentAt, delivery.payload);
  const started = Date.now();
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Parcelith-Webhooks/1.0",
        "webhook-id": delivery.id,
        "webhook-timestamp": String(Math.floor(sentAt.getTime() / 1000)),
        "webhook-signature": signature,
      },
      body: delivery.payload,
      // A redirect is answered as it stands: following it could lead anywhere.
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const body = await response.text().catch(() => "");
    return {
      at: sentAt.toISOString(),
      responseCode: response.status,
      error: null,
      durationMs: Date.now() - started,
      responseBody: body.slice(0, RESPONSE_SNIPPET_LENGTH) || null,
      ...(manual ? { manual } : {}),
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      at: sentAt.toISOString(),
      responseCode: null,
      error: timedOut ? "timeout" : "network",
      durationMs: Date.now() - started,
      responseBody: null,
      ...(manual ? { manual } : {}),
    };
  }
}

/**
 * Makes one attempt at a delivery that is due, and records it. The delivery is
 * leased first, so two requests running the scheduler at once never send it
 * twice. `force` skips the wait (Resend). Null when someone else holds it or it
 * is not due.
 */
export async function attemptDelivery(deliveryId: string, force = false): Promise<WebhookDelivery | null> {
  const now = new Date();
  const claimed = await db.findOneAndUpdate<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    {
      id: deliveryId,
      status: { $in: ["pending", "retrying"] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now.toISOString() } }],
      ...(force ? {} : { nextAttemptAt: { $lte: now.toISOString() } }),
    },
    { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() } },
  );
  if (!claimed) return null;

  const endpoint = await db.findOne<WebhookEndpoint>(COLLECTIONS.webhookEndpoints, { id: claimed.endpointId });
  if (!endpoint || !endpoint.enabled) {
    return db.findOneAndUpdate<WebhookDelivery>(
      COLLECTIONS.webhookDeliveries,
      { id: claimed.id },
      { $set: { status: "cancelled", nextAttemptAt: null, leaseUntil: null, updatedAt: new Date().toISOString() } },
    );
  }

  const attempt = await post(endpoint, claimed, force);
  const ok = deliveredStatus(attempt.responseCode);
  const next = ok ? null : nextAttemptAt(claimed.attempts.length + 1, new Date());
  const status: DeliveryStatus = ok ? "succeeded" : next ? "retrying" : "failed";
  const updated = await db.findOneAndUpdate<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    { id: claimed.id },
    {
      $push: { attempts: attempt },
      $set: {
        status,
        responseCode: attempt.responseCode,
        nextAttemptAt: next?.toISOString() ?? null,
        leaseUntil: null,
        updatedAt: new Date().toISOString(),
      },
    },
  );
  await recordOutcome(endpoint, ok, attempt.at);
  return updated;
}

/** Keeps the endpoint's failure streak, and turns it off once the streak is too long. */
async function recordOutcome(endpoint: WebhookEndpoint, ok: boolean, at: string): Promise<void> {
  if (ok) {
    await db.updateOne(
      COLLECTIONS.webhookEndpoints,
      { id: endpoint.id },
      { $set: { failureStreak: 0, lastDeliveryAt: at, lastStatus: "succeeded" } },
    );
    return;
  }
  const after = await db.findOneAndUpdate<WebhookEndpoint>(
    COLLECTIONS.webhookEndpoints,
    { id: endpoint.id },
    { $inc: { failureStreak: 1 }, $set: { lastDeliveryAt: at, lastStatus: "failed" } },
  );
  if (!after || !shouldDisable(after.failureStreak)) return;
  await disableForFailures(after);
}

async function disableForFailures(endpoint: WebhookEndpoint): Promise<void> {
  const now = new Date().toISOString();
  // Guarded on it still being on, so two failures landing together turn it off once.
  const result = await db.updateOne(
    COLLECTIONS.webhookEndpoints,
    { id: endpoint.id, enabled: true },
    { $set: { enabled: false, disabledReason: "failures", disabledAt: now, updatedAt: now } },
  );
  if (result.modifiedCount !== 1) return;
  await db.updateMany(
    COLLECTIONS.webhookDeliveries,
    { endpointId: endpoint.id, status: { $in: ["pending", "retrying"] } },
    { $set: { status: "cancelled", nextAttemptAt: null, updatedAt: now } },
  );
  const store = await db.findOne<Store>(COLLECTIONS.stores, { id: endpoint.storeId });
  recordAudit({
    category: "store_setup",
    action: "webhook.disabled",
    summary: `Turned off the webhook endpoint ${endpoint.url} after ${endpoint.failureStreak} failed attempts in a row`,
    storeId: endpoint.storeId,
    agencyId: store?.agencyId ?? null,
    actorId: "system",
    actorName: "Parcelith webhooks",
    entity: "webhook_endpoint",
    entityId: endpoint.id,
    meta: { url: endpoint.url, failures: endpoint.failureStreak },
    notify: {
      type: "webhook_disabled",
      href: `/app/stores/${endpoint.storeId}/setup/webhooks/${endpoint.id}`,
      params: { name: hostOf(endpoint.url) },
    },
  });
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Makes the next attempt of every delivery that is due, oldest first. Returns how many were tried. */
export async function runDueDeliveries(limit = 25): Promise<number> {
  const due = await db.find<WebhookDelivery>(
    COLLECTIONS.webhookDeliveries,
    { status: { $in: ["pending", "retrying"] }, nextAttemptAt: { $lte: new Date().toISOString() } },
    { sort: { nextAttemptAt: 1 }, limit },
  );
  let tried = 0;
  for (let i = 0; i < due.length; i += 5) {
    const results = await Promise.all(due.slice(i, i + 5).map((delivery) => attemptDelivery(delivery.id)));
    tried += results.filter(Boolean).length;
  }
  return tried;
}
