import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listGiftCards");
export const POST = restHandler("issueGiftCard");
