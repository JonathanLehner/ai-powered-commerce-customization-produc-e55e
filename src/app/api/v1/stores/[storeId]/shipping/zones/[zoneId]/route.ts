import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getShippingZone");
export const PATCH = restHandler("updateShippingZone");
export const DELETE = restHandler("deleteShippingZone");
