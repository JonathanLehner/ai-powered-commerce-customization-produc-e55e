import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getReview");
export const PATCH = restHandler("moderateReview");
export const DELETE = restHandler("deleteReview");
