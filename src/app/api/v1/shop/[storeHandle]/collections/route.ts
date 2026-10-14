import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("listShopCollections");
export const OPTIONS = shopPreflight;
