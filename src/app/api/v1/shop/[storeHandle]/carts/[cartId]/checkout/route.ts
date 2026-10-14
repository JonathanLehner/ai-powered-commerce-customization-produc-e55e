import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("startCheckout");
export const OPTIONS = shopPreflight;
