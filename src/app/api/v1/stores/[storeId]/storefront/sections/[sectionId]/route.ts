import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getStorefrontSection");
export const PATCH = restHandler("updateStorefrontSection");
export const DELETE = restHandler("removeStorefrontSection");
