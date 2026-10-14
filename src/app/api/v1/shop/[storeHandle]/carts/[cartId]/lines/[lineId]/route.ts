import { shopHandler, shopPreflight } from "@/lib/api/http";

export const PATCH = shopHandler("updateCartLine");
export const DELETE = shopHandler("removeCartLine");
export const OPTIONS = shopPreflight;
