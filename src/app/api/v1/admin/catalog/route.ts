import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listCatalogItems");
export const POST = restHandler("createCatalogItem");
