import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listVariants");
export const PATCH = restHandler("updateVariants");
export const POST = restHandler("createVariant");
