import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("getCart");
export const OPTIONS = shopPreflight;
