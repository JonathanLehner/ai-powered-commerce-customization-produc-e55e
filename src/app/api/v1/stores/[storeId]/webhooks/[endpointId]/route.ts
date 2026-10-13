import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getWebhookEndpoint");
export const PATCH = restHandler("updateWebhookEndpoint");
export const DELETE = restHandler("deleteWebhookEndpoint");
