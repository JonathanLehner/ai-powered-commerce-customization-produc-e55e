import { shopHandler, shopPreflight } from "@/lib/api/http";

export const PUT = shopHandler("applyCartDiscount");
export const DELETE = shopHandler("removeCartDiscount");
export const OPTIONS = shopPreflight;
