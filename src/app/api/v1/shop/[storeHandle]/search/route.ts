import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("searchShop");
export const OPTIONS = shopPreflight;
