import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("listShopPages");
export const OPTIONS = shopPreflight;
