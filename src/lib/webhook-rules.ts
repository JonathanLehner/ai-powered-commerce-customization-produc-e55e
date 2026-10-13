/**
 * Outgoing webhooks: the topics a store can subscribe to, which addresses may
 * receive them, how long a failed delivery waits before its next attempt, and
 * when an endpoint that keeps failing is turned off.
 *
 * Pure, so the settings form, the Admin API and `npm run webhook-check` read
 * the same rules. Signing and sending live in `./webhooks`.
 */

export const WEBHOOK_TOPICS = [
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
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export function isWebhookTopic(value: unknown): value is WebhookTopic {
  return typeof value === "string" && (WEBHOOK_TOPICS as readonly string[]).includes(value);
}

/** The topic's message key: `order.created` → `order_created`. */
export function topicKey<T extends WebhookTopic>(topic: T) {
  return topic.replace(".", "_") as T extends `${infer A}.${infer B}` ? `${A}_${B}` : never;
}

/** The topics asked for, each once, in the order of `WEBHOOK_TOPICS`. */
export function parseTopics(values: unknown): WebhookTopic[] {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const wanted = new Set(list.map((value) => (typeof value === "string" ? value.trim() : value)));
  return WEBHOOK_TOPICS.filter((topic) => wanted.has(topic));
}

export const MAX_ENDPOINTS_PER_STORE = 20;
export const MAX_DESCRIPTION_LENGTH = 120;

/**
 * Seconds to wait after each failed attempt before the next one. A delivery is
 * tried once straight away and then at these intervals, about 27 hours in all,
 * before it is given up on.
 */
export const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 3600, 6 * 3600, 18 * 3600];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/** When the next attempt is due after `attempts` failed ones; null once they are used up. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_SECONDS[Math.max(0, attempts - 1)];
  return new Date(now.getTime() + delay * 1000);
}

/** Failed attempts in a row, across all of an endpoint's deliveries, that turn it off. */
export const DISABLE_AFTER_FAILURES = 15;

export function shouldDisable(failureStreak: number): boolean {
  return failureStreak >= DISABLE_AFTER_FAILURES;
}

/** A response in the 2xx range is a delivery; anything else, or no response, is a failure. */
export function deliveredStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}

/** Seconds an endpoint has to answer. */
export const DELIVERY_TIMEOUT_MS = 10_000;
/** How much of a response body the delivery log keeps. */
export const RESPONSE_SNIPPET_LENGTH = 500;

export type EndpointUrlProblem = "invalid" | "https" | "private" | "credentials";

function privateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * Whether an address may receive webhooks: a public HTTPS URL. Local and
 * private network addresses are refused, so an endpoint cannot be pointed at
 * the platform's own network.
 */
export function endpointUrlProblem(value: string): EndpointUrlProblem | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "invalid";
  }
  if (value.trim().length > 2048) return "invalid";
  if (url.protocol !== "https:") return "https";
  if (url.username || url.password) return "credentials";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return "private";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "private";
  }
  if (privateIPv4(host)) return "private";
  if (host.includes(":")) {
    // IPv6: loopback, unspecified, unique local, link local, and IPv4-mapped.
    if (host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:")) {
      return "private";
    }
  }
  return null;
}

/** The URL as stored: trimmed, and parsed back so equal addresses read the same. */
export function normaliseEndpointUrl(value: string): string {
  return new URL(value.trim()).toString();
}

/** The body every delivery carries, as Standard Webhooks lays it out. */
export function webhookPayload(topic: WebhookTopic, data: unknown, at: Date): string {
  return JSON.stringify({ type: topic, timestamp: at.toISOString(), data });
}
