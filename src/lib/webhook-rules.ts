/**
 * The rules of outgoing webhooks: the topics a store can subscribe to, when a
 * failed delivery is tried again, when an endpoint is switched off, and which
 * addresses may receive events.
 *
 * Pure and free of server imports, so the endpoint form, the Admin API and
 * `npm run webhook-check` all read the same lists.
 */
import type { WebhookTopic } from "./types";

export const WEBHOOK_TOPICS: WebhookTopic[] = [
  "order.created",
  "order.paid",
  "order.fulfilled",
  "order.cancelled",
  "order.refunded",
  "product.created",
  "product.updated",
  "product.deleted",
  "customer.created",
  "customer.updated",
  "inventory.updated",
];

export function isWebhookTopic(value: unknown): value is WebhookTopic {
  return typeof value === "string" && (WEBHOOK_TOPICS as string[]).includes(value);
}

/** The topics asked for, each once, in the order of `WEBHOOK_TOPICS`. */
export function normalizeTopics(values: unknown[]): WebhookTopic[] {
  const wanted = new Set(values.filter(isWebhookTopic));
  return WEBHOOK_TOPICS.filter((topic) => wanted.has(topic));
}

/**
 * Minutes to wait before each retry, after the first attempt fails: 1 minute,
 * then 5, 30, 2 hours, 5 hours, 10 hours and 14 hours. Eight attempts in all,
 * spread over about a day and a half.
 */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 300, 600, 840];
export const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;

/** Failed attempts in a row, across all of an endpoint's deliveries, before it is switched off. */
export const DISABLE_AFTER_FAILURES = 15;

/** How long a receiver has to answer one attempt. */
export const DELIVERY_TIMEOUT_MS = 10_000;

/** Endpoints per store. */
export const MAX_ENDPOINTS = 20;

/**
 * When the next attempt is due after `attempts` attempts have failed, or null
 * when that was the last one.
 */
export function nextAttemptAt(attempts: number, from: Date): Date | null {
  const delay = RETRY_DELAYS_MINUTES[attempts - 1];
  return delay === undefined ? null : new Date(from.getTime() + delay * 60_000);
}

/** Whether a receiver's answer counts as delivered: any 2xx. */
export function isDelivered(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}

/** Hosts that would point a delivery back into a private network. */
function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal")) {
    return true;
  }
  if (name === "::1" || name === "::" || name.startsWith("fc") || name.startsWith("fd") || name.startsWith("fe80")) {
    return name.includes(":");
  }
  const parts = name.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export type WebhookUrlProblem = "invalid" | "https" | "private";

/** Why an endpoint address cannot be used, or null when it can. */
export function webhookUrlProblem(value: string): WebhookUrlProblem | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:") return "https";
  if (url.username || url.password || url.hostname.length === 0) return "invalid";
  if (isPrivateHost(url.hostname)) return "private";
  if (value.trim().length > 2000) return "invalid";
  return null;
}

/** The body every delivery carries, as Standard Webhooks lays it out. */
export function webhookBody(topic: WebhookTopic, data: unknown, at: Date): string {
  return JSON.stringify({ type: topic, timestamp: at.toISOString(), data });
}
