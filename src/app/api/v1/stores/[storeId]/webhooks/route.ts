import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listWebhookEndpoints");
export const POST = restHandler("createWebhookEndpoint");
