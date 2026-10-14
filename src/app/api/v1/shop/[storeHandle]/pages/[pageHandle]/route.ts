import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("getShopPage");
export const OPTIONS = shopPreflight;
