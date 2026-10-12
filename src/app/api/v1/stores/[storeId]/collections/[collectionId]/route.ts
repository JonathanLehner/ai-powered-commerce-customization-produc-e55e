import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getCollection");
export const PATCH = restHandler("updateCollection");
export const DELETE = restHandler("deleteCollection");
