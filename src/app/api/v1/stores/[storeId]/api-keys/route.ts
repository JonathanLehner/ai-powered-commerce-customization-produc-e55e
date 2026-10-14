import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listApiKeys");
export const POST = restHandler("createApiKey");
