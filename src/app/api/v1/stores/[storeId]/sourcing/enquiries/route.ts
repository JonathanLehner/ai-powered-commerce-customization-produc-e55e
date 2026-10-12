import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listQuoteRequests");
export const POST = restHandler("createQuoteRequest");
