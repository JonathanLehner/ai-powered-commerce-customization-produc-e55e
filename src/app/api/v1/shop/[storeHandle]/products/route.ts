import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("listShopProducts");
export const OPTIONS = shopPreflight;
