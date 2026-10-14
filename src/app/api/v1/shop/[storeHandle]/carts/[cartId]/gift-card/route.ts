import { shopHandler, shopPreflight } from "@/lib/api/http";

export const PUT = shopHandler("applyCartGiftCard");
export const DELETE = shopHandler("removeCartGiftCard");
export const OPTIONS = shopPreflight;
