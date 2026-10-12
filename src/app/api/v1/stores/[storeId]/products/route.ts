import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listProducts");
export const POST = restHandler("createProduct");
