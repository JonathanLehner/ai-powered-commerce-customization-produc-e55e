import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("addCartLine");
export const OPTIONS = shopPreflight;
