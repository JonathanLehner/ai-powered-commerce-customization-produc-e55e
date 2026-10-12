import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getContent");
export const PATCH = restHandler("updateContent");
export const DELETE = restHandler("deleteContent");
