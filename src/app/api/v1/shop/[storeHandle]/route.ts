import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("getShop");
export const OPTIONS = shopPreflight;
