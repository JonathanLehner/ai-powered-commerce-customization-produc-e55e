import "server-only";
import { z } from "zod";
import type { OperationContext } from "../../operations/context";
import {
  createEndpoint,
  deleteEndpoint,
  findDelivery,
  findEndpoint,
  listEndpoints,
  resendDelivery,
  rotateSecret,
  updateEndpoint,
} from "../../operations/webhooks";
import { DISABLE_AFTER_FAILURES, MAX_ATTEMPTS, WEBHOOK_TOPICS } from "../../webhook-rules";
import { listDeliveries, type WebhookDelivery, type WebhookEndpoint } from "../../webhooks";
import { define, id, idempotencyKey, notFound, type ApiOperation } from "../define";

/**
 * Webhook endpoints: where the store's events are sent, and the log of what
 * was sent. Only keys made by a store administrator, while they still are
 * one, may use these. The signing secret is returned when an endpoint is
 * created or its secret rotated.
 */

export function presentEndpoint(endpoint: WebhookEndpoint, withSecret = false) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    topics: endpoint.topics,
    enabled: endpoint.enabled,
    disabledReason: endpoint.disabledReason,
    disabledAt: endpoint.disabledAt,
    failureStreak: endpoint.failureStreak,
    lastDeliveryAt: endpoint.lastDeliveryAt,
    lastStatus: endpoint.lastStatus,
    ...(withSecret ? { secret: endpoint.secret } : {}),
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export function presentDelivery(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    topic: delivery.topic,
    status: delivery.status,
    responseCode: delivery.responseCode,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt,
    payload: JSON.parse(delivery.payload) as unknown,
    createdAt: delivery.createdAt,
  };
}

async function endpoint(ctx: OperationContext, endpointId: string): Promise<WebhookEndpoint> {
  return (await findEndpoint(ctx.store.id, endpointId)) ?? notFound("Webhook endpoint");
}

const topics = z
  .array(z.enum(WEBHOOK_TOPICS))
  .min(1)
  .describe(`The events to send: ${WEBHOOK_TOPICS.join(", ")}.`);

const url = z.string().min(1).max(2048).describe("A public HTTPS address that accepts POST requests.");

const DELIVERY_NOTE = `Each delivery is a POST of {"type", "timestamp", "data"} signed in the Standard Webhooks format (webhook-id, webhook-timestamp and webhook-signature headers, HMAC-SHA256 with the endpoint's secret). A 2xx answer within 10 seconds counts as delivered; anything else is tried again up to ${MAX_ATTEMPTS} attempts in all, over about a day. After ${DISABLE_AFTER_FAILURES} failed attempts in a row the endpoint is turned off and the store team notified.`;

export const webhookOperations: ApiOperation[] = [
  define({
    id: "listWebhookEndpoints",
    method: "GET",
    path: "/webhooks",
    scope: "webhooks:read",
    tag: "Webhooks",
    summary: "List webhook endpoints",
    description: `The store's webhook endpoints, oldest first, without their secrets. ${DELIVERY_NOTE}`,
    input: z.object({}),
    run: async (ctx) => ({ data: (await listEndpoints(ctx.store.id)).map((row) => presentEndpoint(row)) }),
  }),
  define({
    id: "createWebhookEndpoint",
    method: "POST",
    path: "/webhooks",
    scope: "webhooks:write",
    tag: "Webhooks",
    status: 201,
    summary: "Add a webhook endpoint",
    description: `Registers an address for the topics given and returns it with its signing secret. Up to 20 per store; an address already registered is refused with 409. ${DELIVERY_NOTE}`,
    input: z.object({
      url,
      topics,
      description: z.string().max(120).optional().describe("A note to tell endpoints apart."),
      idempotencyKey,
    }),
    actions: ["webhooks#createWebhookEndpoint"],
    run: async (ctx, input) =>
      presentEndpoint(
        await createEndpoint(ctx, {
          url: input.url,
          topics: input.topics,
          description: input.description,
          submissionKey: input.idempotencyKey ?? null,
        }),
        true,
      ),
  }),
  define({
    id: "getWebhookEndpoint",
    method: "GET",
    path: "/webhooks/{endpointId}",
    scope: "webhooks:read",
    tag: "Webhooks",
    summary: "Get a webhook endpoint",
    description:
      "One endpoint, without its signing secret. The secret is returned when the endpoint is created and when it is rotated.",
    input: z.object({ endpointId: id("webhook endpoint") }),
    run: async (ctx, input) => presentEndpoint(await endpoint(ctx, input.endpointId)),
  }),
  define({
    id: "updateWebhookEndpoint",
    method: "PATCH",
    path: "/webhooks/{endpointId}",
    scope: "webhooks:write",
    tag: "Webhooks",
    summary: "Change a webhook endpoint",
    description:
      "Changes the address, description or topics, or turns the endpoint off or on with `enabled`. Turning it off cancels its pending retries; turning it back on clears its failure count.",
    input: z.object({
      endpointId: id("webhook endpoint"),
      url: url.optional(),
      topics: topics.optional(),
      description: z.string().max(120).optional(),
      enabled: z.boolean().optional(),
    }),
    actions: ["webhooks#updateWebhookEndpoint", "webhooks#setWebhookEnabled"],
    run: async (ctx, { endpointId, ...input }) =>
      presentEndpoint(await updateEndpoint(ctx, await endpoint(ctx, endpointId), input)),
  }),
  define({
    id: "rotateWebhookSecret",
    method: "POST",
    path: "/webhooks/{endpointId}/rotate-secret",
    scope: "webhooks:write",
    tag: "Webhooks",
    summary: "Rotate a webhook signing secret",
    description: "Replaces the endpoint's signing secret and returns the new one. Deliveries from now on are signed with it.",
    destructive: true,
    input: z.object({ endpointId: id("webhook endpoint") }),
    actions: ["webhooks#rotateWebhookSecret"],
    run: async (ctx, input) => presentEndpoint(await rotateSecret(ctx, await endpoint(ctx, input.endpointId)), true),
  }),
  define({
    id: "deleteWebhookEndpoint",
    method: "DELETE",
    path: "/webhooks/{endpointId}",
    scope: "webhooks:write",
    tag: "Webhooks",
    summary: "Remove a webhook endpoint",
    description: "Removes the endpoint and its delivery log. Nothing more is sent to it.",
    destructive: true,
    input: z.object({ endpointId: id("webhook endpoint") }),
    actions: ["webhooks#deleteWebhookEndpoint"],
    run: async (ctx, input) => {
      await deleteEndpoint(ctx, await endpoint(ctx, input.endpointId));
      return { removed: true };
    },
  }),
  define({
    id: "listWebhookDeliveries",
    method: "GET",
    path: "/webhooks/{endpointId}/deliveries",
    scope: "webhooks:read",
    tag: "Webhooks",
    summary: "List an endpoint's deliveries",
    description:
      "The endpoint's most recent deliveries, newest first, kept for 30 days: topic, status (pending, retrying, succeeded, failed or cancelled), the last response code, every attempt and the payload.",
    input: z.object({
      endpointId: id("webhook endpoint"),
      limit: z.coerce.number().int().min(1).max(100).default(50).describe("Deliveries to return, 1 to 100."),
    }),
    run: async (ctx, input) => {
      await endpoint(ctx, input.endpointId);
      return { data: (await listDeliveries(ctx.store.id, input.endpointId, input.limit)).map(presentDelivery) };
    },
  }),
  define({
    id: "resendWebhookDelivery",
    method: "POST",
    path: "/webhooks/deliveries/{deliveryId}/resend",
    scope: "webhooks:write",
    tag: "Webhooks",
    summary: "Resend a delivery",
    description:
      "Sends a logged delivery again now, with the same webhook-id, and returns it with the new attempt. Refused with 409 while the endpoint is turned off.",
    input: z.object({ deliveryId: id("delivery") }),
    actions: ["webhooks#resendWebhookDelivery"],
    run: async (ctx, input) => {
      const delivery = (await findDelivery(ctx.store.id, input.deliveryId)) ?? notFound("Delivery");
      return presentDelivery(await resendDelivery(ctx, delivery));
    },
  }),
];
