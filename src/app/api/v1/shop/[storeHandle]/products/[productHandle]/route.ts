import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("getShopProduct");
export const OPTIONS = shopPreflight;
