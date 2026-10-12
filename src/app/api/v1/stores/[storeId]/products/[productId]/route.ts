import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getProduct");
export const PATCH = restHandler("updateProduct");
export const DELETE = restHandler("deleteProduct");
