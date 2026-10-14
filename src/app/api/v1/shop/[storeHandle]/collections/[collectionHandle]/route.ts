import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("getShopCollection");
export const OPTIONS = shopPreflight;
