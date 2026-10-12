import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listCollections");
export const POST = restHandler("createCollection");
